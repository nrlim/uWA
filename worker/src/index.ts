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
const QR_TIMEOUT_MS = 60_000; // 60 seconds before QR expires and regenerates
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ── Socket Pool — one socket per instanceId ────────────────────────
interface SocketEntry {
    sock: any;
    instanceId: string;
    qrTimeout: ReturnType<typeof setTimeout> | null;
    qrAttempts: number;
    presenceInterval: ReturnType<typeof setTimeout> | null;
}

const socketPool: Map<string, SocketEntry> = new Map();

// ── Resolve identity helpers ────────────────────────────────────────

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

// Global Socket Reference (points to the active socket for this worker)
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

/**
 * Get the session auth path for a given instanceId.
 * Each instance gets its own isolated folder: ./sessions/auth-{instanceId}
 */
function getSessionPath(instanceId: string): string {
    return path.join(SESSIONS_DIR, `auth-${instanceId}`);
}

/**
 * Delete the session auth folder for a given instanceId.
 * Used when the user logs out or when a fresh QR is needed.
 */
function deleteSessionFolder(instanceId: string): void {
    const sessionPath = getSessionPath(instanceId);
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[Connection] 🗑️ Session folder deleted for instance: ${instanceId} (${sessionPath})`);
    }
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

function isWithinWorkingHours(startHour: number, endHour: number): boolean {
    const currentHour = new Date().getHours();

    if (startHour <= endHour) {
        return currentHour >= startHour && currentHour < endHour;
    } else {
        return currentHour >= startHour || currentHour < endHour;
    }
}

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

function startPresenceHeartbeat(instanceId: string): void {
    const entry = socketPool.get(instanceId);
    if (!entry) return;

    // Clear any previous interval
    if (entry.presenceInterval) {
        clearTimeout(entry.presenceInterval);
        entry.presenceInterval = null;
    }

    const tick = async () => {
        const currentEntry = socketPool.get(instanceId);
        if (!currentEntry?.sock || broadcastHalted) return;

        // 40% chance to send 'available' presence each tick
        if (Math.random() < 0.4) {
            try {
                await currentEntry.sock.sendPresenceUpdate('available');
                console.log('[PRESENCE] 💚 Heartbeat: sent "available" presence');
            } catch {
                // Non-critical
            }
        }
    };

    // Fire every 30–90 seconds (re-randomized each call)
    const scheduleNext = () => {
        const currentEntry = socketPool.get(instanceId);
        if (!currentEntry) return;

        const intervalMs = randomInt(30_000, 90_000);
        currentEntry.presenceInterval = setTimeout(async () => {
            await tick();
            scheduleNext();
        }, intervalMs);
    };

    scheduleNext();
    console.log(`[PRESENCE] Heartbeat scheduler started for instance: ${instanceId}`);
}

function stopPresenceHeartbeat(instanceId: string): void {
    const entry = socketPool.get(instanceId);
    if (entry?.presenceInterval) {
        clearTimeout(entry.presenceInterval);
        entry.presenceInterval = null;
    }
}

// ============================================================================
// 11. SOCKET CLEANUP — Proper teardown for memory safety on reload/exit
// ============================================================================

/**
 * Cleans up a specific socket from the pool by instanceId.
 * Removes event listeners, closes the WS connection, and clears timers.
 */
async function cleanupSocketForInstance(instanceId: string, reason: string): Promise<void> {
    console.log(`[CLEANUP] Socket cleanup for instance ${instanceId}: ${reason}`);

    const entry = socketPool.get(instanceId);
    if (!entry) {
        console.log(`[CLEANUP] No socket found in pool for instance ${instanceId}`);
        return;
    }

    // Clear QR timeout
    if (entry.qrTimeout) {
        clearTimeout(entry.qrTimeout);
        entry.qrTimeout = null;
    }

    // Stop presence heartbeat
    stopPresenceHeartbeat(instanceId);

    try {
        // Remove all event listeners to prevent memory leaks
        entry.sock.ev.removeAllListeners('creds.update');
        entry.sock.ev.removeAllListeners('connection.update');

        // Close the WebSocket connection
        entry.sock.end(undefined);
    } catch (err) {
        console.error(`[CLEANUP] Error during socket teardown for ${instanceId}:`, err);
    }

    // Remove from pool
    socketPool.delete(instanceId);

    // If this was the global socket, clear the reference
    if (globalSock === entry.sock) {
        globalSock = null;
    }
}

/**
 * Legacy cleanup — cleans ALL sockets (used for graceful shutdown)
 */
async function cleanupAllSockets(reason: string): Promise<void> {
    console.log(`[CLEANUP] Cleaning up ALL sockets: ${reason}`);
    const instanceIds = [...socketPool.keys()];
    for (const id of instanceIds) {
        await cleanupSocketForInstance(id, reason);
    }
    globalSock = null;
}

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n[SHUTDOWN] Received ${signal}. Shutting down gracefully...`);

    await cleanupAllSockets(signal);

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
    await cleanupAllSockets('uncaughtException');
    process.exit(1);
});

// ============================================================================
// 12. WHATSAPP CONNECTION (with dynamic paths, QR timeout & socket pool)
// ============================================================================

async function connectToWhatsApp() {
    const instanceId = await getWorkerInstanceId();

    console.log(`[Connection] ═══════════════════════════════════════════`);
    console.log(`[Connection] Initializing session for Instance: ${instanceId}`);
    console.log(`[Connection] ═══════════════════════════════════════════`);

    // ── Check if a socket for this instance already exists in the pool ──
    const existingEntry = socketPool.get(instanceId);
    if (existingEntry) {
        console.log(`[Connection] Socket already exists for instance ${instanceId}. Cleaning up before reconnect...`);
        await cleanupSocketForInstance(instanceId, 'reconnection');
    }

    // ── Dynamic session path: ./sessions/auth-{instanceId} ──
    const sessionPath = getSessionPath(instanceId);
    console.log(`[Connection] Session path: ${sessionPath}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
    });

    // ── Register in socket pool ──
    const poolEntry: SocketEntry = {
        sock,
        instanceId,
        qrTimeout: null,
        qrAttempts: 0,
        presenceInterval: null,
    };
    socketPool.set(instanceId, poolEntry);

    console.log(`[Connection] Socket created and added to pool. Pool size: ${socketPool.size}`);

    // ── Creds persistence ──
    sock.ev.on('creds.update', saveCreds);

    // ── Connection lifecycle handler ──
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // ── Detailed state logging ──
        console.log(`[Connection] Current State: ${update.connection || 'unchanged'} | Instance: ${instanceId}`);
        if (update.receivedPendingNotifications !== undefined) {
            console.log(`[Connection] Pending notifications received: ${update.receivedPendingNotifications}`);
        }

        // ── QR Code Received ──
        if (qr) {
            const entry = socketPool.get(instanceId);
            if (entry) {
                entry.qrAttempts++;
                console.log(`[Connection] QR Received for Instance: ${instanceId} (attempt #${entry.qrAttempts})`);

                // ── Clear any previous QR timeout ──
                if (entry.qrTimeout) {
                    clearTimeout(entry.qrTimeout);
                    entry.qrTimeout = null;
                }

                // ── Save QR to database immediately ──
                try {
                    await prisma.instance.update({
                        where: { id: instanceId },
                        data: { status: 'QR_READY', qrCode: qr },
                    });
                    console.log(`[Connection] ✅ QR saved to DB for Instance: ${instanceId}`);
                } catch (error) {
                    console.error(`[Connection] ❌ Failed to save QR code to DB for ${instanceId}:`, error);
                }

                // ── QR Timeout Logic (60 seconds) ──
                // If QR is not scanned within 60s, the socket is ready for a new one.
                // After 5 failed attempts, close and let the user request a new connection.
                entry.qrTimeout = setTimeout(async () => {
                    const currentEntry = socketPool.get(instanceId);
                    if (!currentEntry) return;

                    console.log(`[Connection] ⏰ QR timeout (${QR_TIMEOUT_MS / 1000}s) for Instance: ${instanceId}. Attempt #${currentEntry.qrAttempts}`);

                    if (currentEntry.qrAttempts >= 5) {
                        console.log(`[Connection] ⚠️ QR not scanned after ${currentEntry.qrAttempts} attempts. Closing socket for Instance: ${instanceId}. Will auto-retry in 30s.`);

                        await cleanupSocketForInstance(instanceId, 'qr_timeout_max_attempts');

                        try {
                            await prisma.instance.update({
                                where: { id: instanceId },
                                data: { status: 'DISCONNECTED', qrCode: '' },
                            });
                        } catch { /* ignore */ }

                        // Auto-retry after a delay — will generate a fresh QR
                        await wait(30_000);
                        console.log(`[Connection] 🔄 Auto-retrying connection for Instance: ${instanceId} after QR timeout...`);
                        await connectToWhatsApp();
                    }
                    // If < 5 attempts, Baileys will automatically generate a new QR 
                    // which will fire another connection.update with a new qr value.
                }, QR_TIMEOUT_MS);
            }
        }

        // ── Connection Closed ──
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            let shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[Connection] ❌ Connection closed for Instance: ${instanceId} (code: ${statusCode})`);

            // ── Logged out → delete session folder for fresh QR ──
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[Connection] 🔐 Session logged out (Code 401) for Instance: ${instanceId}. Clearing auth for fresh QR...`);
                deleteSessionFolder(instanceId);
                shouldReconnect = true;
            }

            // ── Cleanup the dead socket ──
            await cleanupSocketForInstance(instanceId, `connection_close_${statusCode}`);

            // ── Update DB status ──
            try {
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'DISCONNECTED', qrCode: '' },
                });
                console.log(`[Connection] DB updated to DISCONNECTED for Instance: ${instanceId}`);
            } catch (error) {
                console.error(`[Connection] Failed to update instance status (DISCONNECTED) for ${instanceId}:`, error);
            }

            // ── Detect rate-limit disconnect → halt all broadcasts ──
            if (isRateLimitError(lastDisconnect?.error)) {
                broadcastHalted = true;
                haltReason = `Connection closed by WhatsApp (code: ${statusCode}). Possible rate-limit or ban action.`;
                console.error(`[CRITICAL] ${haltReason}`);

                await prisma.broadcast.updateMany({
                    where: { status: 'RUNNING', instanceId },
                    data: { status: 'PAUSED_RATE_LIMIT' },
                });
            }

            // ── Reconnect with random delay ──
            if (shouldReconnect) {
                const reconnectDelay = randomInt(3000, 10000);
                console.log(`[Connection] 🔄 Reconnecting Instance: ${instanceId} in ${reconnectDelay / 1000}s...`);
                await wait(reconnectDelay);
                await connectToWhatsApp();
            }
        }

        // ── Connection Opened Successfully ──
        if (connection === 'open') {
            console.log(`[Connection] ✅ Connection opened for Instance: ${instanceId}`);

            // Clear any QR timeout since we're connected
            const entry = socketPool.get(instanceId);
            if (entry?.qrTimeout) {
                clearTimeout(entry.qrTimeout);
                entry.qrTimeout = null;
                entry.qrAttempts = 0;
            }

            // Set as the global active socket
            globalSock = sock;
            broadcastHalted = false;
            haltReason = '';

            // Start the presence heartbeat for active user simulation
            startPresenceHeartbeat(instanceId);

            // Update instance status in DB
            try {
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'CONNECTED', qrCode: '' },
                });
                console.log(`[Connection] ✅ Instance ${instanceId} status updated to CONNECTED.`);
            } catch (err) {
                console.error(`[Connection] ❌ Failed to update CONNECTED status for ${instanceId}:`, err);
                try {
                    await prisma.instance.updateMany({
                        where: { id: instanceId },
                        data: { status: 'CONNECTED', qrCode: '' },
                    });
                    console.log(`[Connection] ✅ Fallback update succeeded for ${instanceId}.`);
                } catch (err2) {
                    console.error(`[Connection] ❌ Fallback update also failed for ${instanceId}:`, err2);
                }
            }

            // Resume any broadcasts that were paused due to disconnection
            try {
                const resumed = await prisma.broadcast.updateMany({
                    where: { status: { in: ['PAUSED_RATE_LIMIT', 'PAUSED_WORKING_HOURS'] }, instanceId },
                    data: { status: 'RUNNING' },
                });
                if (resumed.count > 0) {
                    console.log(`[Connection] ♻️ Resumed ${resumed.count} paused broadcast(s) for Instance: ${instanceId}.`);
                }
            } catch (err) {
                console.error(`[Connection] Failed to resume paused broadcasts for ${instanceId}:`, err);
            }
        }
    });

    return sock;
}

// ============================================================================
// 13. COMPOSING PRESENCE — 3–7 seconds typing before each message
// ============================================================================

async function simulateTyping(jid: string, broadcastId: string, minMs: number = 3000, maxMs: number = 7000): Promise<number> {
    if (!globalSock) return 0;

    const typingDuration = randomInt(minMs, maxMs);

    try {
        await globalSock.presenceSubscribe(jid);
        await globalSock.sendPresenceUpdate('composing', jid);

        await logAntiBanAction(
            broadcastId,
            'TYPING',
            `Composing ${(typingDuration / 1000).toFixed(1)}s → ${jid}`
        );

        await wait(typingDuration);
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

        if (globalSock) {
            try {
                await globalSock.sendPresenceUpdate('unavailable');
            } catch { /* non-critical */ }
        }

        await wait(cooldownMs);

        if (globalSock) {
            try {
                await globalSock.sendPresenceUpdate('available');
            } catch { /* non-critical */ }
        }

        batchMessageCount = 0;
        console.log(`[BATCH COOL] ✅ Cooling complete. Resuming...`);
    }
}

// ============================================================================
// 15. BROADCAST PROCESSOR — Main Loop with all protections
// ============================================================================

async function startBroadcastProcessor() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Anti-Ban Broadcast Processor v4.0');
    console.log('   ├─ Dynamic Session Paths (auth-${instanceId}) ✓');
    console.log('   ├─ Socket Pool with Instance Isolation ✓');
    console.log('   ├─ QR Timeout (60s auto-regenerate) ✓');
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

                // Close idle sockets to free memory
                for (const [id, entry] of socketPool.entries()) {
                    if (entry.sock !== globalSock) {
                        console.log(`[MEMORY] Closing idle socket for instance ${id} to free memory.`);
                        await cleanupSocketForInstance(id, 'memory_pressure');
                    }
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
                    user: true,
                    messages: {
                        where: { status: 'PENDING' },
                        take: 1,
                    },
                },
            });

            // ── Idle Auto-Refresh (5 minutes) ─────────────────
            if (!broadcast) {
                const idleTime = Date.now() - lastActiveTime;
                if (idleTime > 5 * 60 * 1000) {
                    console.log(`[AUTO-REFRESH] Worker idle for 5+ minutes. Restarting process to free memory...`);
                    await cleanupAllSockets('idle_refresh');
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
                const maxCampaignDuration = 3 * 60 * 60 * 1000; // 3 hours
                if (Date.now() - broadcastStartTime > maxCampaignDuration) {
                    console.error(`[TIMEOUT] Broadcast ${broadcast.id} exceeded global timeout! Force restarting worker...`);
                    broadcastHalted = true;
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
                    data: { status: 'PAUSED_NO_CREDIT' }
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

                if (globalSock) {
                    try {
                        await globalSock.sendPresenceUpdate('unavailable');
                    } catch { /* non-critical */ }
                }

                const chunks = Math.ceil(sleepMs / 60000);
                for (let i = 0; i < chunks; i++) {
                    await wait(Math.min(60000, sleepMs - i * 60000));
                    if (broadcastHalted) break;
                }

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
                    cachedMediaBuffer = null;
                    cachedImageUrl = null;
                    lastActiveTime = Date.now();
                    lastBroadcastId = null;

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

                    if (cachedBroadcastId !== broadcast.id || cachedImageUrl !== imageUrl) {
                        cachedBroadcastId = broadcast.id;
                        cachedImageUrl = imageUrl;
                        cachedMediaBuffer = null;
                        console.log(`[CACHE] New or updated media for broadcast ${broadcast.id} — clearing media cache.`);
                    }

                    if (!cachedMediaBuffer) {
                        if (imageUrl.startsWith('/')) {
                            let localPath = path.join(process.cwd(), 'public', imageUrl);
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
                    }

                    if (cachedMediaBuffer) {
                        mediaPayload = cachedMediaBuffer;
                    }

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

                if (isRateLimitError(err)) {
                    broadcastHalted = true;
                    haltReason = `Rate-limit on send: ${err?.message || 'Unknown'}`;

                    await logAntiBanAction(broadcast.id, 'RATE_LIMIT_PAUSE', haltReason);

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'PAUSED_RATE_LIMIT' },
                    });

                    console.error(`[CRITICAL] 🛑 ${haltReason}`);
                    messageStatusUpdated = true;
                    continue;
                }

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
                console.log(`[DISCONNECT] Dashboard requested disconnect for Instance: ${instanceId}. Logging out...`);
                clearInterval(disconnectWatcherInterval!);
                disconnectWatcherInterval = null;

                const entry = socketPool.get(instanceId);
                if (entry?.sock) {
                    try {
                        await entry.sock.logout();
                        console.log(`[DISCONNECT] Logout sent to WhatsApp for Instance: ${instanceId}.`);
                    } catch (err) {
                        console.error(`[DISCONNECT] Error during logout for ${instanceId}, forcing cleanup:`, err);
                        await cleanupSocketForInstance(instanceId, 'forced_disconnect');
                    }
                }

                // Clear the auth state so a fresh QR is generated on reconnect
                deleteSessionFolder(instanceId);

                // Clear media cache
                cachedMediaBuffer = null;
                cachedImageUrl = null;

                // Update DB status
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'DISCONNECTED', qrCode: '' },
                });

                console.log(`[DISCONNECT] ✅ Instance ${instanceId} disconnected successfully. Restarting for new QR...`);

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
// 16.5 VERIFICATION WORKER (Background Queue)
// ============================================================================

async function startVerificationWorker() {
    console.log('[VERIFICATION WORKER] Started — listening for PENDING contacts.');

    while (true) {
        try {
            if (!globalSock || broadcastHalted) {
                await wait(10000);
                continue;
            }

            // Limit batch to 50 for memory safety
            const pendingContacts = await prisma.contact.findMany({
                where: { status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });

            if (pendingContacts.length === 0) {
                await wait(5000);
                continue;
            }

            for (const contact of pendingContacts) {
                if (!globalSock || broadcastHalted) break;

                const jid = `${contact.phone}@s.whatsapp.net`;
                let isRegistered = false;

                try {
                    const [result] = await globalSock.onWhatsApp(jid);
                    isRegistered = result?.exists || false;
                } catch (err: any) {
                    console.error(`[VERIFICATION] Check failed for ${contact.phone}`, err.message);
                    await wait(2000);
                    continue;
                }

                await prisma.contact.update({
                    where: { id: contact.id },
                    data: { status: isRegistered ? 'VERIFIED' : 'INVALID' },
                });

                await wait(200 + randomInt(100, 300));
            }

        } catch (err) {
            console.error('[VERIFICATION WORKER] Main loop error:', err);
            await wait(10000);
        }
    }
}

// ============================================================================
// 17. STARTUP CLEANUP — Remove stale session artifacts
// ============================================================================

/**
 * Removes legacy auth folders that don't follow the new naming convention.
 * e.g., 'auth_info_baileys' or old phone-number-based session folders.
 */
function cleanupLegacySessions(): void {
    // Check for legacy auth_info_baileys folder in worker root
    const legacyPaths = [
        path.join(process.cwd(), 'auth_info_baileys'),
        path.join(process.cwd(), 'auth_info'),
    ];

    for (const legacyPath of legacyPaths) {
        if (fs.existsSync(legacyPath)) {
            console.log(`[STARTUP] 🧹 Removing legacy session folder: ${legacyPath}`);
            fs.rmSync(legacyPath, { recursive: true, force: true });
        }
    }

    // Also check for any session folders in ./sessions that are NOT in auth-{id} format
    // (e.g., phone-number-based folders from the old implementation)
    if (fs.existsSync(SESSIONS_DIR)) {
        const entries = fs.readdirSync(SESSIONS_DIR);
        for (const entry of entries) {
            if (!entry.startsWith('auth-')) {
                const fullPath = path.join(SESSIONS_DIR, entry);
                console.log(`[STARTUP] 🧹 Removing non-standard session folder: ${fullPath}`);
                try {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } catch (e) {
                    console.warn(`[STARTUP] Could not remove ${fullPath}:`, e);
                }
            }
        }
    }
}

// ============================================================================
// 18. MAIN EXECUTION
// ============================================================================

(async () => {
    try {
        console.log('═══════════════════════════════════════════════════');
        console.log('  uWA Worker — Anti-Ban Enhanced Engine v4.0');
        console.log(`  Memory Limit: ${MEMORY_LIMIT_MB}MB`);
        console.log(`  QR Timeout: ${QR_TIMEOUT_MS / 1000}s`);
        console.log(`  Session Dir: ${SESSIONS_DIR}`);
        console.log(`  Human Clock: Active 05:00–23:00`);
        console.log(`  Batch Cool: Every 15 msgs → 120–300s rest`);
        console.log(`  Typing: 3–7s composing before each send`);
        console.log(`  Zero-Width: 1–5 invisible chars per message`);
        console.log(`  Time: ${new Date().toISOString()}`);
        console.log('═══════════════════════════════════════════════════');

        // Clean up any legacy session folders from old implementations
        cleanupLegacySessions();

        await connectToWhatsApp();
        startBroadcastProcessor();
        startVerificationWorker();
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
