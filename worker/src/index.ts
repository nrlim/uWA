import 'dotenv/config';

import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// INITIALIZATION
// ============================================================================

const prisma = new PrismaClient();
const MEMORY_LIMIT_MB = 1024;

let cachedPhoneNumber: string | null = null;
async function getWorkerPhoneNumber(): Promise<string> {
    if (cachedPhoneNumber) return cachedPhoneNumber;
    if (process.env.WORKER_PHONE_NUMBER) {
        cachedPhoneNumber = process.env.WORKER_PHONE_NUMBER;
        return cachedPhoneNumber;
    }
    const firstInstance = await prisma.instance.findFirst();
    if (firstInstance) {
        cachedPhoneNumber = firstInstance.phoneNumber;
        return cachedPhoneNumber;
    }

    // Fallback: Create one for the first registered user to break deadlock
    const firstUser = await prisma.user.findFirst();
    if (firstUser) {
        cachedPhoneNumber = firstUser.phone;
        return cachedPhoneNumber;
    }

    // No users and no instances. Sleep to prevent PM2 log flood, then throw handled error.
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30s delay
    throw new Error('NO_USERS_FOUND');
}

let cachedInstanceId: string | null = null;
async function getWorkerInstanceId(): Promise<string> {
    if (cachedInstanceId) return cachedInstanceId;
    const phoneNumber = await getWorkerPhoneNumber();
    let instance = await prisma.instance.findUnique({
        where: { phoneNumber }
    });
    if (!instance) {
        const user = await prisma.user.findFirst({ where: { phone: phoneNumber } });
        instance = await prisma.instance.create({
            data: {
                phoneNumber,
                name: `WA ${phoneNumber}`,
                users: user ? { connect: { id: user.id } } : undefined
            }
        });
    }
    cachedInstanceId = instance.id;
    return cachedInstanceId;
}

// Global Socket Reference
let globalSock: any = null;

// Track idle time and timeouts
let lastActiveTime = Date.now();
let lastBroadcastId: string | null = null;
let broadcastStartTime = 0;
let batchMessageCount = 0;
let dailySentCount = 0;
let lastDailyResetDate = new Date().toDateString();

// Rate-limit / fatal error flag
let broadcastHalted = false;
let haltReason = '';

// Presence heartbeat interval reference (for cleanup)
let presenceHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

// Media Cache (Download once per campaign)
let cachedBroadcastId: string | null = null;
let cachedImageUrl: string | null = null;
let cachedMediaBuffer: Buffer | null = null;

// ============================================================================
// 1. UTILITY — Delay / Wait
// ============================================================================

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Random integer in [min, max] (inclusive)
 */
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// 2. SPINTAX — Nested Spintax Parser (Super Spintax)
// ============================================================================

/**
 * Processes nested Spintax like:
 *   {Halo|Hi} {Kak|Gan}, {apa kabar?|semoga {sehat|baik} selalu.}
 *
 * Works from the innermost braces outward so nesting resolves correctly.
 */
function processSpintax(text: string): string {
    let result = text;
    const MAX_DEPTH = 10;
    let depth = 0;

    while (result.includes('{') && depth < MAX_DEPTH) {
        result = result.replace(/\{([^{}]+)\}/g, (_match, content: string) => {
            const options = content.split('|');
            return options[Math.floor(Math.random() * options.length)];
        });
        depth++;
    }

    return result;
}

// ============================================================================
// 3. INVISIBLE ZERO-WIDTH SUFFIX — 1-5 random zero-width characters
// ============================================================================

/**
 * Appends 1–5 random zero-width characters at the end of the message.
 * This guarantees unique MD5 hashes per message without changing visual content.
 *
 * Characters used:
 *   U+200B  Zero-Width Space
 *   U+200C  Zero-Width Non-Joiner
 *   U+200D  Zero-Width Joiner
 *   U+FEFF  Zero-Width No-Break Space
 *   U+2060  Word Joiner
 *   U+2062  Invisible Times
 */
const ZERO_WIDTH_POOL = ['\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060', '\u2062'];

function appendZeroWidthSuffix(text: string): { result: string; suffix: string } {
    const count = randomInt(1, 5);
    let invisible = '';
    let debugKey = '';

    for (let i = 0; i < count; i++) {
        const idx = randomInt(0, ZERO_WIDTH_POOL.length - 1);
        invisible += ZERO_WIDTH_POOL[idx];
        debugKey += idx.toString();
    }

    return {
        result: `${text}${invisible}`,
        suffix: `zw[${count}]:${debugKey}`,
    };
}

// ============================================================================
// 4. HUMAN CLOCK — Sleep 11 PM to 5 AM (configurable per-broadcast)
// ============================================================================

/**
 * Returns true if current hour is within the active sending window.
 * Default Human Clock: 05:00 – 23:00 (sleep during 23:00–05:00)
 */
function isWithinWorkingHours(startHour: number, endHour: number): boolean {
    const currentHour = new Date().getHours();

    if (startHour <= endHour) {
        return currentHour >= startHour && currentHour < endHour;
    } else {
        // Overnight range (unusual but supported)
        return currentHour >= startHour || currentHour < endHour;
    }
}

/**
 * Calculates milliseconds until the next working-hours window opens.
 */
function msUntilWorkingHoursStart(startHour: number): number {
    const now = new Date();
    const target = new Date(now);
    target.setHours(startHour, 0, 0, 0);

    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
}

// ============================================================================
// 5. DAILY LIMIT — Reset counter at midnight, enforce per-broadcast caps
// ============================================================================

function resetDailyCounterIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== lastDailyResetDate) {
        dailySentCount = 0;
        lastDailyResetDate = today;
        console.log('[ANTI-BAN] Daily counter reset for new day.');
    }
}

function isDailyLimitReached(dailyLimit: number): boolean {
    if (dailyLimit <= 0) return false;
    return dailySentCount >= dailyLimit;
}

// ============================================================================
// 6. MEMORY MONITOR — Stay within 1024M
// ============================================================================

function checkMemoryUsage(): { usedMB: number; ok: boolean } {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const ok = usedMB < MEMORY_LIMIT_MB * 0.85;
    return { usedMB, ok };
}

// ============================================================================
// 7. ANTI-BAN LOGGER — Write every protective action to DB
// ============================================================================

async function logAntiBanAction(broadcastId: string, action: string, detail: string): Promise<void> {
    try {
        await prisma.broadcastLog.create({
            data: { broadcastId, action, detail },
        });
        console.log(`[ANTI-BAN][${action}] ${detail}`);
    } catch (e) {
        console.error('[ANTI-BAN] Failed to log action:', e);
    }
}

// ============================================================================
// 8. ERROR CLASSIFICATION — Detect rate-limiting and fatal errors
// ============================================================================

const RATE_LIMIT_PATTERNS = [
    'rate-overlimit',
    'too many',
    'spam',
    'blocked',
    'banned',
];

function isRateLimitError(error: any): boolean {
    const msg = (error?.message || error?.toString?.() || '').toLowerCase();
    const output = (error as Boom)?.output;
    const statusCode = output?.statusCode;

    if (statusCode === 429 || statusCode === 405 || statusCode === 503) {
        return true;
    }

    return RATE_LIMIT_PATTERNS.some((pattern) => msg.includes(pattern));
}

// ============================================================================
// 9. SESSION VALIDATOR — Health check before large batches
// ============================================================================

async function validateSession(): Promise<boolean> {
    if (!globalSock) return false;

    try {
        const user = globalSock?.user;
        if (!user?.id) {
            console.warn('[SESSION] No user ID found in socket state');
            return false;
        }

        await globalSock.presenceSubscribe(`${user.id}@s.whatsapp.net`);
        console.log('[SESSION] Validation OK — socket is healthy.');
        return true;
    } catch (err) {
        console.error('[SESSION] Validation failed:', err);
        return false;
    }
}

// ============================================================================
// 10. PRESENCE HEARTBEAT — Random 'available' pings to simulate active user
// ============================================================================

/**
 * Starts a background interval that randomly triggers 'available' presence
 * to simulate a real user checking WhatsApp periodically.
 * Fires every 30–90 seconds with a 40% chance of sending the ping.
 */
function startPresenceHeartbeat(): void {
    // Clear any previous interval
    if (presenceHeartbeatInterval) {
        clearInterval(presenceHeartbeatInterval);
    }

    const tick = async () => {
        if (!globalSock || broadcastHalted) return;

        // 40% chance to send 'available' presence each tick
        if (Math.random() < 0.4) {
            try {
                await globalSock.sendPresenceUpdate('available');
                console.log('[PRESENCE] 💚 Heartbeat: sent "available" presence');
            } catch {
                // Non-critical
            }
        }
    };

    // Fire every 30–90 seconds (re-randomized each call)
    const scheduleNext = () => {
        const intervalMs = randomInt(30_000, 90_000);
        presenceHeartbeatInterval = setTimeout(async () => {
            await tick();
            scheduleNext();
        }, intervalMs);
    };

    scheduleNext();
    console.log('[PRESENCE] Heartbeat scheduler started.');
}

function stopPresenceHeartbeat(): void {
    if (presenceHeartbeatInterval) {
        clearTimeout(presenceHeartbeatInterval);
        presenceHeartbeatInterval = null;
    }
}

// ============================================================================
// 11. SOCKET CLEANUP — Proper teardown for memory safety on reload/exit
// ============================================================================

/**
 * Gracefully disconnects the socket, clears all event listeners,
 * and closes the Prisma connection pool.
 * Called by SIGINT/SIGTERM handlers and during reconnection.
 */
async function cleanupSocket(reason: string): Promise<void> {
    console.log(`[CLEANUP] Socket cleanup initiated: ${reason}`);

    stopPresenceHeartbeat();

    if (globalSock) {
        try {
            // Remove all event listeners to prevent memory leaks
            globalSock.ev.removeAllListeners('creds.update');
            globalSock.ev.removeAllListeners('connection.update');

            // Close the WebSocket connection
            globalSock.end(undefined);
        } catch (err) {
            console.error('[CLEANUP] Error during socket teardown:', err);
        }
        globalSock = null;
    }
}

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n[SHUTDOWN] Received ${signal}. Shutting down gracefully...`);

    await cleanupSocket(signal);

    try {
        const instanceId = await getWorkerInstanceId();
        await prisma.instance.update({
            where: { id: instanceId },
            data: { status: 'DISCONNECTED', qrCode: '' },
        });
    } catch { /* DB might be gone already */ }

    try {
        await prisma.$disconnect();
    } catch { /* ignore */ }

    console.log('[SHUTDOWN] Cleanup complete. Exiting.');
    process.exit(0);
}

// Register signal handlers for clean shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', async (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    await cleanupSocket('uncaughtException');
    process.exit(1);
});

// ============================================================================
// 12. WHATSAPP CONNECTION (with enhanced reconnection & cleanup)
// ============================================================================

async function connectToWhatsApp() {
    // Clean up any previous socket before creating a new one
    await cleanupSocket('reconnection');

    const phoneNumber = await getWorkerPhoneNumber();
    const { state, saveCreds } = await useMultiFileAuthState('sessions/' + phoneNumber);

    const sock = makeWASocket({
        auth: state,

        logger: pino({ level: 'silent' }) as any,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
    });

    // NOTE: globalSock is only set when connection is 'open' (see below)

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code generated');
            try {
                const instanceId = await getWorkerInstanceId();
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'QR_READY', qrCode: qr },
                });
            } catch (error) {
                console.error('Failed to save QR code to DB:', error);
            }
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            let shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            // Start a new session if logged out
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Session logged out (Code 401). Clearing auth to generate new QR...');
                const fs = await import('fs');
                const path = await import('path');
                const phoneNumber = await getWorkerPhoneNumber();
                const authDir = path.join(process.cwd(), 'sessions', phoneNumber);
                if (fs.existsSync(authDir)) {
                    fs.rmSync(authDir, { recursive: true, force: true });
                }
                shouldReconnect = true;
            }

            console.log(`Connection closed (code: ${statusCode}), reconnecting: ${shouldReconnect}`);

            // Cleanup the dead socket properly
            await cleanupSocket(`connection_close_${statusCode}`);

            try {
                const instanceId = await getWorkerInstanceId();
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'DISCONNECTED', qrCode: '' },
                });
            } catch (error) {
                console.error('Failed to update instance status (DISCONNECTED):', error);
            }

            // Detect rate-limit disconnect → halt all broadcasts
            if (isRateLimitError(lastDisconnect?.error)) {
                broadcastHalted = true;
                haltReason = `Connection closed by WhatsApp (code: ${statusCode}). Possible rate-limit or ban action.`;
                console.error(`[CRITICAL] ${haltReason}`);

                const instanceId = await getWorkerInstanceId();
                await prisma.broadcast.updateMany({
                    where: { status: 'RUNNING', instanceId },
                    data: { status: 'PAUSED_RATE_LIMIT' },
                });
            }

            if (shouldReconnect) {
                const reconnectDelay = randomInt(3000, 10000);
                console.log(`Reconnecting in ${reconnectDelay / 1000}s...`);
                await wait(reconnectDelay);
                await connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Connection opened successfully.');
            globalSock = sock;
            broadcastHalted = false;
            haltReason = '';

            // Start the presence heartbeat for active user simulation
            startPresenceHeartbeat();

            // Update instance status in DB — critical for frontend to show "CONNECTED"
            try {
                const instanceId = await getWorkerInstanceId();
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'CONNECTED', qrCode: '' },
                });
                console.log('[DB] ✅ Instance status updated to CONNECTED.');
            } catch (err) {
                console.error('[DB] ❌ Upsert failed, trying fallback update:', err);
                try {
                    const instanceId = await getWorkerInstanceId();
                    await prisma.instance.updateMany({
                        where: { id: instanceId },
                        data: { status: 'CONNECTED', qrCode: '' },
                    });
                    console.log('[DB] ✅ Fallback update succeeded.');
                } catch (err2) {
                    console.error('[DB] ❌ Fallback update also failed:', err2);
                }
            }

            // Resume any broadcasts that were paused due to disconnection
            try {
                const instanceId = await getWorkerInstanceId();
                const resumed = await prisma.broadcast.updateMany({
                    where: { status: { in: ['PAUSED_RATE_LIMIT', 'PAUSED_WORKING_HOURS'] }, instanceId },
                    data: { status: 'RUNNING' },
                });
                if (resumed.count > 0) {
                    console.log(`[RECONNECT] ♻️ Resumed ${resumed.count} paused broadcast(s).`);
                }
            } catch (err) {
                console.error('[DB] Failed to resume paused broadcasts:', err);
            }
        }
    });

    return sock;
}

// ============================================================================
// 13. COMPOSING PRESENCE — 3–7 seconds typing before each message
// ============================================================================

/**
 * Triggers 'composing' presence for 3–7 seconds before each message.
 * Recipients will see "Typing..." indicator before the message arrives.
 * Returns the actual typing duration used (for anti_banned_meta logging).
 */
async function simulateTyping(jid: string, broadcastId: string, minMs: number = 3000, maxMs: number = 7000): Promise<number> {
    if (!globalSock) return 0;

    const typingDuration = randomInt(minMs, maxMs);

    try {
        // Subscribe to presence first (required for composing to show)
        await globalSock.presenceSubscribe(jid);

        // Set 'composing' status — this triggers "Typing..." on recipient's phone
        await globalSock.sendPresenceUpdate('composing', jid);

        await logAntiBanAction(
            broadcastId,
            'TYPING',
            `Composing ${(typingDuration / 1000).toFixed(1)}s → ${jid}`
        );

        await wait(typingDuration);

        // Clear composing status
        await globalSock.sendPresenceUpdate('paused', jid);
    } catch (err) {
        console.warn('[TYPING] Presence update failed (non-fatal):', err);
    }

    return typingDuration;
}

// ============================================================================
// 14. BATCH COOLING — Mandatory 120–300s pause every 15 messages
// ============================================================================

const BATCH_COOLDOWN_EVERY = 15;
const BATCH_COOLDOWN_MIN_MS = 120 * 1000;   // 120 seconds = 2 minutes
const BATCH_COOLDOWN_MAX_MS = 300 * 1000;   // 300 seconds = 5 minutes

async function applyBatchCoolingIfNeeded(broadcastId: string): Promise<void> {
    batchMessageCount++;

    if (batchMessageCount >= BATCH_COOLDOWN_EVERY) {
        const cooldownMs = randomInt(BATCH_COOLDOWN_MIN_MS, BATCH_COOLDOWN_MAX_MS);
        const cooldownSec = Math.round(cooldownMs / 1000);

        await logAntiBanAction(
            broadcastId,
            'COOLDOWN',
            `Batch cooling: ${cooldownSec}s after ${batchMessageCount} messages`
        );

        console.log(`[BATCH COOL] 🧊 Mandatory rest: ${cooldownSec}s after ${batchMessageCount} messages...`);

        // Set presence to 'unavailable' during cooldown to mimic user away
        if (globalSock) {
            try {
                await globalSock.sendPresenceUpdate('unavailable');
            } catch { /* non-critical */ }
        }

        await wait(cooldownMs);

        // Come back online
        if (globalSock) {
            try {
                await globalSock.sendPresenceUpdate('available');
            } catch { /* non-critical */ }
        }

        // Reset batch counter
        batchMessageCount = 0;
        console.log(`[BATCH COOL] ✅ Cooling complete. Resuming...`);
    }
}

// ============================================================================
// 15. BROADCAST PROCESSOR — Main Loop with all protections
// ============================================================================

async function startBroadcastProcessor() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Anti-Ban Broadcast Processor v3.0');
    console.log('   ├─ Nested Spintax Engine ✓');
    console.log('   ├─ Composing Presence (3–7s) ✓');
    console.log('   ├─ Available Presence Heartbeat ✓');
    console.log('   ├─ Zero-Width Invisible Suffix (1–5 chars) ✓');
    console.log('   ├─ Batch Cooling (every 15 msgs → 120–300s) ✓');
    console.log('   ├─ Human Clock (sleep 23:00–05:00) ✓');
    console.log('   ├─ Daily Send Limits ✓');
    console.log('   ├─ Rate-Limit Detection & Halt ✓');
    console.log('   ├─ Session Pre-Validation ✓');
    console.log('   ├─ anti_banned_meta Logging ✓');
    console.log('   ├─ Socket Cleanup (SIGINT/SIGTERM) ✓');
    console.log('   └─ Memory Monitor (1024MB) ✓');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    while (true) {
        try {
            // ── Memory Check ──────────────────────────────────
            const mem = checkMemoryUsage();
            if (!mem.ok) {
                console.warn(`[MEMORY] ⚠️ High usage: ${mem.usedMB}MB / ${MEMORY_LIMIT_MB}MB — forcing GC`);
                if (global.gc) {
                    global.gc();
                    console.log('[MEMORY] Manual GC triggered.');
                }
            }

            // ── Halt Check ────────────────────────────────────
            if (broadcastHalted) {
                console.log(`[HALT] Broadcast halted: ${haltReason}. Waiting 30s...`);
                await wait(30000);
                continue;
            }

            // ── Socket Readiness ──────────────────────────────
            if (!globalSock) {
                await wait(5000);
                continue;
            }

            // ── Find Active Broadcast ─────────────────────────
            const instanceId = await getWorkerInstanceId();
            const broadcast = await prisma.broadcast.findFirst({
                where: { status: { in: ['PENDING', 'RUNNING'] }, instanceId },
                orderBy: { updatedAt: 'asc' },
                include: {
                    user: true, // Fetch user to check credits
                    messages: {
                        where: { status: 'PENDING' },
                        take: 1,
                    },
                },
            });

            // ── Idle Auto-Refresh (5 minutes) ─────────────────
            // If no active broadcast is found, check how long we've been idle.
            if (!broadcast) {
                const idleTime = Date.now() - lastActiveTime;
                if (idleTime > 5 * 60 * 1000) {
                    console.log(`[AUTO-REFRESH] Worker idle for 5+ minutes. Restarting process to free memory...`);
                    await cleanupSocket('idle_refresh');
                    process.exit(0); // PM2 will automatically restart this
                }
                await wait(5000);
                continue;
            }

            // We have a broadcast to process, update last active
            lastActiveTime = Date.now();

            // ── Campaign Global Timeout ──────────────────────────
            if (lastBroadcastId !== broadcast.id) {
                lastBroadcastId = broadcast.id;
                broadcastStartTime = Date.now();
            } else {
                // If the same broadcast is running, check if it's taking an unreasonable amount of time
                // E.g., over 3 hours for one campaign without finishing
                const maxCampaignDuration = 3 * 60 * 60 * 1000; // 3 hours
                if (Date.now() - broadcastStartTime > maxCampaignDuration) {
                    console.error(`[TIMEOUT] Broadcast ${broadcast.id} exceeded global timeout! Force restarting worker...`);
                    broadcastHalted = true;
                    // Failsafe exit so PM2 resets everything
                    process.exit(1);
                }
            }

            // ── Credit Check Guard ────────────────────────────
            if (broadcast.user.credit <= 0) {
                await logAntiBanAction(
                    broadcast.id,
                    'CREDIT_EXHAUSTED',
                    `User ${broadcast.user.username} ran out of credits. Pausing broadcast.`
                );

                console.warn(`[CREDIT] ⛔ User ${broadcast.user.username} has 0 credits. Pausing broadcast.`);

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'PAUSED_NO_CREDIT' } // Ensure this status is handled or just use FAILED/PAUSED
                });

                continue;
            }

            // ── Session Validation (on first message of batch) ───
            if (broadcast.status === 'PENDING') {
                const memStart = checkMemoryUsage();
                console.log(`[LIFECYCLE] Starting broadcast "${broadcast.name}". Initial Memory: ${memStart.usedMB}MB`);
                console.log(`[SESSION] Validating session before "${broadcast.name}"...`);
                const sessionOk = await validateSession();

                await logAntiBanAction(
                    broadcast.id,
                    'SESSION_VALIDATE',
                    sessionOk ? 'Session healthy — starting broadcast' : 'Session unhealthy — will retry'
                );

                if (!sessionOk) {
                    console.warn('[SESSION] Session invalid. Delaying 10s...');
                    await wait(10000);
                    continue;
                }

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'RUNNING' },
                });

                // Reset batch counter for new broadcast
                batchMessageCount = 0;
            }

            // ── Human Clock Gate ──────────────────────────────
            const workStart = broadcast.workingHourStart ?? 5;
            const workEnd = broadcast.workingHourEnd ?? 23;

            if (!isWithinWorkingHours(workStart, workEnd)) {
                const sleepMs = msUntilWorkingHoursStart(workStart);
                const sleepMin = Math.round(sleepMs / 60000);

                await logAntiBanAction(
                    broadcast.id,
                    'WORKING_HOURS_PAUSE',
                    `SLEEP MODE: Outside hours (${workStart}:00-${workEnd}:00). Sleeping ~${sleepMin} min.`
                );

                console.log(`[HUMAN CLOCK] 🌙 Sleep Mode activated. Pausing ~${sleepMin} min...`);

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'PAUSED_WORKING_HOURS' },
                });

                // Set presence to unavailable during sleep
                if (globalSock) {
                    try {
                        await globalSock.sendPresenceUpdate('unavailable');
                    } catch { /* non-critical */ }
                }

                // Sleep in 60-second chunks
                const chunks = Math.ceil(sleepMs / 60000);
                for (let i = 0; i < chunks; i++) {
                    await wait(Math.min(60000, sleepMs - i * 60000));
                    if (broadcastHalted) break;
                }

                // Wake up
                if (globalSock) {
                    try {
                        await globalSock.sendPresenceUpdate('available');
                    } catch { /* non-critical */ }
                }

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'RUNNING' },
                });

                console.log(`[HUMAN CLOCK] ☀️ Waking up. Resuming broadcast.`);
                continue;
            }

            // ── Daily Limit Gate ──────────────────────────────
            resetDailyCounterIfNeeded();
            const dailyLimit = broadcast.dailyLimit ?? 0;

            if (isDailyLimitReached(dailyLimit)) {
                const sleepMs = msUntilWorkingHoursStart(workStart);
                const sleepHrs = (sleepMs / 3600000).toFixed(1);

                await logAntiBanAction(
                    broadcast.id,
                    'COOLDOWN',
                    `Daily limit reached (${dailySentCount}/${dailyLimit}). Pausing ~${sleepHrs}h.`
                );

                console.log(`[DAILY LIMIT] 📊 Reached ${dailySentCount}/${dailyLimit}. Pausing ~${sleepHrs}h...`);

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'PAUSED_WORKING_HOURS' },
                });

                const fiveMin = 5 * 60 * 1000;
                const totalChunks = Math.ceil(sleepMs / fiveMin);
                for (let i = 0; i < totalChunks; i++) {
                    await wait(Math.min(fiveMin, sleepMs - i * fiveMin));
                    resetDailyCounterIfNeeded();
                    if (!isDailyLimitReached(dailyLimit)) break;
                    if (broadcastHalted) break;
                }

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'RUNNING' },
                });

                continue;
            }

            // ── Get Next Message ──────────────────────────────
            const messageTask = broadcast.messages[0];

            if (!messageTask) {
                const remaining = await prisma.message.count({
                    where: { broadcastId: broadcast.id, status: 'PENDING' },
                });

                if (remaining === 0) {
                    const memEnd = checkMemoryUsage();
                    console.log(`[LIFECYCLE] Broadcast "${broadcast.name}" completed. Final Memory: ${memEnd.usedMB}MB`);

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'COMPLETED' },
                    });

                    batchMessageCount = 0;

                    // 1. Worker Lifecycle Management (onComplete trigger)
                    // 5. Resource Efficiency
                    cachedMediaBuffer = null;
                    cachedImageUrl = null;

                    // We also reset lastActiveTime when finished to start the 5-min idle timer properly
                    lastActiveTime = Date.now();
                    lastBroadcastId = null;

                    // Optionally, remove temporary event listeners if any were added outside the global array
                    // globalSock?.ev.removeAllListeners('messages.upsert'); 

                    console.log(`[LIFECYCLE] Cleanup finished for "${broadcast.name}". Worker is now idle.`);
                }
                await wait(2000);
                continue;
            }

            // ── Format Recipient JID ──────────────────────────
            let number = messageTask.recipient.trim().replace(/\D/g, '');
            if (number.startsWith('08')) {
                number = '62' + number.substring(1);
            }
            const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

            // ── Process Spintax ───────────────────────────────
            const spintaxResult = processSpintax(broadcast.message);
            await logAntiBanAction(broadcast.id, 'SPINTAX', `"${spintaxResult.substring(0, 100)}"`);

            // ── Append Zero-Width Invisible Suffix ────────────
            const { result: finalContent, suffix: zwSuffix } = appendZeroWidthSuffix(spintaxResult);
            await logAntiBanAction(broadcast.id, 'UNIQUE_SUFFIX', zwSuffix);

            // ── Simulate Typing (3–7 seconds) ─────────────────
            // ── Simulate Typing (3–7s normally, +2-4s for media) ──
            const hasMedia = !!(broadcast as any).imageUrl;
            const typingMin = hasMedia ? 5000 : 3000;
            const typingMax = hasMedia ? 11000 : 7000;

            const typingDurationMs = await simulateTyping(jid, broadcast.id, typingMin, typingMax);

            // ── Calculate Delay (will use after send) ─────────
            const minDelay = (broadcast.delayMin || 20) * 1000;
            const maxDelay = (broadcast.delayMax || 60) * 1000;
            const delay = randomInt(minDelay, maxDelay);

            // ── Build anti_banned_meta payload ────────────────
            const antiBannedMeta = {
                spintaxVariant: spintaxResult.substring(0, 200),
                zwSuffix,
                typingDurationMs,
                delayAfterMs: delay,
                batchIndex: batchMessageCount + 1,
                dailyIndex: dailySentCount + 1,
                memoryMB: checkMemoryUsage().usedMB,
                timestamp: new Date().toISOString(),
                hasMedia,
            };

            // ── Send Message ──────────────────────────────────
            console.log(`📤 Sending to ${jid} [batch #${antiBannedMeta.batchIndex}]${hasMedia ? ' + 🖼️ Media' : ''}...`);

            let messageStatusUpdated = false;
            try {
                if (!globalSock) {
                    throw new Error('Socket disconnected before send');
                }

                if (hasMedia) {
                    const imageUrl = (broadcast as any).imageUrl;
                    let mediaPayload: any = { url: imageUrl };

                    // Smart Media Update Logic: Re-download if broadcast changes OR imageUrl changes
                    // URL is like /uploads/filename.jpg
                    if (cachedBroadcastId !== broadcast.id || cachedImageUrl !== imageUrl) {
                        cachedBroadcastId = broadcast.id;
                        cachedImageUrl = imageUrl;
                        cachedMediaBuffer = null;
                        console.log(`[CACHE] New or updated media for broadcast ${broadcast.id} — clearing media cache.`);
                    }

                    if (!cachedMediaBuffer) {
                        // Optimization: Try to read from local disk to save bandwidth/download time
                        // URL is like /uploads/filename.jpg
                        if (imageUrl.startsWith('/')) {
                            // Try resolving in current dir (e.g. running from root)
                            let localPath = path.join(process.cwd(), 'public', imageUrl);

                            // If not found, try parent dir (e.g. running from /worker)
                            if (!fs.existsSync(localPath)) {
                                localPath = path.join(process.cwd(), '../public', imageUrl);
                            }

                            if (fs.existsSync(localPath)) {
                                cachedMediaBuffer = fs.readFileSync(localPath);
                                console.log('[MEDIA] Loaded into memory from local file:', localPath);
                            } else {
                                console.warn('[MEDIA] Local file not found:', imageUrl);
                            }
                        } else if (imageUrl.startsWith('http')) {
                            // Remote URL (Supabase or other) — download once
                            try {
                                console.log('[MEDIA] Downloading from remote URL:', imageUrl);
                                const res = await fetch(imageUrl);
                                if (res.ok) {
                                    const arrayBuffer = await res.arrayBuffer();
                                    cachedMediaBuffer = Buffer.from(arrayBuffer);
                                    console.log(`[MEDIA] Downloaded and cached ${cachedMediaBuffer.length} bytes.`);
                                } else {
                                    console.error('[MEDIA] Failed to download media:', res.statusText);
                                }
                            } catch (err) {
                                console.error('[MEDIA] Error downloading media:', err);
                            }
                        }
                    } else {
                        // console.log('[MEDIA] Using cached buffer');
                    }

                    if (cachedMediaBuffer) {
                        mediaPayload = cachedMediaBuffer;
                    }

                    // Fallback to URL if cache failed (Baileys might fetch it, or it might be null/invalid if local file missing)
                    // If mediaPayload is still { url: ... }, Baileys handles it.

                    // Wrap sending in a Promise.race to prevent hanging
                    const sendMediaPromise = globalSock.sendMessage(jid, {
                        image: mediaPayload,
                        caption: finalContent
                    });
                    const timeoutMediaPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Send Media Timeout (60s)')), 60000));

                    await Promise.race([sendMediaPromise, timeoutMediaPromise]);
                } else {
                    const sendTextPromise = globalSock.sendMessage(jid, { text: finalContent });
                    const timeoutTextPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Send Text Timeout (30s)')), 30000));

                    await Promise.race([sendTextPromise, timeoutTextPromise]);
                }

                await prisma.message.update({
                    where: { id: messageTask.id },
                    data: {
                        status: 'SENT',
                        sentAt: new Date(),
                        content: spintaxResult,
                        antiBannedMeta: antiBannedMeta as any,
                    },
                });

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { sent: { increment: 1 } },
                });

                // Deduct user credit
                await prisma.user.update({
                    where: { id: broadcast.userId },
                    data: { credit: { decrement: 1 } },
                });

                messageStatusUpdated = true;
                dailySentCount++;
                console.log(`✅ Sent. [Batch: ${batchMessageCount + 1}/15 | Daily: ${dailySentCount}/${dailyLimit || '∞'}]`);
            } catch (err: any) {
                console.error(`❌ Failed to send to ${jid}:`, err?.message || err);

                // ── Rate-Limit Detection on Send Error ────────
                if (isRateLimitError(err)) {
                    broadcastHalted = true;
                    haltReason = `Rate-limit on send: ${err?.message || 'Unknown'}`;

                    await logAntiBanAction(broadcast.id, 'RATE_LIMIT_PAUSE', haltReason);

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'PAUSED_RATE_LIMIT' },
                    });

                    console.error(`[CRITICAL] 🛑 ${haltReason}`);
                    messageStatusUpdated = true; // Avoid pushing to failed, let it retry later
                    continue;
                }

                // Normal failure
                await prisma.message.update({
                    where: { id: messageTask.id },
                    data: {
                        status: 'FAILED',
                        error: err?.message || 'Unknown Error',
                        antiBannedMeta: antiBannedMeta as any,
                    },
                });

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { failed: { increment: 1 } },
                });

                messageStatusUpdated = true;
            } finally {
                if (!messageStatusUpdated) {
                    try {
                        console.warn(`[FAILSAFE] Message ${messageTask.id} process failed/hung and was not updated. Forcing FAILED status.`);
                        await prisma.message.update({
                            where: { id: messageTask.id },
                            data: {
                                status: 'FAILED',
                                error: 'Unhandled Error/Timeout during processing',
                                antiBannedMeta: antiBannedMeta as any,
                            },
                        });
                        await prisma.broadcast.update({
                            where: { id: broadcast.id },
                            data: { failed: { increment: 1 } },
                        });
                    } catch (fatalErr) {
                        console.error('[FATAL] Failed to update message status in finally block:', fatalErr);
                    }
                }
            }

            // ── Batch Cooling (every 15 messages) ─────────────
            await applyBatchCoolingIfNeeded(broadcast.id);

            // ── Variable Random Delay ─────────────────────────
            console.log(`⏳ Waiting ${(delay / 1000).toFixed(1)}s before next message...`);
            await wait(delay);

        } catch (e: any) {
            console.error('Error in broadcast loop:', e);

            if (isRateLimitError(e)) {
                broadcastHalted = true;
                haltReason = `Fatal rate-limit in main loop: ${e?.message}`;
                console.error(`[CRITICAL] 🛑 ${haltReason}`);
            }

            await wait(5000);
        }
    }
}

// ============================================================================
// 16. DISCONNECT WATCHER — Polls DB for DISCONNECTING signal from dashboard
// ============================================================================

let disconnectWatcherInterval: ReturnType<typeof setInterval> | null = null;

function startDisconnectWatcher(): void {
    if (disconnectWatcherInterval) return;

    disconnectWatcherInterval = setInterval(async () => {
        try {
            const instanceId = await getWorkerInstanceId();
            const instance = await prisma.instance.findFirst({
                where: { id: instanceId },
            });

            if (instance?.status === 'DISCONNECTING') {
                console.log('[DISCONNECT] Dashboard requested disconnect. Logging out...');
                clearInterval(disconnectWatcherInterval!);
                disconnectWatcherInterval = null;

                // Stop all ongoing work
                stopPresenceHeartbeat();

                if (globalSock) {
                    try {
                        // logout() sends a proper logout to WhatsApp servers
                        // This will trigger connection.update with loggedOut code
                        // so the reconnect logic won't fire (shouldReconnect = false)
                        await globalSock.logout();
                        console.log('[DISCONNECT] Logout sent to WhatsApp successfully.');
                    } catch (err) {
                        console.error('[DISCONNECT] Error during logout, forcing cleanup:', err);
                        // Force cleanup even if logout fails
                        await cleanupSocket('forced_disconnect');
                    }
                }

                // Clear the auth state so a fresh QR is generated on reconnect
                const fs = await import('fs');
                const path = await import('path');
                const phoneNumber = await getWorkerPhoneNumber();
                const authDir = path.join(process.cwd(), 'sessions', phoneNumber);
                if (fs.existsSync(authDir)) {
                    fs.rmSync(authDir, { recursive: true, force: true });
                    console.log('[DISCONNECT] Auth state cleared.');
                }

                // clear media cache
                cachedMediaBuffer = null;
                cachedImageUrl = null;

                // Update DB status
                const instanceId = await getWorkerInstanceId();
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'DISCONNECTED', qrCode: '' },
                });

                console.log('[DISCONNECT] Disconnected successfully. Restarting for new QR...');

                // Wait a moment then reconnect to show a fresh QR
                await wait(3000);
                await connectToWhatsApp();
                startDisconnectWatcher(); // Re-enable watcher after reconnect
            }
        } catch (err) {
            // Silently ignore polling errors
        }
    }, 3000); // Poll every 3 seconds

    console.log('[DISCONNECT WATCHER] Started — listening for dashboard disconnect requests.');
}

// ============================================================================
// 17. MAIN EXECUTION
// ============================================================================

(async () => {
    try {
        console.log('═══════════════════════════════════════════════════');
        console.log('  uWA Worker — Anti-Ban Enhanced Engine v3.0');
        console.log(`  Memory Limit: ${MEMORY_LIMIT_MB}MB`);
        console.log(`  Human Clock: Active 05:00–23:00`);
        console.log(`  Batch Cool: Every 15 msgs → 120–300s rest`);
        console.log(`  Typing: 3–7s composing before each send`);
        console.log(`  Zero-Width: 1–5 invisible chars per message`);
        console.log(`  Time: ${new Date().toISOString()}`);
        console.log('═══════════════════════════════════════════════════');

        await connectToWhatsApp();
        startBroadcastProcessor();
        startDisconnectWatcher();
    } catch (e: any) {
        if (e.message === 'NO_USERS_FOUND') {
            console.log('⏳ Worker is sleeping. Waiting for at least 1 user/instance to be registered in the database...');
            process.exit(0); // Exit cleanly so PM2 restarts quietly and hits the sleep delay again
        } else {
            console.error('Fatal Error:', e);
            process.exit(1);
        }
    }
})();
