/**
 * DevPulse Sliding-Window Rate Limiting Engine
 * Prevents telemetry ingestion spikes using granular sliding-window timestamps
 */
class SlidingWindowRateLimiter {
    constructor(limit = 5, windowMs = 60000) {
        this.limit = limit;         // Max allowed requests
        this.windowMs = windowMs;   // Time window in milliseconds (e.g., 60s)
        this.records = new Map();   // In-memory key-value store (clientIp -> timestamps[])
    }

    isAllowed(clientKey) {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        // Fetch existing timestamps for this client or initialize empty array
        const timestamps = this.records.get(clientKey) || [];

        // 1. Sliding Window Pruning: Discard timestamps older than the active window
        const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);

        // 2. Check if threshold exceeded
        if (validTimestamps.length >= this.limit) {
            const oldestValid = validTimestamps[0];
            const retryAfterSec = Math.ceil((oldestValid + this.windowMs - now) / 1000);

            return {
                allowed: false,
                statusCode: 429,
                remaining: 0,
                retryAfter: retryAfterSec,
                message: `Too Many Requests. Try again in ${retryAfterSec}s.`
            };
        }

        // 3. Register current hit & persist updated window
        validTimestamps.push(now);
        this.records.set(clientKey, validTimestamps);

        return {
            allowed: true,
            statusCode: 200,
            remaining: this.limit - validTimestamps.length,
            retryAfter: 0,
            message: "Request accepted."
        };
    }
}

// === CLI Simulation for Day 2 Verification ===
if (require.main === module) {
    console.log("⚡ DevPulse: Testing Sliding-Window Rate Limiter (Limit: 3 req / 5s)...\n");
    const limiter = new SlidingWindowRateLimiter(3, 5000);
    const clientIp = "192.168.1.101";

    const testRuns = [];
    for (let i = 1; i <= 5; i++) {
        const result = limiter.isAllowed(clientIp);
        testRuns.push({
            Request: `#${i}`,
            Status: result.allowed ? "ACCEPTED" : "BLOCKED (429)",
            Remaining: result.remaining,
            "Retry-After (s)": result.retryAfter
        });
    }

    console.table(testRuns);
}

module.exports = SlidingWindowRateLimiter;