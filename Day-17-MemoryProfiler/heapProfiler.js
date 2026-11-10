/**
 * Day 17: V8 Heap Memory Profiler & Memory Leak Diagnostic Engine
 * Measures RSS, Heap Used, Heap Total deltas and demonstrates retained closure leaks.
 */

class HeapMemoryProfiler {
    constructor() {
        this.snapshots = [];
        this.leakedStore = []; // Simulated unintended global cache leak
    }

    // Helper: format bytes into megabytes
    toMB(bytes) {
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    // Capture memory snapshot with a custom label
    takeSnapshot(stageLabel) {
        const usage = process.memoryUsage();
        const snapshot = {
            Stage: stageLabel,
            HeapUsed: this.toMB(usage.heapUsed),
            HeapTotal: this.toMB(usage.heapTotal),
            RSS: this.toMB(usage.rss),
            External: this.toMB(usage.external)
        };
        this.snapshots.push(snapshot);
        return snapshot;
    }

    // Simulate leaking memory via retained closures & buffer arrays
    allocateLeakyObjects(batchCount = 100000) {
        for (let i = 0; i < batchCount; i++) {
            // Heavy payload retained in memory
            const payload = {
                id: i,
                uuid: `payload_id_${i}_token_${Math.random()}`,
                buffer: new Array(100).fill("devpulse-telemetry-byte")
            };
            this.leakedStore.push(payload);
        }
    }

    // Simulate proper clean-up and dereferencing
    releaseRetainedMemory() {
        this.leakedStore = [];
        if (global.gc) {
            global.gc(); // Force V8 garbage collection if run with --expose-gc
        }
    }

    getReport() {
        return this.snapshots;
    }
}

// === CLI Simulation for Day 17 Verification ===
if (require.main === module) {
    console.log("⚡ DevPulse: Profiling V8 Heap Allocations & Retained Reference Memory Leaks...\n");

    const profiler = new HeapMemoryProfiler();

    // 1. Baseline Memory Snapshot
    profiler.takeSnapshot("1. Baseline (Cold)");

    // 2. Allocate Batch 1 (Simulated Traffic Burst)
    profiler.allocateLeakyObjects(50000);
    profiler.takeSnapshot("2. Burst Load #1 (+50k objs)");

    // 3. Allocate Batch 2 (Continuous Unpurged Growth)
    profiler.allocateLeakyObjects(100000);
    profiler.takeSnapshot("3. Burst Load #2 (+100k objs)");

    // 4. Purge References & Dereference
    profiler.releaseRetainedMemory();
    profiler.takeSnapshot("4. Post Dereference (Cleaned)");

    // Display formatted memory metrics table
    console.table(profiler.getReport());

    console.log("\nInsight: Notice how retaining references directly balloons HeapUsed and RSS. Explicit dereferencing allows V8 to reclaim memory and avoid OOM crash loops!");
}

module.exports = HeapMemoryProfiler;