/**
 * DevPulse State-Machine Circuit Breaker
 * States: CLOSED (Normal), OPEN (Tripped/Blocking), HALF-OPEN (Testing)
 * Includes Exponential Backoff with Full Jitter to prevent Thundering Herd spikes.
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 3; // Trip after 3 consecutive errors
        this.cooldownPeriodMs = options.cooldownPeriodMs || 4000; // Base cooldown window
        
        this.state = "CLOSED";
        this.consecutiveFailures = 0;
        this.nextAttempt = Date.now();
        this.attemptCount = 0;
    }

    // Helper: Exponential Backoff with Full Jitter: random(0, base * 2^attempt)
    calculateBackoffWithJitter() {
        const base = this.cooldownPeriodMs;
        const maxDelay = base * Math.pow(2, this.attemptCount);
        return Math.floor(Math.random() * maxDelay);
    }

    async execute(actionFn) {
        const now = Date.now();

        // Check if OPEN circuit can transition to HALF-OPEN
        if (this.state === "OPEN") {
            if (now >= this.nextAttempt) {
                this.state = "HALF-OPEN";
            } else {
                const waitSec = ((this.nextAttempt - now) / 1000).toFixed(2);
                return {
                    status: "SHORT_CIRCUITED",
                    state: this.state,
                    message: `Circuit is OPEN. Fast-failing probe. Cooldown remaining: ${waitSec}s`
                };
            }
        }

        try {
            // Attempt executing the action
            const result = await actionFn();

            // SUCCESS: Reset back to healthy CLOSED state
            this.state = "CLOSED";
            this.consecutiveFailures = 0;
            this.attemptCount = 0;

            return {
                status: "SUCCESS",
                state: this.state,
                data: result
            };
        } catch (err) {
            this.consecutiveFailures++;
            this.attemptCount++;

            // Trip circuit if threshold reached or if test probe failed in HALF-OPEN
            if (this.consecutiveFailures >= this.failureThreshold || this.state === "HALF-OPEN") {
                this.state = "OPEN";
                const delayMs = this.calculateBackoffWithJitter();
                this.nextAttempt = now + delayMs;

                return {
                    status: "CIRCUIT_TRIPPED",
                    state: this.state,
                    error: err.message,
                    nextRetryDelayMs: delayMs
                };
            }

            return {
                status: "EXECUTION_FAILED",
                state: this.state,
                error: err.message,
                consecutiveFailures: this.consecutiveFailures
            };
        }
    }
}

// === CLI Simulation for Day 4 Verification ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Simulating Circuit Breaker on a Flaky Downstream Service...\n");
        const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownPeriodMs: 3000 });

        // Simulated flaky service: always fails
        const failingService = async () => {
            throw new Error("503 Service Unavailable (Target Down)");
        };

        const logs = [];

        // 1. Hammer service 4 times (Threshold = 3)
        for (let i = 1; i <= 4; i++) {
            const res = await breaker.execute(failingService);
            logs.push({
                Call: `#${i}`,
                BreakerState: res.state,
                Outcome: res.status,
                Detail: res.nextRetryDelayMs ? `Tripped! Jitter Backoff: ${res.nextRetryDelayMs}ms` : (res.error || res.message)
            });
        }

        console.table(logs);
        console.log("\nInsight: Once consecutive failures hit threshold (Call #3), the breaker trips to OPEN and prevents traffic storms!");
    })();
}

module.exports = CircuitBreaker;