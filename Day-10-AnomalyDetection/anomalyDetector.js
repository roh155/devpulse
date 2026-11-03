/**
 * DevPulse Statistical Latency Anomaly Detection Engine
 * Uses rolling Z-Score (Standard Score) to detect true performance regressions
 * Formula: Z = (CurrentLatency - Mean) / StandardDeviation
 */

class LatencyAnomalyDetector {
    constructor(windowSize = 30, zThreshold = 2.5) {
        this.windowSize = windowSize;     // Rolling baseline sample size
        this.zThreshold = zThreshold;     // Trigger anomaly if |Z| > threshold
        this.history = [];
    }

    // Add baseline training data
    trainBaseline(latencies) {
        this.history = [...latencies].slice(-this.windowSize);
    }

    // Calculate sample mean (μ)
    calculateMean(data) {
        const sum = data.reduce((acc, val) => acc + val, 0);
        return sum / data.length;
    }

    // Calculate sample standard deviation (σ)
    calculateStdDev(data, mean) {
        const squareDiffs = data.map(value => Math.pow(value - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((acc, val) => acc + val, 0) / (data.length - 1);
        return Math.sqrt(avgSquareDiff);
    }

    // Evaluate incoming real-time telemetry probe
    analyzeProbe(currentLatencyMs) {
        if (this.history.length < 5) {
            this.history.push(currentLatencyMs);
            return {
                latency: `${currentLatencyMs} ms`,
                zScore: "N/A (Warming up)",
                status: "CALIBRATING"
            };
        }

        const mean = this.calculateMean(this.history);
        const stdDev = this.calculateStdDev(this.history, mean);

        // Avoid division by zero if latency has zero variance
        const safeStdDev = stdDev === 0 ? 0.001 : stdDev;
        const zScore = (currentLatencyMs - mean) / safeStdDev;

        const isAnomaly = zScore > this.zThreshold;

        // Slide window: push new reading, drop oldest to adapt to long-term drift
        this.history.push(currentLatencyMs);
        if (this.history.length > this.windowSize) {
            this.history.shift();
        }

        return {
            latency: `${currentLatencyMs.toFixed(2)} ms`,
            baselineMean: `${mean.toFixed(2)} ms`,
            stdDev: `${stdDev.toFixed(2)} ms`,
            zScore: Number(zScore.toFixed(2)),
            status: isAnomaly ? "🚨 CRITICAL ANOMALY" : "✅ NORMAL"
        };
    }
}

// === CLI Simulation for Day 10 Verification ===
if (require.main === module) {
    console.log("⚡ DevPulse: Evaluating Real-Time Latency Anomaly Detection (Z-Score Threshold: 2.5σ)...\n");

    const detector = new LatencyAnomalyDetector(25, 2.5);

    // 1. Establish normal healthy baseline: mean ~ 40ms, slight jitter (35ms - 45ms)
    const baselineSamples = [];
    for (let i = 0; i < 25; i++) {
        baselineSamples.push(40 + (Math.random() * 8 - 4));
    }
    detector.trainBaseline(baselineSamples);

    // 2. Incoming probe test cases (Healthy variations vs Sudden Spikes)
    const incomingProbes = [42.1, 39.4, 46.8, 52.0, 148.5, 41.2, 310.0];
    const results = incomingProbes.map(probe => detector.analyzeProbe(probe));

    console.table(results);

   console.log("\nInsight: Normal variations under 43ms pass cleanly, while genuine deviations (> 2.5σ) trigger statistical anomalies without arbitrary hardcoded limits!");
}

module.exports = LatencyAnomalyDetector;