/**
 * DevPulse Statistical Latency Anomaly Detection Engine
 * Uses rolling Z-Score (Standard Score) to detect true performance regressions
 * Formula: Z = (CurrentLatency - Mean) / StandardDeviation
 */

class LatencyAnomalyDetector {
    constructor(windowSize = 25, zThreshold = 2.5) {
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
                latency: `${currentLatencyMs.toFixed(2)} ms`,
                baselineMean: "N/A",
                stdDev: "N/A",
                zScore: "N/A",
                status: "CALIBRATING"
            };
        }

        // 1. Calculate Mean and Standard Deviation from clean history
        const mean = this.calculateMean(this.history);
        const stdDev = this.calculateStdDev(this.history, mean);

        // 2. Safe calculation of Z-Score
        const safeStdDev = stdDev === 0 ? 0.001 : stdDev;
        const zScore = (currentLatencyMs - mean) / safeStdDev;

        // 3. Evaluate anomaly threshold
        const isAnomaly = zScore > this.zThreshold;

        // 4. Feedback enhancement: Do NOT pollute history window with extreme outliers
        if (!isAnomaly) {
            this.history.push(currentLatencyMs);
            if (this.history.length > this.windowSize) {
                this.history.shift();
            }
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

    // Baseline sample setup: ~40ms with slight jitter
    const baselineSamples = [
        38.2, 41.5, 39.8, 42.1, 40.0, 39.1, 43.0, 40.5, 38.9, 41.2,
        39.7, 40.8, 42.4, 38.5, 40.1, 41.9, 39.4, 40.6, 42.0, 39.0,
        41.1, 38.7, 40.3, 42.2, 39.5
    ];
    detector.trainBaseline(baselineSamples);

    // Incoming test probes
    const incomingProbes = [42.10, 39.40, 46.80, 52.00, 148.50, 41.20, 310.00];
    const results = incomingProbes.map(probe => detector.analyzeProbe(probe));

    console.table(results);

    console.log("\nInsight: Normal variations pass cleanly, while genuine deviations (> 2.5σ) trigger statistical anomalies without arbitrary hardcoded limits!");
}

module.exports = LatencyAnomalyDetector;