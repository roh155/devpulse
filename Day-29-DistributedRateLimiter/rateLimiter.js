/**
 * Day 29: Distributed Rate Limiter Engine
 * Implements Token Bucket (burst-tolerant traffic shaping) and
 * Sliding Window Log (zero boundary-spike precision) with atomic state transitions.
 */

class AtomicTokenBucketLimiter {
    constructor(capacity = 5, refillTokensPerSec = 2) {
        this.capacity = capacity;
        this.refillRatePerMs = refillTokensPerSec / 1000;
        // Simulated shared Redis key-value store: clientId -> { tokens, lastRefillTs }
        this.store = new Map();
    }

    // Atomic Lua-equivalent check-and-consume operation
    allowRequest(clientId, tokensRequired = 1, nowMs = Date.now()) {
        let bucket = this.store.get(clientId);

        if (!bucket) {
            bucket = { tokens: this.capacity, lastRefillTs: nowMs };
        } else {
            // Lazy continuous refill based on elapsed wall-clock milliseconds
            const elapsedMs = Math.max(0, nowMs - bucket.lastRefillTs);
            const refilled = elapsedMs * this.refillRatePerMs;
            bucket.tokens = Math.min(this.capacity, bucket.tokens + refilled);
            bucket.lastRefillTs = nowMs;
        }

        if (bucket.tokens >= tokensRequired) {
            bucket.tokens -= tokensRequired;
            this.store.set(clientId, bucket);
            return {
                allowed: true,
                remainingTokens: Number(bucket.tokens.toFixed(2)),
                retryAfterMs: 0
            };
        }

        const deficit = tokensRequired - bucket.tokens;
        const retryAfterMs = Math.ceil(deficit / this.refillRatePerMs);
        this.store.set(clientId, bucket);

        return {
            allowed: false,
            remainingTokens: Number(bucket.tokens.toFixed(2)),
            retryAfterMs
        };
    }
}

class SlidingWindowLogLimiter {
    constructor(maxRequests = 4, windowSizeMs = 1000) {
        this.maxRequests = maxRequests;
        this.windowSizeMs = windowSizeMs;
        // Simulated Redis Sorted Set (ZSET): clientId -> sorted array of timestamps
        this.logs = new Map();
    }

    // Atomic ZREMRANGEBYSCORE + ZCARD + ZADD equivalent
    allowRequest(clientId, nowMs = Date.now()) {
        const windowStart = nowMs - this.windowSizeMs;
        let timestamps = this.logs.get(clientId) || [];

        // 1. Evict expired timestamps outside [nowMs - windowSizeMs, nowMs]
        while (timestamps.length > 0 && timestamps[0] <= windowStart) {
            timestamps.shift();
        }

        // 2. Check rolling window quota
        if (timestamps.length < this.maxRequests) {
            timestamps.push(nowMs);
            this.logs.set(clientId, timestamps);
            return {
                allowed: true,
                activeInWindow: timestamps.length,
                quotaLimit: this.maxRequests,
                retryAfterMs: 0
            };
        }

        const oldestTs = timestamps[0];
        const retryAfterMs = Math.max(1, (oldestTs + this.windowSizeMs) - nowMs);
        this.logs.set(clientId, timestamps);

        return {
            allowed: false,
            activeInWindow: timestamps.length,
            quotaLimit: this.maxRequests,
            retryAfterMs
        };
    }
}

// === CLI Execution & Traffic Spike Simulation ===
if (require.main === module) {
    console.log("⚡ DevPulse: Running Distributed Rate Limiter (Token Bucket & Sliding Window Log)...\n");

    // Phase 1: Token Bucket Benchmark (Capacity: 5 burst tokens, Refill: 2 tokens/sec)
    const tokenBucket = new AtomicTokenBucketLimiter(5, 2);
    const apiClient = 'tenant_pro_99';
    const t0 = 1700000000000;

    const tokenEvents = [
        { label: 'Req #1 (t=0ms - Burst 1)', ts: t0 },
        { label: 'Req #2 (t=50ms - Burst 2)', ts: t0 + 50 },
        { label: 'Req #3 (t=100ms - Burst 3)', ts: t0 + 100 },
        { label: 'Req #4 (t=150ms - Burst 4)', ts: t0 + 150 },
        { label: 'Req #5 (t=200ms - Burst 5)', ts: t0 + 200 },
        { label: 'Req #6 (t=250ms - Bucket Empty)', ts: t0 + 250 },
        { label: 'Req #7 (t=1250ms - +1s Refill)', ts: t0 + 1250 }
    ];

    console.log("Phase 1: Atomic Token Bucket (Capacity=5, Refill=2 tokens/sec):");
    console.table(
        tokenEvents.map((ev) => {
            const res = tokenBucket.allowRequest(apiClient, 1, ev.ts);
            return {
                RequestEvent: ev.label,
                Decision: res.allowed ? '✅ 200 ALLOWED' : '⛔ 429 THROTTLED',
                TokensLeft: res.remainingTokens,
                RetryAfter: res.retryAfterMs > 0 ? `${res.retryAfterMs} ms` : '-'
            };
        })
    );

    // Phase 2: Sliding Window Log Benchmark (Max 4 requests per rolling 1000ms window)
    // Demonstrates elimination of Fixed-Window boundary spike exploit
    const slidingWindow = new SlidingWindowLogLimiter(4, 1000);
    const authClient = 'ip_192_168_1_42';

    const windowEvents = [
        { label: 'Req #1 (t=850ms - End of Win 1)', ts: t0 + 850 },
        { label: 'Req #2 (t=900ms - End of Win 1)', ts: t0 + 900 },
        { label: 'Req #3 (t=950ms - End of Win 1)', ts: t0 + 950 },
        { label: 'Req #4 (t=1050ms - Start of Win 2)', ts: t0 + 1050 },
        { label: 'Req #5 (t=1100ms - Boundary Attack!)', ts: t0 + 1100 },
        { label: 'Req #6 (t=1900ms - Old Logs Pruned)', ts: t0 + 1900 }
    ];

    console.log("\nPhase 2: Sliding Window Log (Max 4 req / 1000ms Rolling Window - Anti-Boundary-Spike):");
    console.table(
        windowEvents.map((ev) => {
            const res = slidingWindow.allowRequest(authClient, ev.ts);
            return {
                RequestEvent: ev.label,
                Decision: res.allowed ? '✅ 200 ALLOWED' : '⛔ 429 THROTTLED',
                WindowCount: `${res.activeInWindow} / ${res.quotaLimit}`,
                RetryAfter: res.retryAfterMs > 0 ? `${res.retryAfterMs} ms` : '-'
            };
        })
    );

    console.log("\nInsight: Token Bucket absorbs legitimate bursts while enforcing steady refill rates, whereas Sliding Window Log eliminates fixed-window boundary spikes with exact millisecond precision!");
}

module.exports = { AtomicTokenBucketLimiter, SlidingWindowLogLimiter };