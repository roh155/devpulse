/**
 * DevPulse Tail Latency Percentile Engine
 * Calculates real-world SLA metrics (p50, p95, p99) over rolling telemetry windows
 */
class LatencyPercentileEngine {
    constructor() {
        this.samples = [];
    }

    // Register incoming probe duration (in ms)
    recordLatency(durationMs) {
        this.samples.push(Number(durationMs));
    }

    // Helper to calculate percentile at given rank (0 < p <= 1)
    calculatePercentile(sortedList, p) {
        if (sortedList.length === 0) return 0;
        const index = Math.ceil(p * sortedList.length) - 1;
        return sortedList[Math.max(0, index)];
    }

    // Generate telemetry SLA breakdown
    getSummary() {
        if (this.samples.length === 0) {
            return { error: "No latency samples available." };
        }

        // Sort ascending to extract ranks
        const sorted = [...this.samples].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((acc, val) => acc + val, 0);

        const p50 = this.calculatePercentile(sorted, 0.50);
        const p95 = this.calculatePercentile(sorted, 0.95);
        const p99 = this.calculatePercentile(sorted, 0.99);
        const average = Number((sum / count).toFixed(2));

        // Flag potential tail latency choke
        const anomalyDetected = p99 > (p50 * 3);

        return {
            totalSamples: count,
            minMs: sorted[0],
            avgMs: average,
            p50Ms: p50,
            p95Ms: p95,
            p99Ms: p99,
            maxMs: sorted[count - 1],
            anomalyDetected: anomalyDetected ? "⚠️ Severe Tail Spike Detected" : "✅ Stable Performance"
        };
    }
}

// === CLI Simulation for Day 3 Verification ===
if (require.main === module) {
    console.log("⚡ DevPulse: Simulating 100 Live Telemetry Probes with Random Spikes...\n");
    const engine = new LatencyPercentileEngine();

    // 95 requests fast (15ms - 45ms), 5 tail spikes (350ms - 900ms)
    for (let i = 0; i < 95; i++) {
        engine.recordLatency((Math.random() * 30 + 15).toFixed(2));
    }
    for (let i = 0; i < 5; i++) {
        engine.recordLatency((Math.random() * 550 + 350).toFixed(2));
    }

    const summary = engine.getSummary();
    console.table([
        {
            "Samples": summary.totalSamples,
            "Average": `${summary.avgMs} ms`,
            "p50 (Median)": `${summary.p50Ms} ms`,
            "p95": `${summary.p95Ms} ms`,
            "p99 (Tail)": `${summary.p99Ms} ms`,
            "Status": summary.anomalyDetected
        }
    ]);

    console.log(`\nInsight: Notice how Average (${summary.avgMs}ms) hides the severe p99 tail latency (${summary.p99Ms}ms)!`);
}

module.exports = LatencyPercentileEngine;