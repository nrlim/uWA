import 'dotenv/config';

import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
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
const QR_TIMEOUT_MS = 60_000; // 60 seconds before QR timeout
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
const CONNECTION_SCAN_INTERVAL_MS = 10_000; // Check for new instances every 10s

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
// 1. UTILITY
// ============================================================================

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
 */
function deleteSessionFolder(instanceId: string): void {
    const sessionPath = getSessionPath(instanceId);
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[Connection] 🗑️ Session folder deleted: ${instanceId}`);
    }
}

/**
 * Validate creds.json for a given instanceId.
 * If the file exists but is corrupted (empty, truncated, or invalid JSON),
 * it is deleted so that Baileys generates fresh credentials on the next connect.
 * Returns true if creds are valid or absent (fresh start), false if they were corrupted and removed.
 */
function validateCredsFile(instanceId: string): boolean {
    const sessionPath = getSessionPath(instanceId);
    const credsPath = path.join(sessionPath, 'creds.json');

    if (!fs.existsSync(credsPath)) {
        console.log(`[SESSION] creds.json absent for ${instanceId} — fresh session will be created.`);
        return true; // No creds file = fresh start, which is fine
    }

    try {
        const raw = fs.readFileSync(credsPath, 'utf-8').trim();

        // Empty file check
        if (raw.length === 0) {
            throw new Error('creds.json is empty');
        }

        const parsed = JSON.parse(raw);

        // Basic structure validation - creds must have essential fields
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('creds.json parsed to non-object');
        }

        console.log(`[SESSION] ✅ creds.json valid for ${instanceId}`);
        return true;
    } catch (err: any) {
        console.warn(`[SESSION] ⚠️ Corrupted creds.json for ${instanceId}: ${err.message}`);
        console.log(`[SESSION] 🗑️ Removing corrupted creds.json for ${instanceId}`);

        try {
            fs.unlinkSync(credsPath);
        } catch (unlinkErr: any) {
            // If we can't delete just the file, nuke the whole session folder
            console.warn(`[SESSION] Failed to delete creds.json, removing entire session folder: ${unlinkErr.message}`);
            deleteSessionFolder(instanceId);
        }

        return false;
    }
}

/**
 * Get the active socket for a given instanceId from the pool.
 */
function getSocket(instanceId: string): any | null {
    return socketPool.get(instanceId)?.sock || null;
}

/**
 * Get ANY connected socket from the pool (for generic operations like verification).
 */
function getAnyConnectedSocket(): any | null {
    for (const entry of socketPool.values()) {
        if (entry.sock?.user?.id) {
            return entry.sock;
        }
    }
    return null;
}

// ============================================================================
// 2. SPINTAX — Nested Spintax Parser
// ============================================================================

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
// 3. INVISIBLE ZERO-WIDTH SUFFIX
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
// 4. HUMAN CLOCK
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
// 5. DAILY LIMIT
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
// 6. MEMORY MONITOR
// ============================================================================

function checkMemoryUsage(): { usedMB: number; ok: boolean } {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const ok = usedMB < MEMORY_LIMIT_MB * 0.85;
    return { usedMB, ok };
}

// ============================================================================
// 7. ANTI-BAN LOGGER
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
// 8. ERROR CLASSIFICATION
// ============================================================================

const RATE_LIMIT_PATTERNS = ['rate-overlimit', 'too many', 'spam', 'blocked', 'banned'];

function isRateLimitError(error: any): boolean {
    const msg = (error?.message || error?.toString?.() || '').toLowerCase();
    const output = (error as Boom)?.output;
    const statusCode = output?.statusCode;
    if (statusCode === 429 || statusCode === 405 || statusCode === 503) return true;
    return RATE_LIMIT_PATTERNS.some((pattern) => msg.includes(pattern));
}

// ============================================================================
// 9. SESSION VALIDATOR
// ============================================================================

async function validateSessionForInstance(instanceId: string): Promise<boolean> {
    const sock = getSocket(instanceId);
    if (!sock) return false;

    try {
        const user = sock?.user;
        if (!user?.id) {
            console.warn(`[SESSION] No user ID in socket for instance ${instanceId}`);
            return false;
        }
        await sock.presenceSubscribe(`${user.id}@s.whatsapp.net`);
        console.log(`[SESSION] Validation OK for instance ${instanceId}`);
        return true;
    } catch (err) {
        console.error(`[SESSION] Validation failed for instance ${instanceId}:`, err);
        return false;
    }
}

// ============================================================================
// 10. PRESENCE HEARTBEAT — per instance
// ============================================================================

function startPresenceHeartbeat(instanceId: string): void {
    const entry = socketPool.get(instanceId);
    if (!entry) return;

    if (entry.presenceInterval) {
        clearTimeout(entry.presenceInterval);
        entry.presenceInterval = null;
    }

    const tick = async () => {
        const currentEntry = socketPool.get(instanceId);
        if (!currentEntry?.sock || broadcastHalted) return;
        if (Math.random() < 0.4) {
            try {
                await currentEntry.sock.sendPresenceUpdate('available');
                console.log(`[PRESENCE] 💚 Heartbeat sent for ${instanceId}`);
            } catch { /* Non-critical */ }
        }
    };

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
    console.log(`[PRESENCE] Heartbeat started for ${instanceId}`);
}

function stopPresenceHeartbeat(instanceId: string): void {
    const entry = socketPool.get(instanceId);
    if (entry?.presenceInterval) {
        clearTimeout(entry.presenceInterval);
        entry.presenceInterval = null;
    }
}

// ============================================================================
// 11. SOCKET CLEANUP
// ============================================================================

async function cleanupSocketForInstance(instanceId: string, reason: string): Promise<void> {
    console.log(`[CLEANUP] Socket cleanup for ${instanceId}: ${reason}`);

    const entry = socketPool.get(instanceId);
    if (!entry) return;

    if (entry.qrTimeout) {
        clearTimeout(entry.qrTimeout);
        entry.qrTimeout = null;
    }

    stopPresenceHeartbeat(instanceId);

    try {
        entry.sock.ev.removeAllListeners('creds.update');
        entry.sock.ev.removeAllListeners('connection.update');
        entry.sock.end(undefined);
    } catch (err) {
        console.error(`[CLEANUP] Error during teardown for ${instanceId}:`, err);
    }

    socketPool.delete(instanceId);
}

async function cleanupAllSockets(reason: string): Promise<void> {
    console.log(`[CLEANUP] Cleaning up ALL sockets: ${reason}`);
    const instanceIds = [...socketPool.keys()];
    for (const id of instanceIds) {
        await cleanupSocketForInstance(id, reason);
    }
}

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n[SHUTDOWN] Received ${signal}. Shutting down gracefully...`);

    // Update ALL managed instances to DISCONNECTED
    const instanceIds = [...socketPool.keys()];
    for (const id of instanceIds) {
        try {
            await prisma.instance.update({
                where: { id },
                data: { status: 'DISCONNECTED', qrCode: '' },
            });
        } catch { /* ignore */ }
    }

    await cleanupAllSockets(signal);

    try { await prisma.$disconnect(); } catch { /* ignore */ }

    console.log('[SHUTDOWN] Cleanup complete. Exiting.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', async (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    await cleanupAllSockets('uncaughtException');
    process.exit(1);
});

// ============================================================================
// 12. WHATSAPP CONNECTION — Per Instance
// ============================================================================

/**
 * Connects a single instance to WhatsApp.
 * Creates an isolated socket with its own session folder.
 * The instance must already exist in the database.
 */
async function connectInstance(instanceId: string): Promise<void> {
    console.log(`[Connection] ═══════════════════════════════════════════`);
    console.log(`[Connection] Initializing session for Instance: ${instanceId}`);
    console.log(`[Connection] ═══════════════════════════════════════════`);

    // Check if already in pool
    if (socketPool.has(instanceId)) {
        console.log(`[Connection] Socket already in pool for ${instanceId}. Cleaning up first...`);
        await cleanupSocketForInstance(instanceId, 'reconnection');
    }

    // Dynamic session path: ./sessions/auth-{instanceId}
    const sessionPath = getSessionPath(instanceId);
    console.log(`[Connection] Session path: ${sessionPath}`);

    // ── Task 4: Validate creds.json before loading auth state ──
    const credsValid = validateCredsFile(instanceId);
    if (!credsValid) {
        console.log(`[Connection] Corrupted creds removed for ${instanceId}. Proceeding with fresh session.`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // ── Fetch latest WA Web version for protocol compatibility ──
    let waVersion: [number, number, number] | undefined;
    try {
        const versionResult = await fetchLatestWaWebVersion();
        if (versionResult.isLatest) {
            waVersion = versionResult.version as [number, number, number];
            console.log(`[Connection] Using latest WA Web version: ${waVersion.join('.')}`);
        } else {
            console.log(`[Connection] Could not fetch latest version, using Baileys default`);
        }
    } catch (err) {
        console.warn(`[Connection] Version fetch failed, using default:`, err);
    }

    // ── Browser identity + socket options ──
    // IMPORTANT: browser[0] MUST be a recognized OS ('Ubuntu', 'Mac OS', 'Windows')
    // because Baileys' validate-connection.js uses it to set WebSubPlatform.
    // Unrecognized values cause WhatsApp to reject the pairing handshake.
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'warn' }) as any,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        connectTimeoutMs: 60_000,
        printQRInTerminal: false,
        ...(waVersion ? { version: waVersion } : {}),
    });

    // Register in socket pool
    const poolEntry: SocketEntry = {
        sock,
        instanceId,
        qrTimeout: null,
        qrAttempts: 0,
        presenceInterval: null,
    };
    socketPool.set(instanceId, poolEntry);

    console.log(`[Connection] Socket created for ${instanceId}. Pool size: ${socketPool.size}`);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        console.log(`[Connection] Current State: ${connection || 'unchanged'} | Instance: ${instanceId}`);

        // ── QR Code Received ──────────────────────────────────
        if (qr) {
            const entry = socketPool.get(instanceId);
            if (entry) {
                entry.qrAttempts++;
                console.log(`[Connection] QR Received for Instance: ${instanceId} (attempt #${entry.qrAttempts})`);

                // Clear previous QR timeout
                if (entry.qrTimeout) {
                    clearTimeout(entry.qrTimeout);
                    entry.qrTimeout = null;
                }

                // Save QR to database immediately
                try {
                    await prisma.instance.update({
                        where: { id: instanceId },
                        data: { status: 'QR_READY', qrCode: qr },
                    });
                    console.log(`[Connection] ✅ QR saved to DB for ${instanceId}`);
                } catch (error) {
                    console.error(`[Connection] ❌ Failed to save QR for ${instanceId}:`, error);
                }

                // QR Timeout: if not scanned within 60s, allow regeneration
                entry.qrTimeout = setTimeout(async () => {
                    const currentEntry = socketPool.get(instanceId);
                    if (!currentEntry) return;

                    console.log(`[Connection] ⏰ QR timeout (${QR_TIMEOUT_MS / 1000}s) for ${instanceId}. Attempt #${currentEntry.qrAttempts}`);

                    // After 5 failed attempts (5 QR cycles), close and retry cleanly
                    if (currentEntry.qrAttempts >= 5) {
                        console.log(`[Connection] ⚠️ QR not scanned after ${currentEntry.qrAttempts} attempts for ${instanceId}. Closing for retry.`);

                        await cleanupSocketForInstance(instanceId, 'qr_timeout_max_attempts');

                        try {
                            await prisma.instance.update({
                                where: { id: instanceId },
                                data: { status: 'DISCONNECTED', qrCode: '' },
                            });
                        } catch { /* ignore */ }

                        // The connection manager will pick this up and retry automatically
                    }
                    // < 5 attempts: Baileys will auto-generate new QR
                }, QR_TIMEOUT_MS);
            }
        }

        // ── Connection Closed ─────────────────────────────────
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const errorMessage = ((lastDisconnect?.error as Boom)?.message || '').toLowerCase();
            let shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[Connection] ❌ Connection closed for ${instanceId} (code: ${statusCode}, msg: ${errorMessage})`);

            // ── Task 2: Bad session detection ──
            // These status codes indicate the session state is corrupted or rejected by WhatsApp.
            // 401 = Unauthorized (bad creds), 408 = Request Timeout (stale session),
            // 440 = Session replaced on another device, 500+ = server-side rejection.
            const BAD_SESSION_CODES = [401, 408, 440];
            const isBadSession =
                BAD_SESSION_CODES.includes(statusCode) ||
                statusCode >= 500 ||
                errorMessage.includes('bad session') ||
                errorMessage.includes('connection failure') ||
                errorMessage.includes('stream errored') ||
                errorMessage.includes('qr refs over limit');

            // Logged out → delete session for fresh QR
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[Connection] 🔐 Logged out for ${instanceId}. Clearing session...`);
                deleteSessionFolder(instanceId);
                shouldReconnect = true;
            }
            // Bad session (not logged out) → delete session for clean re-pair
            else if (isBadSession) {
                console.log(`[Connection] ⚠️ Bad session detected for ${instanceId} (code: ${statusCode}). Purging session folder for clean re-pair...`);
                deleteSessionFolder(instanceId);
                shouldReconnect = true;
            }

            await cleanupSocketForInstance(instanceId, `connection_close_${statusCode}`);

            try {
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'DISCONNECTED', qrCode: '' },
                });
            } catch (error) {
                console.error(`[Connection] Failed to update DISCONNECTED for ${instanceId}:`, error);
            }

            // Detect rate-limit
            if (isRateLimitError(lastDisconnect?.error)) {
                broadcastHalted = true;
                haltReason = `Connection closed by WhatsApp (code: ${statusCode}). Possible rate-limit.`;
                console.error(`[CRITICAL] ${haltReason}`);

                await prisma.broadcast.updateMany({
                    where: { status: 'RUNNING', instanceId },
                    data: { status: 'PAUSED_RATE_LIMIT' },
                });
            }

            if (shouldReconnect) {
                const reconnectDelay = randomInt(3000, 10000);
                console.log(`[Connection] 🔄 Reconnecting ${instanceId} in ${reconnectDelay / 1000}s...`);
                await wait(reconnectDelay);
                await connectInstance(instanceId);
            }
            // If not reconnecting (rare), the connection manager will eventually pick it up
        }

        // ── Connection Opened ─────────────────────────────────
        if (connection === 'open') {
            console.log(`[Connection] ✅ Connection opened for ${instanceId}`);

            // Clear QR timeout
            const entry = socketPool.get(instanceId);
            if (entry?.qrTimeout) {
                clearTimeout(entry.qrTimeout);
                entry.qrTimeout = null;
                entry.qrAttempts = 0;
            }

            broadcastHalted = false;
            haltReason = '';

            startPresenceHeartbeat(instanceId);

            // Update DB
            try {
                await prisma.instance.update({
                    where: { id: instanceId },
                    data: { status: 'CONNECTED', qrCode: '' },
                });
                console.log(`[Connection] ✅ Instance ${instanceId} → CONNECTED`);
            } catch (err) {
                console.error(`[Connection] ❌ Failed CONNECTED update for ${instanceId}:`, err);
                try {
                    await prisma.instance.updateMany({
                        where: { id: instanceId },
                        data: { status: 'CONNECTED', qrCode: '' },
                    });
                } catch { /* ignore */ }
            }

            // Resume paused broadcasts
            try {
                const resumed = await prisma.broadcast.updateMany({
                    where: { status: { in: ['PAUSED_RATE_LIMIT', 'PAUSED_WORKING_HOURS'] }, instanceId },
                    data: { status: 'RUNNING' },
                });
                if (resumed.count > 0) {
                    console.log(`[Connection] ♻️ Resumed ${resumed.count} paused broadcast(s) for ${instanceId}`);
                }
            } catch (err) {
                console.error(`[Connection] Failed to resume broadcasts for ${instanceId}:`, err);
            }
        }
    });
}

// ============================================================================
// 13. CONNECTION MANAGER — Watches ALL instances, multi-tenant
// ============================================================================

/**
 * Periodically scans the database for instances that need a socket connection.
 * This is the heart of the multi-tenant architecture:
 * - New user registers → /api/status auto-creates Instance (DISCONNECTED)
 * - Connection Manager detects it → spins up a socket → QR generated
 * - User scans QR → CONNECTED
 */
async function startConnectionManager(): Promise<void> {
    console.log('[CONNECTION MANAGER] Started — scanning for instances every 10s');

    while (true) {
        try {
            // Find all instances that are DISCONNECTED and not already in our socket pool
            const disconnectedInstances = await prisma.instance.findMany({
                where: {
                    status: 'DISCONNECTED',
                    users: { some: {} } // Only instances that have at least 1 user linked
                },
                select: { id: true, phoneNumber: true }
            });

            // Diagnostic: log scan results
            const allInstances = await prisma.instance.findMany({
                select: { id: true, status: true, phoneNumber: true }
            });
            console.log(`[CONNECTION MANAGER] Scan: ${allInstances.length} total instances, ${disconnectedInstances.length} DISCONNECTED, ${socketPool.size} in pool`);
            if (allInstances.length > 0) {
                for (const inst of allInstances) {
                    const inPool = socketPool.has(inst.id) ? '✅ in pool' : '❌ not in pool';
                    console.log(`[CONNECTION MANAGER]   │ ${inst.id} | status=${inst.status} | phone=${inst.phoneNumber} | ${inPool}`);
                }
            } else {
                console.log('[CONNECTION MANAGER]   ⚠️ No instances found in database! User must visit dashboard to auto-create one.');
            }

            for (const instance of disconnectedInstances) {
                // Skip if already in pool (means socket is being set up / reconnecting)
                if (socketPool.has(instance.id)) {
                    continue;
                }

                console.log(`[CONNECTION MANAGER] 🆕 New disconnected instance found: ${instance.id} (${instance.phoneNumber})`);

                // Memory check before spawning new socket
                const mem = checkMemoryUsage();
                if (!mem.ok) {
                    console.warn(`[CONNECTION MANAGER] ⚠️ Memory too high (${mem.usedMB}MB) — skipping new connection for ${instance.id}`);
                    continue;
                }

                // Connect this instance
                try {
                    await connectInstance(instance.id);
                } catch (err) {
                    console.error(`[CONNECTION MANAGER] Failed to connect instance ${instance.id}:`, err);
                }

                // Small delay between connecting multiple instances
                await wait(2000);
            }

        } catch (err) {
            console.error('[CONNECTION MANAGER] Scan error:', err);
        }

        await wait(CONNECTION_SCAN_INTERVAL_MS);
    }
}

// ============================================================================
// 14. COMPOSING PRESENCE
// ============================================================================

async function simulateTyping(sock: any, jid: string, broadcastId: string, minMs: number = 3000, maxMs: number = 7000): Promise<number> {
    if (!sock) return 0;

    const typingDuration = randomInt(minMs, maxMs);

    try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);

        await logAntiBanAction(
            broadcastId,
            'TYPING',
            `Composing ${(typingDuration / 1000).toFixed(1)}s → ${jid}`
        );

        await wait(typingDuration);
        await sock.sendPresenceUpdate('paused', jid);
    } catch (err) {
        console.warn('[TYPING] Presence update failed (non-fatal):', err);
    }

    return typingDuration;
}

// ============================================================================
// 15. BATCH COOLING
// ============================================================================

const BATCH_COOLDOWN_EVERY = 15;
const BATCH_COOLDOWN_MIN_MS = 120 * 1000;
const BATCH_COOLDOWN_MAX_MS = 300 * 1000;

async function applyBatchCoolingIfNeeded(broadcastId: string, sock: any): Promise<void> {
    batchMessageCount++;

    if (batchMessageCount >= BATCH_COOLDOWN_EVERY) {
        const cooldownMs = randomInt(BATCH_COOLDOWN_MIN_MS, BATCH_COOLDOWN_MAX_MS);
        const cooldownSec = Math.round(cooldownMs / 1000);

        await logAntiBanAction(broadcastId, 'COOLDOWN', `Batch cooling: ${cooldownSec}s after ${batchMessageCount} messages`);
        console.log(`[BATCH COOL] 🧊 ${cooldownSec}s rest after ${batchMessageCount} messages...`);

        if (sock) {
            try { await sock.sendPresenceUpdate('unavailable'); } catch { /* non-critical */ }
        }

        await wait(cooldownMs);

        if (sock) {
            try { await sock.sendPresenceUpdate('available'); } catch { /* non-critical */ }
        }

        batchMessageCount = 0;
        console.log(`[BATCH COOL] ✅ Cooling complete. Resuming...`);
    }
}

// ============================================================================
// 16. BROADCAST PROCESSOR — Multi-tenant aware
// ============================================================================

async function startBroadcastProcessor() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Anti-Ban Broadcast Processor v4.1 (Multi-Tenant)');
    console.log('   ├─ Browser Identity: Ubuntu/Chrome ✓');
    console.log('   ├─ Dynamic WA Web Version Fetch ✓');
    console.log('   ├─ creds.json Pre-Validation ✓');
    console.log('   ├─ Bad Session Auto-Cleanup (401/408/440/5xx) ✓');
    console.log('   ├─ Connect Timeout: 60s ✓');
    console.log('   ├─ Dynamic Session Paths (auth-${instanceId}) ✓');
    console.log('   ├─ Socket Pool / Connection Manager ✓');
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
                console.warn(`[MEMORY] ⚠️ High usage: ${mem.usedMB}MB / ${MEMORY_LIMIT_MB}MB`);
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

            // ── Find Active Broadcast (across ALL connected instances) ──
            // Only pick broadcasts whose instance has an active socket
            const connectedInstanceIds = [...socketPool.keys()];

            if (connectedInstanceIds.length === 0) {
                await wait(5000);
                continue;
            }

            const broadcast = await prisma.broadcast.findFirst({
                where: {
                    status: { in: ['PENDING', 'RUNNING'] },
                    instanceId: { in: connectedInstanceIds },
                },
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
                    console.log(`[AUTO-REFRESH] Worker idle for 5+ minutes. Restarting...`);
                    await cleanupAllSockets('idle_refresh');
                    process.exit(0); // PM2 restarts
                }
                await wait(5000);
                continue;
            }

            lastActiveTime = Date.now();

            // ── Get the socket for THIS broadcast's instance ──
            const activeSock = getSocket(broadcast.instanceId);
            if (!activeSock) {
                console.warn(`[BROADCAST] No socket for instance ${broadcast.instanceId}. Skipping.`);
                await wait(5000);
                continue;
            }

            // ── Campaign Global Timeout ──────────────────────────
            if (lastBroadcastId !== broadcast.id) {
                lastBroadcastId = broadcast.id;
                broadcastStartTime = Date.now();
            } else {
                const maxCampaignDuration = 3 * 60 * 60 * 1000;
                if (Date.now() - broadcastStartTime > maxCampaignDuration) {
                    console.error(`[TIMEOUT] Broadcast ${broadcast.id} exceeded 3h timeout!`);
                    broadcastHalted = true;
                    process.exit(1);
                }
            }

            // ── Credit Check Guard ────────────────────────────
            if (broadcast.user.credit <= 0) {
                await logAntiBanAction(broadcast.id, 'CREDIT_EXHAUSTED', `User ${broadcast.user.username} has 0 credits.`);
                console.warn(`[CREDIT] ⛔ User ${broadcast.user.username} has 0 credits.`);
                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'PAUSED_NO_CREDIT' }
                });
                continue;
            }

            // ── Session Validation (on first message of batch) ───
            if (broadcast.status === 'PENDING') {
                const memStart = checkMemoryUsage();
                console.log(`[LIFECYCLE] Starting broadcast "${broadcast.name}" on instance ${broadcast.instanceId}. Memory: ${memStart.usedMB}MB`);

                const sessionOk = await validateSessionForInstance(broadcast.instanceId);
                await logAntiBanAction(
                    broadcast.id, 'SESSION_VALIDATE',
                    sessionOk ? 'Session healthy' : 'Session unhealthy'
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

                await logAntiBanAction(broadcast.id, 'WORKING_HOURS_PAUSE',
                    `SLEEP MODE: Outside hours (${workStart}:00-${workEnd}:00). Sleeping ~${sleepMin} min.`
                );
                console.log(`[HUMAN CLOCK] 🌙 Sleep Mode. Pausing ~${sleepMin} min...`);

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'PAUSED_WORKING_HOURS' },
                });

                try { await activeSock.sendPresenceUpdate('unavailable'); } catch { /* */ }

                const chunks = Math.ceil(sleepMs / 60000);
                for (let i = 0; i < chunks; i++) {
                    await wait(Math.min(60000, sleepMs - i * 60000));
                    if (broadcastHalted) break;
                }

                try { await activeSock.sendPresenceUpdate('available'); } catch { /* */ }

                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: 'RUNNING' },
                });
                console.log(`[HUMAN CLOCK] ☀️ Waking up. Resuming.`);
                continue;
            }

            // ── Daily Limit Gate ──────────────────────────────
            resetDailyCounterIfNeeded();
            const dailyLimit = broadcast.dailyLimit ?? 0;

            if (isDailyLimitReached(dailyLimit)) {
                const sleepMs = msUntilWorkingHoursStart(workStart);
                const sleepHrs = (sleepMs / 3600000).toFixed(1);

                await logAntiBanAction(broadcast.id, 'COOLDOWN',
                    `Daily limit reached (${dailySentCount}/${dailyLimit}). Pausing ~${sleepHrs}h.`
                );
                console.log(`[DAILY LIMIT] 📊 ${dailySentCount}/${dailyLimit}. Pausing ~${sleepHrs}h...`);

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
                    console.log(`[LIFECYCLE] Broadcast "${broadcast.name}" completed. Memory: ${memEnd.usedMB}MB`);

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'COMPLETED' },
                    });

                    batchMessageCount = 0;
                    cachedMediaBuffer = null;
                    cachedImageUrl = null;
                    lastActiveTime = Date.now();
                    lastBroadcastId = null;
                    console.log(`[LIFECYCLE] Cleanup finished for "${broadcast.name}". Worker idle.`);
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

            // ── Append Zero-Width Suffix ──────────────────────
            const { result: finalContent, suffix: zwSuffix } = appendZeroWidthSuffix(spintaxResult);
            await logAntiBanAction(broadcast.id, 'UNIQUE_SUFFIX', zwSuffix);

            // ── Simulate Typing ───────────────────────────────
            const hasMedia = !!(broadcast as any).imageUrl;
            const typingMin = hasMedia ? 5000 : 3000;
            const typingMax = hasMedia ? 11000 : 7000;
            const typingDurationMs = await simulateTyping(activeSock, jid, broadcast.id, typingMin, typingMax);

            // ── Calculate Delay ───────────────────────────────
            const minDelay = (broadcast.delayMin || 20) * 1000;
            const maxDelay = (broadcast.delayMax || 60) * 1000;
            const delay = randomInt(minDelay, maxDelay);

            // ── anti_banned_meta ──────────────────────────────
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
                instanceId: broadcast.instanceId,
            };

            // ── Send Message ──────────────────────────────────
            console.log(`📤 [${broadcast.instanceId.slice(0, 8)}] Sending to ${jid} [batch #${antiBannedMeta.batchIndex}]${hasMedia ? ' + 🖼️' : ''}...`);

            let messageStatusUpdated = false;
            try {
                if (!activeSock) {
                    throw new Error('Socket disconnected before send');
                }

                if (hasMedia) {
                    const imageUrl = (broadcast as any).imageUrl;
                    let mediaPayload: any = { url: imageUrl };

                    if (cachedBroadcastId !== broadcast.id || cachedImageUrl !== imageUrl) {
                        cachedBroadcastId = broadcast.id;
                        cachedImageUrl = imageUrl;
                        cachedMediaBuffer = null;
                        console.log(`[CACHE] New media for broadcast ${broadcast.id}`);
                    }

                    if (!cachedMediaBuffer) {
                        if (imageUrl.startsWith('/')) {
                            let localPath = path.join(process.cwd(), 'public', imageUrl);
                            if (!fs.existsSync(localPath)) {
                                localPath = path.join(process.cwd(), '../public', imageUrl);
                            }
                            if (fs.existsSync(localPath)) {
                                cachedMediaBuffer = fs.readFileSync(localPath);
                                console.log('[MEDIA] Loaded from local file:', localPath);
                            } else {
                                console.warn('[MEDIA] Local file not found:', imageUrl);
                            }
                        } else if (imageUrl.startsWith('http')) {
                            try {
                                console.log('[MEDIA] Downloading:', imageUrl);
                                const res = await fetch(imageUrl);
                                if (res.ok) {
                                    const arrayBuffer = await res.arrayBuffer();
                                    cachedMediaBuffer = Buffer.from(arrayBuffer);
                                    console.log(`[MEDIA] Cached ${cachedMediaBuffer.length} bytes.`);
                                } else {
                                    console.error('[MEDIA] Download failed:', res.statusText);
                                }
                            } catch (err) {
                                console.error('[MEDIA] Error:', err);
                            }
                        }
                    }

                    if (cachedMediaBuffer) mediaPayload = cachedMediaBuffer;

                    const sendPromise = activeSock.sendMessage(jid, { image: mediaPayload, caption: finalContent });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Send Media Timeout (60s)')), 60000));
                    await Promise.race([sendPromise, timeoutPromise]);
                } else {
                    const sendPromise = activeSock.sendMessage(jid, { text: finalContent });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Send Text Timeout (30s)')), 30000));
                    await Promise.race([sendPromise, timeoutPromise]);
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
                        console.warn(`[FAILSAFE] Message ${messageTask.id} not updated. Forcing FAILED.`);
                        await prisma.message.update({
                            where: { id: messageTask.id },
                            data: {
                                status: 'FAILED',
                                error: 'Unhandled Error/Timeout',
                                antiBannedMeta: antiBannedMeta as any,
                            },
                        });
                        await prisma.broadcast.update({
                            where: { id: broadcast.id },
                            data: { failed: { increment: 1 } },
                        });
                    } catch (fatalErr) {
                        console.error('[FATAL] Failed to update message status:', fatalErr);
                    }
                }
            }

            // ── Batch Cooling ─────────────────────────────────
            await applyBatchCoolingIfNeeded(broadcast.id, activeSock);

            // ── Delay ─────────────────────────────────────────
            console.log(`⏳ Waiting ${(delay / 1000).toFixed(1)}s...`);
            await wait(delay);

        } catch (e: any) {
            console.error('Error in broadcast loop:', e);
            if (isRateLimitError(e)) {
                broadcastHalted = true;
                haltReason = `Fatal rate-limit: ${e?.message}`;
                console.error(`[CRITICAL] 🛑 ${haltReason}`);
            }
            await wait(5000);
        }
    }
}

// ============================================================================
// 17. DISCONNECT WATCHER — Multi-tenant: watches ALL instances
// ============================================================================

let disconnectWatcherInterval: ReturnType<typeof setInterval> | null = null;

function startDisconnectWatcher(): void {
    if (disconnectWatcherInterval) return;

    disconnectWatcherInterval = setInterval(async () => {
        try {
            // Find ALL instances requesting disconnect
            const disconnecting = await prisma.instance.findMany({
                where: { status: 'DISCONNECTING' },
                select: { id: true, phoneNumber: true }
            });

            for (const instance of disconnecting) {
                console.log(`[DISCONNECT] Dashboard requested disconnect for ${instance.id}`);

                const entry = socketPool.get(instance.id);
                if (entry?.sock) {
                    try {
                        await entry.sock.logout();
                        console.log(`[DISCONNECT] Logout sent for ${instance.id}`);
                    } catch (err) {
                        console.error(`[DISCONNECT] Logout error for ${instance.id}:`, err);
                        await cleanupSocketForInstance(instance.id, 'forced_disconnect');
                    }
                }

                // Clear auth for fresh QR
                deleteSessionFolder(instance.id);

                // Update DB
                await prisma.instance.update({
                    where: { id: instance.id },
                    data: { status: 'DISCONNECTED', qrCode: '' },
                });

                console.log(`[DISCONNECT] ✅ ${instance.id} disconnected. Connection Manager will pick up for fresh QR.`);
                // The connection manager will automatically detect DISCONNECTED and create a new socket.
            }
        } catch (err) {
            // Silently ignore polling errors
        }
    }, 3000);

    console.log('[DISCONNECT WATCHER] Started — watching all instances.');
}

// ============================================================================
// 18. VERIFICATION WORKER
// ============================================================================

async function startVerificationWorker() {
    console.log('[VERIFICATION WORKER] Started.');

    while (true) {
        try {
            // Use any connected socket for verification
            const sock = getAnyConnectedSocket();
            if (!sock || broadcastHalted) {
                await wait(10000);
                continue;
            }

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
                const currentSock = getAnyConnectedSocket();
                if (!currentSock || broadcastHalted) break;

                const jid = `${contact.phone}@s.whatsapp.net`;
                let isRegistered = false;

                try {
                    const [result] = await currentSock.onWhatsApp(jid);
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
            console.error('[VERIFICATION WORKER] Error:', err);
            await wait(10000);
        }
    }
}

// ============================================================================
// 19. STARTUP CLEANUP
// ============================================================================

function cleanupLegacySessions(): void {
    const legacyPaths = [
        path.join(process.cwd(), 'auth_info_baileys'),
        path.join(process.cwd(), 'auth_info'),
    ];

    for (const legacyPath of legacyPaths) {
        if (fs.existsSync(legacyPath)) {
            console.log(`[STARTUP] 🧹 Removing legacy session: ${legacyPath}`);
            fs.rmSync(legacyPath, { recursive: true, force: true });
        }
    }

    if (fs.existsSync(SESSIONS_DIR)) {
        const entries = fs.readdirSync(SESSIONS_DIR);
        for (const entry of entries) {
            if (!entry.startsWith('auth-')) {
                const fullPath = path.join(SESSIONS_DIR, entry);
                console.log(`[STARTUP] 🧹 Removing non-standard session: ${fullPath}`);
                try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch { /* */ }
            }
        }
    }
}

// ============================================================================
// 20. MAIN EXECUTION
// ============================================================================

(async () => {
    try {
        console.log('═══════════════════════════════════════════════════');
        console.log('  uWA Worker — Multi-Tenant Engine v4.0');
        console.log(`  Memory Limit: ${MEMORY_LIMIT_MB}MB`);
        console.log(`  QR Timeout: ${QR_TIMEOUT_MS / 1000}s`);
        console.log(`  Session Dir: ${SESSIONS_DIR}`);
        console.log(`  Connection Scan Interval: ${CONNECTION_SCAN_INTERVAL_MS / 1000}s`);
        console.log(`  Human Clock: Active 05:00–23:00`);
        console.log(`  Batch Cool: Every 15 msgs → 120–300s rest`);
        console.log(`  Time: ${new Date().toISOString()}`);
        console.log('═══════════════════════════════════════════════════');

        // Clean up legacy session artifacts
        cleanupLegacySessions();

        // Start the connection manager — it will auto-detect all instances
        // No need for a single connectToWhatsApp() call anymore.
        // The connection manager handles all instances dynamically.
        startConnectionManager();       // Watches for DISCONNECTED instances, connects them
        startBroadcastProcessor();       // Processes broadcasts across all connected instances
        startVerificationWorker();       // Verifies contacts using any connected socket
        startDisconnectWatcher();        // Watches for DISCONNECTING signals from dashboard

    } catch (e: any) {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
})();
