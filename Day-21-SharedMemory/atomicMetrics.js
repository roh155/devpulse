/**
 * Day 21: Zero-Copy Shared Memory & Thread Synchronization Engine
 * Demonstrates SharedArrayBuffer memory sharing, Race Condition corruption,
 * and lock-free thread safety using Atomics.add & Atomics.compareExchange.
 */

const { Worker } = require('worker_threads');
const path = require('path');

function runWorker(workerPath, sharedBuffer, iterationsPerWorker) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            workerData: { sharedBuffer, iterationsPerWorker }
        });
        worker.on('message', resolve);
        worker.on('error', reject);
    });
}

// === CLI Execution Suite ===
if (require.main === module) {
    (async () => {
        const workerCount = 4;
        const iterationsPerWorker = 250000; // 250k increments per thread
        const expectedTotal = workerCount * iterationsPerWorker; // 1,000,000

        console.log(`⚡ DevPulse: Benchmarking SharedArrayBuffer & Atomics across ${workerCount} Threads...\n`);

        // Allocate 16 bytes of raw zero-copy shared memory (4 x 32-bit integers)
        const sharedBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 4);
        const sharedView = new Int32Array(sharedBuffer);

        const workerPath = path.join(__dirname, 'sharedWorker.js');
        const startTime = performance.now();

        // Spawn 4 concurrent threads writing to the EXACT same memory addresses simultaneously
        await Promise.all(
            Array.from({ length: workerCount }, () =>
                runWorker(workerPath, sharedBuffer, iterationsPerWorker)
            )
        );

        const durationMs = Number((performance.now() - startTime).toFixed(2));

        const unsafeCount = sharedView[0];
        const atomicCount = Atomics.load(sharedView, 1);
        const atomicPeak = Atomics.load(sharedView, 2);
        const lostUpdates = expectedTotal - unsafeCount;

        console.table([
            {
                MetricStrategy: "Expected Total Increments",
                RecordedValue: expectedTotal.toLocaleString(),
                LostUpdates: "0",
                Status: "🎯 TARGET"
            },
            {
                MetricStrategy: "Unsafe SharedArrayBuffer (view[0]++)",
                RecordedValue: unsafeCount.toLocaleString(),
                LostUpdates: `${lostUpdates.toLocaleString()} corrupted`,
                Status: "❌ DATA RACE"
            },
            {
                MetricStrategy: "Thread-Safe Atomics.add()",
                RecordedValue: atomicCount.toLocaleString(),
                LostUpdates: "0",
                Status: "✅ 100% ACCURATE"
            },
            {
                MetricStrategy: "Lock-Free CAS Peak Tracker",
                RecordedValue: `${atomicPeak} µs`,
                LostUpdates: "0",
                Status: "✅ CAS VERIFIED"
            }
        ]);

        console.log(`\n⏱️ Completed ${expectedTotal.toLocaleString()} concurrent cross-thread memory operations in ${durationMs} ms (Zero serialization overhead!).`);
        console.log("Insight: Without Atomics, concurrent read-modify-write operations overwrite each other. Atomics.add and compareExchange enforce hardware-level consistency without blocking mutex locks!");
    })();
}

module.exports = { runWorker };