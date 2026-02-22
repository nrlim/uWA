import 'dotenv/config';

import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// INITIALIZATION
// WARNING: Start the process with --max-old-space-size=2048
// ============================================================================

const prisma = new PrismaClient();
const MEMORY_LIMIT_MB = 2048;
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
    connectingTimeout?: ReturnType<typeof setTimeout> | null;
    isPaused: boolean;
    pauseReason: string;
    qrAttempts: number;
    presenceInterval: ReturnType<typeof setTimeout> | null;
    connectionFailures: number;
    lastBroadcastActivity: number;

    // Per-instance state for multi-tenant isolation
    batchMessageCount: number;
    dailySentCount: number;
    lastActiveTime: number;
    lastDailyResetDate: string;
    mediaCache: { broadcastId: string, buffer: Buffer, url: string } | null;
    isProcessing: boolean;

    // ── Anti-Ban v5: Trust Tier System ──
    instanceCreatedAt: Date | null;       // When instance was first created (for age calc)
    sessionStartTime: number;             // When this session started (for ramp-up)
    totalSentSession: number;             // Total messages sent in this session
    consecutiveFailCount: number;         // Consecutive send failures (circuit breaker)
    lastActivityType: 'send' | 'idle' | 'read' | 'typing'; // Last simulated activity
}

const socketPool: Map<string, SocketEntry> = new Map();

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

    console.log(`[SESSION] Checking for presence of creds.json specifically at ${credsPath}`);
    if (!fs.existsSync(credsPath)) {
        console.log(`[SESSION] creds.json absent for ${instanceId} — fresh session will be created.`);
        return true; // No creds file = fresh start
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

function resetDailyCounterIfNeeded(entry: SocketEntry): void {
    const today = new Date().toDateString();
    if (today !== entry.lastDailyResetDate) {
        entry.dailySentCount = 0;
        entry.lastDailyResetDate = today;
        console.log(`[ANTI-BAN][${entry.instanceId}] Daily counter reset for new day.`);
    }
}

function isDailyLimitReached(entry: SocketEntry, dailyLimit: number): boolean {
    if (dailyLimit <= 0) return false;
    return entry.dailySentCount >= dailyLimit;
}

// ============================================================================
// 6. MEMORY MONITOR
// ============================================================================

function checkMemoryUsage(): { usedMB: number; ok: boolean } {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const ok = usedMB < MEMORY_LIMIT_MB * 0.85;

    if (usedMB > 1900) {
        let maxHeapMB = 0;
        let heaviestInstance = 'unknown';

        // Attempting to identify heaviest instance if possible (mocked placeholder if strict heap isn't available per-socket)
        console.error(`[MEMORY] 🚨 Critical RAM usage (${usedMB}MB / 2048MB). Heaviest instance roughly: ${heaviestInstance}. Initiating graceful restart.`);
        gracefulShutdown('MEM_EXCEEDED');
    }

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
// 9. ACCOUNT TRUST TIER SYSTEM (Anti-Ban v5)
// ============================================================================
// WhatsApp assigns internal "trust scores" to numbers. Fresh numbers that
// immediately begin outbound-only messaging are flagged by their AI.
// This tier system mirrors that logic and auto-adjusts sending behavior.

type TrustTier = 'NEWBORN' | 'INFANT' | 'ADOLESCENT' | 'MATURE' | 'VETERAN';

interface TierConfig {
    tier: TrustTier;
    label: string;
    batchSize: number;             // Messages before mandatory cooling
    batchCooldownMinMs: number;    // Min cooling duration
    batchCooldownMaxMs: number;    // Max cooling duration
    delayMultiplier: number;       // Multiplier on user-set delay (1.0 = no change)
    dailySoftCap: number;          // Suggested daily max (0 = use user setting)
    typingMultiplier: number;      // Multiplier on typing simulation duration
    preVerify: boolean;            // Whether to verify number exists before sending
    randomActivityChance: number;  // Chance (0-1) to simulate random activity between messages
    circuitBreakerThreshold: number; // Consecutive fails before auto-pause
}

const TIER_CONFIGS: Record<TrustTier, TierConfig> = {
    NEWBORN: {
        tier: 'NEWBORN',
        label: '🐣 Newborn (0-3 days)',
        batchSize: 3,
        batchCooldownMinMs: 300_000,   // 5 min
        batchCooldownMaxMs: 600_000,   // 10 min
        delayMultiplier: 3.0,          // 3x slower
        dailySoftCap: 25,
        typingMultiplier: 2.0,
        preVerify: true,
        randomActivityChance: 0.6,     // 60% chance of random activity
        circuitBreakerThreshold: 2,    // Very cautious
    },
    INFANT: {
        tier: 'INFANT',
        label: '🍼 Infant (3-7 days)',
        batchSize: 5,
        batchCooldownMinMs: 240_000,   // 4 min
        batchCooldownMaxMs: 480_000,   // 8 min
        delayMultiplier: 2.0,
        dailySoftCap: 50,
        typingMultiplier: 1.5,
        preVerify: true,
        randomActivityChance: 0.4,
        circuitBreakerThreshold: 3,
    },
    ADOLESCENT: {
        tier: 'ADOLESCENT',
        label: '🧒 Adolescent (7-14 days)',
        batchSize: 8,
        batchCooldownMinMs: 180_000,   // 3 min
        batchCooldownMaxMs: 360_000,   // 6 min
        delayMultiplier: 1.5,
        dailySoftCap: 100,
        typingMultiplier: 1.2,
        preVerify: true,
        randomActivityChance: 0.25,
        circuitBreakerThreshold: 3,
    },
    MATURE: {
        tier: 'MATURE',
        label: '🧑 Mature (14-30 days)',
        batchSize: 12,
        batchCooldownMinMs: 120_000,   // 2 min
        batchCooldownMaxMs: 300_000,   // 5 min
        delayMultiplier: 1.0,
        dailySoftCap: 0,               // Use user setting
        typingMultiplier: 1.0,
        preVerify: false,
        randomActivityChance: 0.15,
        circuitBreakerThreshold: 4,
    },
    VETERAN: {
        tier: 'VETERAN',
        label: '🎖️ Veteran (30+ days)',
        batchSize: 15,
        batchCooldownMinMs: 120_000,
        batchCooldownMaxMs: 300_000,
        delayMultiplier: 1.0,
        dailySoftCap: 0,
        typingMultiplier: 1.0,
        preVerify: false,
        randomActivityChance: 0.1,
        circuitBreakerThreshold: 5,
    },
};

function getAccountAgeDays(instanceCreatedAt: Date | null): number {
    if (!instanceCreatedAt) return 0; // Unknown = treat as brand new
    return Math.floor((Date.now() - instanceCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
}

function getAccountTrustTier(entry: SocketEntry): TierConfig {
    const ageDays = getAccountAgeDays(entry.instanceCreatedAt);
    const sessionHours = (Date.now() - entry.sessionStartTime) / (60 * 60 * 1000);

    // Override: If session just started (< 1 hour) AND account is < 7 days,
    // treat as NEWBORN regardless — the initial session is the riskiest window.
    if (sessionHours < 1 && ageDays < 7) {
        return TIER_CONFIGS.NEWBORN;
    }

    if (ageDays < 3) return TIER_CONFIGS.NEWBORN;
    if (ageDays < 7) return TIER_CONFIGS.INFANT;
    if (ageDays < 14) return TIER_CONFIGS.ADOLESCENT;
    if (ageDays < 30) return TIER_CONFIGS.MATURE;
    return TIER_CONFIGS.VETERAN;
}

// ============================================================================
// 9.5 PRE-SEND RECIPIENT VERIFICATION (Anti-Ban v5)
// ============================================================================
// Sending to numbers NOT registered on WhatsApp is one of the fastest ways to
// trigger a ban. WhatsApp tracks "delivery failure ratio" and flags accounts
// with high failure rates. This check prevents sending to dead numbers.

async function verifyRecipientBeforeSend(sock: any, jid: string, broadcastId: string): Promise<boolean> {
    try {
        const [result] = await sock.onWhatsApp(jid);
        if (result?.exists) {
            return true;
        }
        await logAntiBanAction(broadcastId, 'SKIP_INVALID', `Recipient ${jid} not on WhatsApp — skipped to protect trust score.`);
        console.log(`[ANTI-BAN] ⛔ Skipping ${jid} — not registered on WhatsApp.`);
        return false;
    } catch (err: any) {
        // If verification itself fails (network issue), allow the send to proceed
        // rather than blocking the entire queue.
        console.warn(`[ANTI-BAN] ⚠️ Pre-verify failed for ${jid}: ${err?.message}. Allowing send.`);
        return true;
    }
}

// ============================================================================
// 9.6 RANDOM ACTIVITY SIMULATION (Anti-Ban v5)
// ============================================================================
// WhatsApp's AI looks for "broadcast-only" patterns: accounts that ONLY send
// outbound messages with zero other activity. Injecting random human-like
// actions (going offline, reading, short browsing pauses) breaks this pattern.

async function simulateRandomActivity(entry: SocketEntry, broadcastId: string): Promise<void> {
    const sock = entry.sock;
    if (!sock) return;

    const activities = [
        async () => {
            // Simulate going offline briefly
            const offlineMs = randomInt(5000, 15000);
            await sock.sendPresenceUpdate('unavailable');
            await logAntiBanAction(broadcastId, 'STEALTH_OFFLINE', `Going offline for ${(offlineMs / 1000).toFixed(1)}s`);
            entry.lastActivityType = 'idle';
            await wait(offlineMs);
            await sock.sendPresenceUpdate('available');
        },
        async () => {
            // Simulate "reading" by subscribing to a random contact's presence
            const readMs = randomInt(3000, 8000);
            await logAntiBanAction(broadcastId, 'STEALTH_READ', `Simulating reading for ${(readMs / 1000).toFixed(1)}s`);
            entry.lastActivityType = 'read';
            await wait(readMs);
        },
        async () => {
            // Simulate a longer "browsing" pause (as if scrolling through chats)
            const browseMs = randomInt(8000, 20000);
            await logAntiBanAction(broadcastId, 'STEALTH_BROWSE', `Browsing pause ${(browseMs / 1000).toFixed(1)}s`);
            entry.lastActivityType = 'idle';
            await wait(browseMs);
        },
        async () => {
            // Simulate composing then discarding (start typing, pause, stop)
            await sock.sendPresenceUpdate('composing');
            const typePause = randomInt(2000, 5000);
            await wait(typePause);
            await sock.sendPresenceUpdate('paused');
            entry.lastActivityType = 'typing';
            await logAntiBanAction(broadcastId, 'STEALTH_DISCARD', `Started typing then discarded after ${(typePause / 1000).toFixed(1)}s`);
        },
    ];

    const activity = activities[randomInt(0, activities.length - 1)];
    try {
        await activity();
    } catch (err) {
        // Non-critical — don't let stealth activity crash the processor
        console.warn(`[STEALTH][${entry.instanceId}] Activity simulation failed (non-fatal):`, err);
    }
}

// ============================================================================
// 9.7 CONSECUTIVE FAIL CIRCUIT BREAKER (Anti-Ban v5)
// ============================================================================
// If multiple sends fail in a row, something is wrong (rate limit, ban in
// progress, network issue). Rather than continuing to hammer and making the
// ban worse, we auto-pause and cooldown.

async function handleCircuitBreaker(entry: SocketEntry, tierConfig: TierConfig, broadcastId: string): Promise<boolean> {
    if (entry.consecutiveFailCount >= tierConfig.circuitBreakerThreshold) {
        const cooldownMs = randomInt(60_000, 180_000); // 1-3 min emergency cooldown
        const cooldownSec = Math.round(cooldownMs / 1000);

        await logAntiBanAction(broadcastId, 'CIRCUIT_BREAKER',
            `🛑 ${entry.consecutiveFailCount} consecutive failures hit threshold (${tierConfig.circuitBreakerThreshold}). Emergency cooling ${cooldownSec}s.`
        );
        console.error(`[CIRCUIT BREAKER][${entry.instanceId}] 🛑 ${entry.consecutiveFailCount} consecutive fails. Emergency pause ${cooldownSec}s...`);

        if (entry.sock) {
            try { await entry.sock.sendPresenceUpdate('unavailable'); } catch { /* */ }
        }

        await wait(cooldownMs);

        if (entry.sock) {
            try { await entry.sock.sendPresenceUpdate('available'); } catch { /* */ }
        }

        entry.consecutiveFailCount = 0; // Reset after cooldown
        return true; // Signal that circuit breaker was triggered
    }
    return false;
}

// ============================================================================
// 9.8 SESSION VALIDATOR
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
        if (!currentEntry?.sock || currentEntry.isPaused) return;
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

    if (entry.connectingTimeout) {
        clearTimeout(entry.connectingTimeout);
        entry.connectingTimeout = null;
    }

    stopPresenceHeartbeat(instanceId);

    if (entry.sock) {
        try {
            // Priority 1: Extensive null-checks with optional chaining
            entry.sock?.ev?.removeAllListeners?.('creds.update');
            entry.sock?.ev?.removeAllListeners?.('connection.update');

            entry.sock?.ws?.close?.();

            if (typeof entry.sock?.end === 'function') {
                entry.sock?.end?.(undefined);
            }
        } catch (err) { /* ignore cleanup errors */ }
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

process.on('unhandledRejection', (reason, promise) => {
    console.warn('[WARNING] Unhandled Rejection at:', promise, 'reason:', reason);
    // Do not exit the process here to avoid dropping connections on loose socket timeouts
});

// ============================================================================
// 12. WHATSAPP CONNECTION — Per Instance
// ============================================================================

/**
 * Connects a single instance to WhatsApp.
 * Creates an isolated socket with its own session folder.
 * The instance must already exist in the database.
 */
const connectingLocks = new Set<string>();

async function connectInstance(instanceId: string, isReconnect: boolean = false): Promise<void> {
    if (connectingLocks.has(instanceId)) return;
    connectingLocks.add(instanceId);
    try {
        await _connectInstance(instanceId, isReconnect);
    } finally {
        connectingLocks.delete(instanceId);
    }
}

async function _connectInstance(instanceId: string, isReconnect: boolean = false): Promise<void> {
    console.log(`[Connection] ═══════════════════════════════════════════`);
    console.log(`[Connection] Initializing session for Instance: ${instanceId}`);
    console.log(`[Connection] ═══════════════════════════════════════════`);

    // Check if already in pool
    let previousFailures = 0;
    if (socketPool.has(instanceId)) {
        previousFailures = socketPool.get(instanceId)?.connectionFailures || 0;
        console.log(`[Connection] Socket already in pool for ${instanceId}. Cleaning up first...`);
        await cleanupSocketForInstance(instanceId, 'reconnection');
    }

    // Fetch instance to check status. If INITIALIZING from a fresh Dashboard click, wipe session for a clean slate.
    const instance = await prisma.instance.findUnique({ where: { id: instanceId } });
    if (!isReconnect && instance?.status === 'INITIALIZING') {
        console.log(`[Connection] 🆕 Status is INITIALIZING. Wiping session for ${instanceId} to ensure fresh keys.`);
        deleteSessionFolder(instanceId);
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

    // Fetch dynamic WA version from Baileys instead of hardcoding, prevents 405 Handshake rejections
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[Connection] Using WA v${version.join('.')} (isLatest: ${isLatest}) for ${instanceId}`);

    // Add random delay to prevent burst connection attempts that trigger 405
    const handshakeDelay = randomInt(2000, 5000);
    console.log(`[Connection] Delaying handshake by ${handshakeDelay}ms for ${instanceId}`);
    await wait(handshakeDelay);

    // ── Anti-Ban v5.1: Randomized Browser Fingerprint ──
    // A static browser identity like ['uWA','Chrome','120'] is a detectable
    // fingerprint. Rotating between realistic browser strings makes each
    // instance look like a different legitimate WhatsApp Web session.
    const BROWSER_FINGERPRINTS: [string, string, string][] = [
        ['Windows', 'Chrome', '122.0.6261.112'],
        ['Windows', 'Chrome', '123.0.6312.106'],
        ['Windows', 'Edge', '122.0.2365.92'],
        ['Windows', 'Edge', '123.0.2420.65'],
        ['Macintosh', 'Chrome', '122.0.6261.112'],
        ['Macintosh', 'Safari', '17.3.1'],
        ['Macintosh', 'Chrome', '123.0.6312.87'],
        ['Windows', 'Firefox', '124.0.1'],
        ['Windows', 'Chrome', '121.0.6167.160'],
        ['Macintosh', 'Safari', '17.4'],
    ];
    const browserFingerprint = BROWSER_FINGERPRINTS[randomInt(0, BROWSER_FINGERPRINTS.length - 1)];
    console.log(`[Connection] Browser fingerprint: ${browserFingerprint.join(' / ')} for ${instanceId}`);

    // ── Anti-Ban v5.1: Jittered Keep-Alive ──
    // A fixed 30s keepAlive is machine-detectable. Randomize between 25-45s.
    const keepAliveMs = randomInt(25_000, 45_000);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }) as any, // Prevent verbose disk I/O and memory explosion
        browser: browserFingerprint,
        mobile: false,

        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        // @ts-ignore - Aggressive Lite-Handshake to prevent memory spikes
        getNextSyncHistoryMessage: () => undefined,
        patchMessageBeforeSending: (message: any) => message,
        linkPreviewImageThumbnailWidth: 192,
        generateHighQualityLinkPreview: true,
        waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat',
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 30_000,
        keepAliveIntervalMs: keepAliveMs,
        printQRInTerminal: false,
        getMessage: async () => undefined,
    });

    // Register in socket pool
    // Fetch instance createdAt for trust tier calculation
    let instanceCreatedAt: Date | null = null;
    try {
        const inst = await prisma.instance.findUnique({ where: { id: instanceId }, select: { createdAt: true } });
        instanceCreatedAt = inst?.createdAt ?? null;
    } catch { /* fallback to null = treat as new */ }

    const poolEntry: SocketEntry = {
        sock,
        instanceId,
        qrTimeout: null,
        qrAttempts: 0,
        isPaused: false,
        pauseReason: '',
        presenceInterval: null,
        connectionFailures: previousFailures,
        lastBroadcastActivity: Date.now(),
        batchMessageCount: 0,
        dailySentCount: 0,
        lastActiveTime: Date.now(),
        lastDailyResetDate: new Date().toDateString(),
        mediaCache: null,
        isProcessing: false,
        // Anti-Ban v5 fields
        instanceCreatedAt,
        sessionStartTime: Date.now(),
        totalSentSession: 0,
        consecutiveFailCount: 0,
        lastActivityType: 'idle',
    };
    socketPool.set(instanceId, poolEntry);

    console.log(`[Connection] Socket created for ${instanceId}. Pool size: ${socketPool.size}`);

    sock.ev.on('creds.update', async () => {
        saveCreds();

        // ── Trigger Loading Screen immediately after QR Scan ──
        if (sock.authState.creds.me?.id) {
            try {
                // If it was waiting for a QR scan, transition it back to INITIALIZING
                // This triggers the frontend visual loading state indicating "Syncing Data"
                // instead of showing a frozen or outdated QR code to the user.
                const updated = await prisma.instance.updateMany({
                    where: { id: instanceId, status: 'QR_READY' },
                    data: { status: 'INITIALIZING', qrCode: '' },
                });
                if (updated.count > 0) {
                    console.log(`[Connection] QR successfully scanned for ${instanceId}. Switching to Loading/Syncing UI.`);
                }
            } catch { /* ignore */ }
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        console.log(`[Connection] Current State: ${connection || 'unchanged'} | Instance: ${instanceId}`);

        if (connection === 'connecting') {
            const entry = socketPool.get(instanceId);
            if (entry) {
                if (entry.connectingTimeout) {
                    clearTimeout(entry.connectingTimeout);
                }
                entry.connectingTimeout = setTimeout(async () => {
                    const currentEntry = socketPool.get(instanceId);
                    if (currentEntry) {
                        console.log(`[Connection] ⚠️ Stuck in connecting for > 90s. Forcing restart for ${instanceId}.`);
                        await cleanupSocketForInstance(instanceId, 'connecting_timeout');
                        try {
                            await prisma.instance.update({
                                where: { id: instanceId },
                                data: { status: 'DISCONNECTED', qrCode: '' },
                            });
                        } catch { }
                    }
                }, 90000);
            }

            // Bring back the loading screen by reverting statuses to INITIALIZING during the connection handshake
            try {
                // If it was QR_READY, but now connecting, it means the user probably just scanned the QR code.
                // We show INITIALIZING to indicate a loading spinner instead of sticking on the QR code screen.
                await prisma.instance.updateMany({
                    where: { id: instanceId, status: 'QR_READY' },
                    data: { status: 'INITIALIZING', qrCode: '' },
                });
            } catch { /* ignore */ }
        }

        // ── QR Code Received ──────────────────────────────────
        if (qr) {
            const entry = socketPool.get(instanceId);
            if (entry) {
                // Technically, receiving a QR means the connection succeeded in linking state.
                if (entry.connectingTimeout) {
                    clearTimeout(entry.connectingTimeout);
                    entry.connectingTimeout = null;
                }

                entry.qrAttempts++;
                console.log(`[Connection] QR Received for Instance: ${instanceId} (attempt #${entry.qrAttempts})`);

                // Give up immediately if too many attempts (6 attempts = ~120 seconds) to prevent frozen states
                if (entry.qrAttempts >= 6) {
                    console.log(`[Connection] ⚠️ QR not scanned after ${entry.qrAttempts} attempts for ${instanceId}. Closing for retry to save memory.`);
                    await cleanupSocketForInstance(instanceId, 'qr_timeout_max_attempts');
                    try {
                        await prisma.instance.update({
                            where: { id: instanceId },
                            data: { status: 'DISCONNECTED', qrCode: '' },
                        });
                    } catch { /* ignore */ }
                    return; // Stop further processing
                }

                // Clear previous QR timeout properly to avoid race conditions
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

                // QR Timeout: start guard
                entry.qrTimeout = setTimeout(async () => {
                    const currentEntry = socketPool.get(instanceId);
                    if (!currentEntry) return;

                    console.log(`[Connection] ⏰ QR timeout (${QR_TIMEOUT_MS / 1000}s) for ${instanceId}. Attempt #${currentEntry.qrAttempts}`);

                    // After 6 failed attempts (6 QR cycles), close and retry cleanly
                    if (currentEntry.qrAttempts >= 6) {
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
                    // < 6 attempts: Baileys will auto-generate new QR
                }, QR_TIMEOUT_MS);
            }
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const errorMessage = ((lastDisconnect?.error as Boom)?.message || '').toLowerCase();
            const payload = (lastDisconnect?.error as Boom)?.output?.payload;
            let shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 405;

            console.log(`[Connection] ❌ Connection closed for ${instanceId} (code: ${statusCode}, msg: ${errorMessage})`);
            if (payload) {
                console.log(`[Connection] Exact rejection reason for ${instanceId}:`, JSON.stringify(payload));
            }

            // ── Task 2: Bad session detection ──
            // These status codes indicate the session state is corrupted or rejected by WhatsApp.
            // 401 = Unauthorized (bad creds), 440 = Session replaced on another device
            const BAD_SESSION_CODES = [401, 403, 440];
            const payloadString = payload ? JSON.stringify(payload).toLowerCase() : '';
            const hasStreamOrHandshakeError =
                errorMessage.includes('stream errored') ||
                errorMessage.includes('handshake failure') ||
                payloadString.includes('stream error') ||
                payloadString.includes('handshake failure');

            const isBadSession =
                statusCode !== 405 &&
                (BAD_SESSION_CODES.includes(statusCode as number) ||
                    errorMessage.includes('bad session') ||
                    errorMessage.includes('qr refs over limit'));

            // ── TASK 1: Cooldown on Rate Limits BEFORE Reconnect Logic ──
            if (statusCode === 405 || isRateLimitError(lastDisconnect?.error)) {
                const errLabel = statusCode === 405 ? '405 Rate-Limit/Block' : 'Rate-Limit';
                console.log(`[SECURITY] 🛡️ ${errLabel} detected for ${instanceId}. Cooldown applying. Reconnecting automatically later.`);
                shouldReconnect = true; // Auto-reconnect enabled rather than killing the connection
            }

            if (statusCode === 515) {
                console.log(`[CRITICAL] 🔄 WhatsApp requested restart (515). Reconnecting stream for ${instanceId}.`);
                // CRITICAL FIX: DO NOT delete the session folder on 515!
                // A 515 is completely standard when a device is newly linked or network bounces.
                shouldReconnect = true;
                await wait(2000);
            }
            else if (hasStreamOrHandshakeError) {
                console.log(`[CRITICAL] Stream/Handshake dropped. Reconnecting session gracefully for ${instanceId}.`);
                // Stream drops are often purely network-based or temporary gateway checks. We should not delete auth keys here.
                shouldReconnect = true;
            }
            // Logged out → delete session for fresh QR
            else if (statusCode === DisconnectReason.loggedOut) {
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
            // Strict rule: Connection lost or timed out > 3 times
            else if (statusCode === DisconnectReason.connectionLost || statusCode === DisconnectReason.timedOut) {
                const entry = socketPool.get(instanceId);
                if (entry) {
                    entry.connectionFailures++;
                    console.log(`[Connection] ⚠️ Connection lost/timed out for ${instanceId} (Attempt ${entry.connectionFailures}/3)...`);
                    if (entry.connectionFailures > 3) {
                        console.log(`[Connection] ⚠️ Connection failed > 3 times. Deleting session for ${instanceId} and reverting to DISCONNECTED.`);
                        deleteSessionFolder(instanceId);
                        shouldReconnect = false; // Will revert to DISCONNECTED via below logic
                        entry.connectionFailures = 0;
                    }
                }
            }

            const trackEntry = socketPool.get(instanceId);
            let failures = trackEntry ? trackEntry.connectionFailures : 0;
            if (statusCode === 405) {
                // We keep it alive, just register it as a soft failure so it doesn't infinite loop with no delays
                failures++;
            }

            // Detect rate-limit
            if (isRateLimitError(lastDisconnect?.error)) {
                // Ensure reconnect happens, but throttle it heavily
                shouldReconnect = true;
                const currentEntry = socketPool.get(instanceId);

                if (currentEntry) {
                    currentEntry.isPaused = true;
                    currentEntry.pauseReason = 'RATE_LIMIT_BLOCKED';
                }

                await prisma.broadcast.updateMany({
                    where: { status: 'RUNNING', instanceId },
                    data: { status: 'PAUSED_RATE_LIMIT' },
                });
            }

            await cleanupSocketForInstance(instanceId, `connection_close_${statusCode}`);

            // Any other terminal error that dictates no reconnect can be handled here
            if (!shouldReconnect && statusCode !== 405 && !isRateLimitError(lastDisconnect?.error)) {
                try {
                    await prisma.instance.update({
                        where: { id: instanceId },
                        data: { status: 'DISCONNECTED', qrCode: '' },
                    });
                } catch (error) { }
            }

            if (shouldReconnect) {
                // Wait extensively on rate limits / 405 Handshakes before hammering connection attempts
                let reconnectDelay = (statusCode === 405 || isRateLimitError(lastDisconnect?.error))
                    ? randomInt(25000, 45000) // 25-45s cooldown
                    : randomInt(3000, 10000); // normal 3-10s cooldown

                // Prevent connection manager interference and persist failures
                socketPool.set(instanceId, { connectionFailures: failures } as any);

                console.log(`[Connection] 🔄 Reconnecting ${instanceId} in ${reconnectDelay / 1000}s...`);
                await wait(reconnectDelay);
                await connectInstance(instanceId, true); // Flag as reconnect to preserve creds.json folder!
            }
            // If not reconnecting (rare), the connection manager will eventually pick it up
        }

        // ── Connection Opened ─────────────────────────────────
        if (connection === 'open') {
            console.log(`[Connection] ✅ Connection opened for ${instanceId}`);

            // Clear timeouts
            const entry = socketPool.get(instanceId);
            if (entry) {
                if (entry.qrTimeout) {
                    clearTimeout(entry.qrTimeout);
                    entry.qrTimeout = null;
                }
                if (entry.connectingTimeout) {
                    clearTimeout(entry.connectingTimeout);
                    entry.connectingTimeout = null;
                }
                entry.qrAttempts = 0;
                entry.connectionFailures = 0; // Reset consecutive connection failures
                entry.isPaused = false;
                entry.pauseReason = '';
            }

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

            // ── Anti-Ban v5.1: Auto-Read Incoming Messages ──────────
            // WhatsApp's AI flags accounts that ONLY send outbound messages
            // with zero reads. This handler auto-marks incoming messages as
            // read with a realistic human delay, dramatically improving
            // the inbound/outbound ratio and trust score.
            sock.ev.on('messages.upsert', async (m: any) => {
                try {
                    const entry = socketPool.get(instanceId);
                    if (!entry?.sock) return;

                    for (const msg of m.messages) {
                        // Only process incoming messages (not our own outbound)
                        if (msg.key.fromMe) continue;
                        // Skip status/broadcast messages
                        if (msg.key.remoteJid === 'status@broadcast') continue;
                        if (!msg.key.remoteJid) continue;

                        // Simulate human reading delay (2-8 seconds)
                        const readDelay = randomInt(2000, 8000);
                        setTimeout(async () => {
                            try {
                                const currentEntry = socketPool.get(instanceId);
                                if (!currentEntry?.sock) return;

                                // Mark message as read (sends blue ticks)
                                await currentEntry.sock.readMessages([msg.key]);
                                console.log(`[AUTO-READ][${instanceId}] 📖 Read message from ${msg.key.remoteJid} (after ${(readDelay / 1000).toFixed(1)}s)`);
                            } catch {
                                // Non-critical — don't crash on read receipt failures
                            }
                        }, readDelay);
                    }
                } catch {
                    // Silently ignore — auto-read is a best-effort feature
                }
            });

            // Trigger parallel processor for this instance
            processBroadcastForInstance(instanceId).catch(err => {
                console.error(`[PROCESSOR] Fatal error in loop for ${instanceId}:`, err);
            });
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
            // Cleanup missing instances
            const activePoolInstances = Array.from(socketPool.keys());
            if (activePoolInstances.length > 0) {
                const dbInstances = await prisma.instance.findMany({
                    where: { id: { in: activePoolInstances } },
                    select: { id: true, status: true }
                });

                const dbStatusMap = new Map(dbInstances.map(i => [i.id, i.status]));

                for (const id of activePoolInstances) {
                    const status = dbStatusMap.get(id);
                    if (status === 'DISCONNECTED') {
                        console.log(`[CONNECTION MANAGER] 🧹 Instance ${id} is DISCONNECTED in DB but in pool. Cleaning up...`);
                        await cleanupSocketForInstance(id, 'manual_disconnect_sync');
                    }
                }
            }

            // Find all instances that are INITIALIZING that need a connection
            const candidates = await prisma.instance.findMany({
                where: {
                    status: 'INITIALIZING',
                    users: { some: {} } // Only instances that have at least 1 user linked
                },
                select: { id: true, phoneNumber: true, status: true, updatedAt: true },
                take: 5 // Process max 5 at a time to prevent CPU/IO spikes during connection bursts
            });

            const validCandidates = [];
            for (let i = 0; i < candidates.length; i++) {
                const instance = candidates[i];
                if (instance.status === 'INITIALIZING') {
                    const updatedAtTime = new Date(instance.updatedAt).getTime();
                    const ageSeconds = (Date.now() - updatedAtTime) / 1000;

                    if (!socketPool.has(instance.id) && !connectingLocks.has(instance.id)) {
                        if (ageSeconds > 120) {
                            console.log(`[CONNECTION MANAGER] ⏰ Instance ${instance.id} stuck in INITIALIZING for > 2m. Reverting to DISCONNECTED.`);
                            await prisma.instance.update({
                                where: { id: instance.id },
                                data: { status: 'DISCONNECTED' }
                            });
                            continue;
                        }
                        validCandidates.push(instance);
                    }
                }
            }

            // Diagnostic: log scan results only when candidates found
            if (validCandidates.length > 0) {
                console.log(`[CONNECTION MANAGER] Scan: ${validCandidates.length} INITIALIZING candidate(s) found. Pool Size: ${socketPool.size}`);
            }

            for (const instance of validCandidates) {
                // Skip if already in pool or connecting lock
                if (socketPool.has(instance.id) || connectingLocks.has(instance.id)) {
                    continue;
                }

                console.log(`[CONNECTION MANAGER] 🆕 Candidate instance found: ${instance.id} (${instance.phoneNumber}) | status: ${instance.status}`);

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

async function simulateTyping(entry: SocketEntry, jid: string, broadcastId: string, minMs: number = 3000, maxMs: number = 7000): Promise<number> {
    const sock = entry.sock;
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
        console.warn(`[TYPING][${entry.instanceId}] Presence update failed (non-fatal):`, err);
    }

    return typingDuration;
}

// ============================================================================
// 15. BATCH COOLING (Anti-Ban v5: Tier-Aware)
// ============================================================================

// Legacy fallback constants (used when tier is not available)
const BATCH_COOLDOWN_EVERY_DEFAULT = 15;
const BATCH_COOLDOWN_MIN_MS_DEFAULT = 120 * 1000;
const BATCH_COOLDOWN_MAX_MS_DEFAULT = 300 * 1000;

async function applyBatchCoolingIfNeeded(entry: SocketEntry, broadcastId: string, tierConfig?: TierConfig): Promise<void> {
    entry.batchMessageCount++;

    const batchSize = tierConfig?.batchSize ?? BATCH_COOLDOWN_EVERY_DEFAULT;
    const cooldownMinMs = tierConfig?.batchCooldownMinMs ?? BATCH_COOLDOWN_MIN_MS_DEFAULT;
    const cooldownMaxMs = tierConfig?.batchCooldownMaxMs ?? BATCH_COOLDOWN_MAX_MS_DEFAULT;

    if (entry.batchMessageCount >= batchSize) {
        const cooldownMs = randomInt(cooldownMinMs, cooldownMaxMs);
        const cooldownSec = Math.round(cooldownMs / 1000);

        await logAntiBanAction(broadcastId, 'COOLDOWN',
            `[${tierConfig?.label ?? 'DEFAULT'}] Batch cooling: ${cooldownSec}s after ${entry.batchMessageCount}/${batchSize} messages`
        );
        console.log(`[BATCH COOL][${entry.instanceId}] 🧊 ${cooldownSec}s rest after ${entry.batchMessageCount}/${batchSize} messages [${tierConfig?.tier ?? 'DEFAULT'}]...`);

        if (entry.sock) {
            try { await entry.sock.sendPresenceUpdate('unavailable'); } catch { /* non-critical */ }
        }

        await wait(cooldownMs);

        if (entry.sock) {
            try { await entry.sock.sendPresenceUpdate('available'); } catch { /* non-critical */ }
        }

        entry.batchMessageCount = 0;
        console.log(`[BATCH COOL][${entry.instanceId}] ✅ Cooling complete. Resuming...`);
    }
}

// ============================================================================
// 16. BROADCAST PROCESSOR — Multi-tenant aware
// ============================================================================

async function processBroadcastForInstance(instanceId: string) {
    const entry = socketPool.get(instanceId);
    if (!entry || entry.isProcessing) return;
    entry.isProcessing = true;

    console.log(`[PROCESSOR][${instanceId}] Loop started.`);

    try {
        while (true) {
            try {
                // ── Verify Loop Still Valid ──────────────────────────
                const currentEntry = socketPool.get(instanceId);
                if (!currentEntry) {
                    console.log(`[PROCESSOR][${instanceId}] Instance removed from pool. Loop exiting.`);
                    break;
                }

                const activeSock = currentEntry.sock;
                if (!activeSock) {
                    console.log(`[PROCESSOR][${instanceId}] Socket gone. Loop exiting.`);
                    break;
                }

                if (currentEntry.isPaused) {
                    await wait(10000);
                    continue;
                }

                // ── Memory Check ──────────────────────────────────
                const mem = checkMemoryUsage();
                if (mem.usedMB > 1500) {
                    console.warn(`[MEMORY][${instanceId}] ⚠️ High usage: ${mem.usedMB}MB / ${MEMORY_LIMIT_MB}MB`);
                    if (global.gc) {
                        global.gc();
                    }
                }

                // ── Find Active Broadcast for THIS instance ──
                const broadcast = await prisma.broadcast.findFirst({
                    where: {
                        status: { in: ['PENDING', 'RUNNING'] },
                        instanceId: instanceId,
                    },
                    orderBy: { updatedAt: 'asc' },
                    include: {
                        user: true,
                        messages: {
                            where: { status: 'PENDING' },
                            take: 10, // Optimize DB queries by taking a batch of 10 messages
                        },
                    },
                });

                if (!broadcast) {
                    const idleTime = Date.now() - currentEntry.lastActiveTime;
                    if (idleTime > 5 * 60 * 1000) {
                        // console.log(`[PROCESSOR][${instanceId}] Idle for 5m. Waiting for new broadcasts...`);
                    }
                    await wait(10000);
                    continue;
                }

                currentEntry.lastActiveTime = Date.now();
                currentEntry.lastBroadcastActivity = Date.now();

                // ── Credit Check Guard ────────────────────────────
                if (broadcast.user.credit <= 0) {
                    await logAntiBanAction(broadcast.id, 'CREDIT_EXHAUSTED', `User ${broadcast.user.username} has 0 credits.`);
                    console.warn(`[CREDIT][${instanceId}] ⛔ User ${broadcast.user.username} has 0 credits.`);
                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'PAUSED_NO_CREDIT' }
                    });
                    continue;
                }

                // ── Compute Trust Tier ──────────────────────────────
                const tierConfig = getAccountTrustTier(currentEntry);
                const ageDays = getAccountAgeDays(currentEntry.instanceCreatedAt);
                const ageHours = currentEntry.instanceCreatedAt
                    ? (Date.now() - currentEntry.instanceCreatedAt.getTime()) / (60 * 60 * 1000)
                    : 0;

                // ── Anti-Ban v5.1: Warm-Up Enforcement ───────────────
                // Accounts less than 24 hours old MUST NOT broadcast.
                // WhatsApp's AI immediately flags brand-new numbers that
                // start mass-messaging within the first day.
                if (ageHours < 24 && !broadcast.isTurboMode) {
                    const remainingHours = Math.ceil(24 - ageHours);
                    await logAntiBanAction(broadcast.id, 'WARMUP_BLOCK',
                        `🛑 Account is ${ageHours.toFixed(1)}h old. Blocked from broadcasting for ${remainingHours}h (warm-up period).`
                    );
                    console.warn(`[WARMUP][${instanceId}] 🛑 Account only ${ageHours.toFixed(1)}h old. Must warm up for ${remainingHours}h more. Skipping broadcast.`);

                    // Don't fail the broadcast — just pause it until warm-up completes
                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'PAUSED_WORKING_HOURS' },
                    });

                    // Sleep in chunks until warm-up period ends
                    const sleepMs = remainingHours * 60 * 60 * 1000;
                    const chunkMs = 5 * 60 * 1000; // Check every 5 minutes
                    const totalChunks = Math.ceil(sleepMs / chunkMs);
                    for (let i = 0; i < totalChunks; i++) {
                        await wait(Math.min(chunkMs, sleepMs - i * chunkMs));
                        if (currentEntry?.isPaused) break;
                    }

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'RUNNING' },
                    });
                    continue;
                }

                // Log tier on first broadcast or when starting
                if (broadcast.status === 'PENDING') {
                    await logAntiBanAction(broadcast.id, 'TRUST_TIER',
                        `Account: ${tierConfig.label} | Age: ${ageDays}d | Batch: ${tierConfig.batchSize} | Delay: ×${tierConfig.delayMultiplier} | Verify: ${tierConfig.preVerify}`
                    );
                    console.log(`[TRUST TIER][${instanceId}] ${tierConfig.label} | Age: ${ageDays}d | Multiplier: ×${tierConfig.delayMultiplier}`);

                    // ── Anti-Ban v5.1: Link Detection Guard ──────────
                    // Sending URLs in broadcast messages is the #1 ban trigger
                    // for new accounts. Warn in logs and for NEWBORN/INFANT,
                    // strip or block links entirely.
                    const URL_PATTERNS = /https?:\/\/|www\.|bit\.ly|wa\.me|t\.me|goo\.gl|tinyurl|linktr\.ee/gi;
                    if (URL_PATTERNS.test(broadcast.message)) {
                        if (tierConfig.tier === 'NEWBORN' || tierConfig.tier === 'INFANT') {
                            await logAntiBanAction(broadcast.id, 'LINK_WARNING',
                                `⚠️ CRITICAL: Message contains URLs but account is ${tierConfig.label}. Links are the #1 ban trigger for new accounts!`
                            );
                            console.warn(`[LINK GUARD][${instanceId}] ⚠️ CRITICAL: Broadcast "${broadcast.name}" contains links but account is ${tierConfig.tier}. HIGH BAN RISK!`);
                        } else {
                            await logAntiBanAction(broadcast.id, 'LINK_DETECTED',
                                `ℹ️ Message contains URLs. Account is ${tierConfig.label} — moderate risk.`
                            );
                        }
                    }
                }

                // ── Session Validation (on first message of batch) ───
                if (broadcast.status === 'PENDING') {
                    const memStart = checkMemoryUsage();
                    console.log(`[LIFECYCLE][${instanceId}] Starting broadcast "${broadcast.name}". Memory: ${memStart.usedMB}MB`);

                    const sessionOk = await validateSessionForInstance(instanceId);
                    await logAntiBanAction(
                        broadcast.id, 'SESSION_VALIDATE',
                        sessionOk ? 'Session healthy' : 'Session unhealthy'
                    );

                    if (!sessionOk) {
                        console.warn(`[SESSION][${instanceId}] Session invalid. Delaying 10s...`);
                        await wait(10000);
                        continue;
                    }

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'RUNNING' },
                    });
                    currentEntry.batchMessageCount = 0;
                }

                // ── Human Clock Gate ──────────────────────────────
                const workStart = broadcast.workingHourStart ?? 5;
                const workEnd = broadcast.workingHourEnd ?? 23;

                if (!broadcast.isTurboMode && !isWithinWorkingHours(workStart, workEnd)) {
                    const sleepMs = msUntilWorkingHoursStart(workStart);
                    const sleepMin = Math.round(sleepMs / 60000);

                    await logAntiBanAction(broadcast.id, 'WORKING_HOURS_PAUSE',
                        `SLEEP MODE: Outside hours (${workStart}:00-${workEnd}:00). Sleeping ~${sleepMin} min.`
                    );
                    console.log(`[HUMAN CLOCK][${instanceId}] 🌙 Sleep Mode. Pausing ~${sleepMin} min...`);

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'PAUSED_WORKING_HOURS' },
                    });

                    try { await activeSock.sendPresenceUpdate('unavailable'); } catch { /* */ }

                    const chunks = Math.ceil(sleepMs / 60000);
                    for (let i = 0; i < chunks; i++) {
                        await wait(Math.min(60000, sleepMs - i * 60000));
                        if (currentEntry?.isPaused) break;
                    }

                    try { await activeSock.sendPresenceUpdate('available'); } catch { /* */ }

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'RUNNING' },
                    });
                    console.log(`[HUMAN CLOCK][${instanceId}] ☀️ Waking up. Resuming.`);
                    continue;
                }

                // ── Daily Limit Gate (Tier-Aware) ──────────────────
                resetDailyCounterIfNeeded(currentEntry);
                let dailyLimit = broadcast.dailyLimit ?? 0;

                // Anti-Ban v5: Enforce tier soft-cap for young accounts
                // If the user set no limit (0) or set it higher than the tier allows,
                // clamp it to the tier's safe cap to protect new numbers.
                if (tierConfig.dailySoftCap > 0) {
                    if (dailyLimit <= 0 || dailyLimit > tierConfig.dailySoftCap) {
                        if (dailyLimit !== tierConfig.dailySoftCap) {
                            console.log(`[TRUST TIER][${instanceId}] ⚠️ Daily limit clamped: ${dailyLimit || '∞'} → ${tierConfig.dailySoftCap} (${tierConfig.label})`);
                        }
                        dailyLimit = tierConfig.dailySoftCap;
                    }
                }

                if (isDailyLimitReached(currentEntry, dailyLimit)) {
                    const sleepMs = msUntilWorkingHoursStart(workStart);
                    const sleepHrs = (sleepMs / 3600000).toFixed(1);

                    await logAntiBanAction(broadcast.id, 'COOLDOWN',
                        `[${tierConfig.label}] Daily limit reached (${currentEntry.dailySentCount}/${dailyLimit}). Pausing ~${sleepHrs}h.`
                    );
                    console.log(`[DAILY LIMIT][${instanceId}] 📊 ${currentEntry.dailySentCount}/${dailyLimit} [${tierConfig.tier}]. Pausing ~${sleepHrs}h...`);

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'PAUSED_WORKING_HOURS' },
                    });

                    const fiveMin = 5 * 60 * 1000;
                    const totalChunks = Math.ceil(sleepMs / fiveMin);
                    for (let i = 0; i < totalChunks; i++) {
                        await wait(Math.min(fiveMin, sleepMs - i * fiveMin));
                        resetDailyCounterIfNeeded(currentEntry);
                        if (!isDailyLimitReached(currentEntry, dailyLimit)) break;
                        if (currentEntry?.isPaused) break;
                    }

                    await prisma.broadcast.update({
                        where: { id: broadcast.id },
                        data: { status: 'RUNNING' },
                    });
                    continue;
                }

                // ── Process Message Batch ─────────────────────────
                const pendingMessages = broadcast.messages;

                if (pendingMessages.length === 0) {
                    const remaining = await prisma.message.count({
                        where: { broadcastId: broadcast.id, status: 'PENDING' },
                    });

                    if (remaining === 0) {
                        const memEnd = checkMemoryUsage();
                        console.log(`[LIFECYCLE][${instanceId}] Broadcast "${broadcast.name}" completed. Memory: ${memEnd.usedMB}MB`);

                        await prisma.broadcast.update({
                            where: { id: broadcast.id },
                            data: { status: 'COMPLETED' },
                        });

                        currentEntry.batchMessageCount = 0;
                        currentEntry.mediaCache = null;
                        currentEntry.lastActiveTime = Date.now();
                        console.log(`[LIFECYCLE][${instanceId}] Cleanup finished for "${broadcast.name}".`);
                    }
                    await wait(2000);
                    continue;
                }

                for (const messageTask of pendingMessages) {
                    if (currentEntry.isPaused) break; // Exit chunk if paused

                    // ── Circuit Breaker Check ─────────────────────────
                    const breakerTriggered = await handleCircuitBreaker(currentEntry, tierConfig, broadcast.id);
                    if (breakerTriggered) continue; // Retry after cooldown

                    // ── Format Recipient JID ──────────────────────────
                    let number = messageTask.recipient.trim().replace(/\D/g, '');
                    if (number.startsWith('08')) {
                        number = '62' + number.substring(1);
                    }
                    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

                    // ── Pre-Send Verification (Tier-Dependent) ────────
                    // For young accounts, verify the number exists on WhatsApp
                    // before sending to avoid delivery failures that tank trust.
                    if (tierConfig.preVerify && !broadcast.isTurboMode) {
                        const isValid = await verifyRecipientBeforeSend(activeSock, jid, broadcast.id);
                        if (!isValid) {
                            // Mark as FAILED with clear reason, don't send
                            await prisma.message.update({
                                where: { id: messageTask.id },
                                data: { status: 'FAILED', error: 'Recipient not on WhatsApp (pre-verified)' },
                            });
                            await prisma.broadcast.update({ where: { id: broadcast.id }, data: { failed: { increment: 1 } } });
                            await wait(randomInt(1000, 3000)); // small pause between verifications
                            continue;
                        }
                        await wait(randomInt(500, 1500)); // Brief pause after verification
                    }

                    // ── Random Activity Simulation (Tier-Dependent) ───
                    // Inject human-like behavior between messages to break
                    // the "only sends outbound" pattern.
                    if (!broadcast.isTurboMode && Math.random() < tierConfig.randomActivityChance) {
                        await simulateRandomActivity(currentEntry, broadcast.id);
                    }

                    // ── Process Spintax ───────────────────────────────
                    const spintaxResult = processSpintax(broadcast.message);
                    await logAntiBanAction(broadcast.id, 'SPINTAX', `"${spintaxResult.substring(0, 100)}"`);

                    // ── Append Zero-Width Suffix ──────────────────────
                    const { result: finalContent, suffix: zwSuffix } = appendZeroWidthSuffix(spintaxResult);
                    await logAntiBanAction(broadcast.id, 'UNIQUE_SUFFIX', zwSuffix);

                    // ── Simulate Typing & Delays (Tier-Scaled) ───────
                    const hasMedia = !!(broadcast as any).imageUrl;
                    const isTurbo = broadcast.isTurboMode;

                    // Calculate Typing Duration (multiplied by tier)
                    const baseTyping = spintaxResult.length * 50;
                    const typingMin = Math.round((hasMedia ? 5000 + baseTyping : Math.max(3000, baseTyping)) * tierConfig.typingMultiplier);
                    const typingMax = typingMin + Math.round(3000 * tierConfig.typingMultiplier);
                    const typingDurationMs = await simulateTyping(currentEntry, jid, broadcast.id, typingMin, typingMax);

                    // Calculate Delay after send (multiplied by tier)
                    const baseMinDelay = (broadcast.delayMin || 20) * 1000;
                    const baseMaxDelay = (broadcast.delayMax || 60) * 1000;
                    const scaledMinDelay = Math.round(baseMinDelay * tierConfig.delayMultiplier);
                    const scaledMaxDelay = Math.round(baseMaxDelay * tierConfig.delayMultiplier);
                    // Add jitter: ±15% random variance to prevent machine-perfect intervals
                    const jitterFactor = 0.85 + Math.random() * 0.3; // 0.85 to 1.15
                    const delay = Math.round(randomInt(scaledMinDelay, Math.max(scaledMinDelay, scaledMaxDelay)) * jitterFactor);

                    // ── anti_banned_meta ──────────────────────────────
                    const antiBannedMeta = {
                        spintaxVariant: spintaxResult.substring(0, 200),
                        zwSuffix,
                        typingDurationMs,
                        delayAfterMs: delay,
                        batchIndex: currentEntry.batchMessageCount + 1,
                        dailyIndex: currentEntry.dailySentCount + 1,
                        memoryMB: checkMemoryUsage().usedMB,
                        timestamp: new Date().toISOString(),
                        hasMedia,
                        instanceId: instanceId,
                        isTurboMode: isTurbo,
                        // Anti-Ban v5 metadata
                        trustTier: tierConfig.tier,
                        accountAgeDays: ageDays,
                        delayMultiplier: tierConfig.delayMultiplier,
                        consecutiveFails: currentEntry.consecutiveFailCount,
                        totalSentSession: currentEntry.totalSentSession,
                    };

                    // ── Send Message ──────────────────────────────────
                    console.log(`📤 [${instanceId.slice(0, 8)}] Sending to ${jid} [batch #${antiBannedMeta.batchIndex}/${tierConfig.batchSize}]${hasMedia ? ' + 🖼️' : ''} ${isTurbo ? '[⚡TURBO]' : ''} [${tierConfig.tier}]...`);

                    let messageStatusUpdated = false;
                    try {
                        if (hasMedia) {
                            const imageUrl = (broadcast as any).imageUrl;
                            let mediaPayload: any = { url: imageUrl };

                            if (!currentEntry.mediaCache || currentEntry.mediaCache.broadcastId !== broadcast.id || currentEntry.mediaCache.url !== imageUrl) {
                                console.log(`[CACHE][${instanceId}] New media for broadcast ${broadcast.id}`);

                                let buffer: Buffer | null = null;
                                if (imageUrl.startsWith('/')) {
                                    let localPath = path.join(process.cwd(), 'public', imageUrl);
                                    if (!fs.existsSync(localPath)) localPath = path.join(process.cwd(), '../public', imageUrl);
                                    if (fs.existsSync(localPath)) {
                                        buffer = fs.readFileSync(localPath);
                                        console.log(`[MEDIA][${instanceId}] Loaded from local file:`, localPath);
                                    }
                                } else if (imageUrl.startsWith('http')) {
                                    try {
                                        console.log(`[MEDIA][${instanceId}] Downloading:`, imageUrl);
                                        const res = await fetch(imageUrl);
                                        if (res.ok) {
                                            const arrayBuffer = await res.arrayBuffer();
                                            buffer = Buffer.from(arrayBuffer);
                                            console.log(`[MEDIA][${instanceId}] Cached ${buffer.length} bytes.`);
                                        }
                                    } catch (err) {
                                        console.error(`[MEDIA][${instanceId}] Download failed:`, err);
                                    }
                                }

                                currentEntry.mediaCache = buffer ? { broadcastId: broadcast.id, url: imageUrl, buffer } : null;
                            }

                            if (currentEntry.mediaCache?.buffer) mediaPayload = currentEntry.mediaCache.buffer;

                            let timer: NodeJS.Timeout;
                            const timeoutPromise = new Promise((_, reject) => {
                                timer = setTimeout(() => reject(new Error('Send Media Timeout (60s)')), 60000);
                            });

                            const sendPromise = activeSock.sendMessage(jid, { image: mediaPayload, caption: finalContent });
                            await Promise.race([sendPromise, timeoutPromise]).finally(() => clearTimeout(timer!));
                        } else {
                            let timer: NodeJS.Timeout;
                            const timeoutPromise = new Promise((_, reject) => {
                                timer = setTimeout(() => reject(new Error('Send Text Timeout (30s)')), 30000);
                            });

                            const sendPromise = activeSock.sendMessage(jid, { text: finalContent });
                            await Promise.race([sendPromise, timeoutPromise]).finally(() => clearTimeout(timer!));
                        }

                        await prisma.message.update({
                            where: { id: messageTask.id },
                            data: { status: 'SENT', sentAt: new Date(), content: spintaxResult, antiBannedMeta: antiBannedMeta as any },
                        });

                        await prisma.broadcast.update({ where: { id: broadcast.id }, data: { sent: { increment: 1 } } });
                        await prisma.user.update({ where: { id: broadcast.userId }, data: { credit: { decrement: 1 } } });

                        messageStatusUpdated = true;
                        currentEntry.dailySentCount++;
                        currentEntry.totalSentSession++;
                        currentEntry.consecutiveFailCount = 0; // Reset on success
                        currentEntry.lastActivityType = 'send';
                        console.log(`✅ [${instanceId.slice(0, 8)}] Sent. [Batch: ${currentEntry.batchMessageCount + 1}/${tierConfig.batchSize} | Daily: ${currentEntry.dailySentCount}/${dailyLimit || '∞'} | Session: ${currentEntry.totalSentSession}] [${tierConfig.tier}]`);
                    } catch (err: any) {
                        console.error(`❌ [${instanceId.slice(0, 8)}] Failed to send to ${jid}:`, err?.message || err);
                        currentEntry.consecutiveFailCount++;

                        if (isRateLimitError(err)) {
                            currentEntry.isPaused = true;
                            currentEntry.pauseReason = `Rate-limit on send: ${err?.message || 'Unknown'}`;
                            await logAntiBanAction(broadcast.id, 'RATE_LIMIT_PAUSE', `[${tierConfig.tier}] ${currentEntry.pauseReason}`);
                            await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: 'PAUSED_RATE_LIMIT' } });
                            console.error(`[CRITICAL][${instanceId}] 🛑 ${currentEntry.pauseReason}`);
                            messageStatusUpdated = true;
                            break; // Stop inner chunk loop
                        }

                        await prisma.message.update({
                            where: { id: messageTask.id },
                            data: { status: 'FAILED', error: err?.message || 'Unknown Error', antiBannedMeta: antiBannedMeta as any },
                        });
                        await prisma.broadcast.update({ where: { id: broadcast.id }, data: { failed: { increment: 1 } } });
                        messageStatusUpdated = true;
                    } finally {
                        if (!messageStatusUpdated) {
                            try {
                                console.warn(`[FAILSAFE][${instanceId}] Message ${messageTask.id} not updated. Forcing FAILED.`);
                                await prisma.message.update({
                                    where: { id: messageTask.id },
                                    data: { status: 'FAILED', error: 'Unhandled Error/Timeout', antiBannedMeta: antiBannedMeta as any },
                                });
                                await prisma.broadcast.update({ where: { id: broadcast.id }, data: { failed: { increment: 1 } } });
                            } catch (fatalErr) {
                                console.error(`[FATAL][${instanceId}] Failed to update message status:`, fatalErr);
                            }
                        }
                    }

                    // ── Batch Cooling (Tier-Aware) ────────────────────
                    await applyBatchCoolingIfNeeded(currentEntry, broadcast.id, tierConfig);

                    // ── Delay (Tier-Scaled) ───────────────────────────
                    console.log(`⏳ [${instanceId.slice(0, 8)}] Waiting ${(delay / 1000).toFixed(1)}s [×${tierConfig.delayMultiplier} ${tierConfig.tier}]...`);
                    await wait(delay);
                }

            } catch (e: any) {
                console.error(`[PROCESSOR][${instanceId}] Error in loop:`, e);
                await wait(5000);
            }
        }
    } finally {
        // Ensure flag is reset if loop drops
        const freshEntry = socketPool.get(instanceId);
        if (freshEntry) {
            freshEntry.isProcessing = false;
            console.log(`[PROCESSOR][${instanceId}] Loop exited reliably. Removed processing lock.`);
        }
    }
}

async function startBroadcastProcessor() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Anti-Ban Broadcast Processor v5.0 (Trust Tier Engine)');
    console.log('   ├─ Trust Tier System: NEWBORN → VETERAN ✓');
    console.log('   ├─ Pre-Send Verification: Active (tier-dependent) ✓');
    console.log('   ├─ Random Activity Simulation: Active ✓');
    console.log('   ├─ Circuit Breaker: Active (tier-dependent) ✓');
    console.log('   ├─ Tier-Aware Batch Cooling: Active ✓');
    console.log('   ├─ Adaptive Delay Multipliers: Active ✓');
    console.log('   ├─ Daily Soft-Cap Enforcement: Active ✓');
    console.log('   ├─ Timing Jitter (±15%): Active ✓');
    console.log('   ├─ Multi-Tenant Isolation: Guaranteed ✓');
    console.log('   └─ Non-Blocking Processor Architecture ✓');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // This function now just logs start. The loops are triggered per connection.
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
            const sock = getAnyConnectedSocket();
            if (!sock) {
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
                if (!currentSock) break;

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
        console.log('  uWA Worker — Anti-Ban Trust Tier Engine v5.0');
        console.log(`  Memory Limit: ${MEMORY_LIMIT_MB}MB`);
        console.log(`  QR Timeout: ${QR_TIMEOUT_MS / 1000}s`);
        console.log(`  Session Dir: ${SESSIONS_DIR}`);
        console.log(`  Connection Scan Interval: ${CONNECTION_SCAN_INTERVAL_MS / 1000}s`);
        console.log(`  Human Clock: Active 05:00–23:00`);
        console.log(`  Trust Tiers: NEWBORN(3d) → INFANT(7d) → ADOLESCENT(14d) → MATURE(30d) → VETERAN`);
        console.log(`  NEWBORN: 3 msg/batch, ×3 delay, 25/day cap, pre-verify ON`);
        console.log(`  VETERAN: 15 msg/batch, ×1 delay, no cap, pre-verify OFF`);
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
