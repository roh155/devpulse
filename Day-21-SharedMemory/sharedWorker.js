const { parentPort, workerData } = require('worker_threads');

const { sharedBuffer, iterationsPerWorker } = workerData;
// Create a 32-bit signed integer view over the raw SharedArrayBuffer
const sharedView = new Int32Array(sharedBuffer);

// Index 0: Unsafe non-atomic counter (Vulnerable to Race Conditions)
// Index 1: Safe Atomics counter (Hardware-level thread synchronization)
// Index 2: Atomic max latency tracker (in microseconds)

for (let i = 0; i < iterationsPerWorker; i++) {
    // 1. UNSAFE WRITE: Read-Modify-Write race condition across threads
    sharedView[0] = sharedView[0] + 1;

    // 2. ATOMIC WRITE: Guaranteed thread-safe increment without locks
    Atomics.add(sharedView, 1, 1);

    // 3. ATOMIC COMPARE-AND-EXCHANGE (CAS): Track peak value lock-free
    const simulatedSample = (i % 500) + 100;
    let currentMax = Atomics.load(sharedView, 2);
    while (simulatedSample > currentMax) {
        const prev = Atomics.compareExchange(sharedView, 2, currentMax, simulatedSample);
        if (prev === currentMax) break;
        currentMax = prev;
    }
}

parentPort.postMessage('DONE');