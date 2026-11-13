const { parentPort, threadId } = require('worker_threads');
const crypto = require('crypto');

// Listen for incoming CPU-bound jobs from the main thread
parentPort.on('message', (task) => {
    const start = performance.now();

    // Simulate heavy CPU-bound cryptographic key derivation (PBKDF2)
    const derivedKey = crypto.pbkdf2Sync(
        task.payload,
        'devpulse_salt_2026',
        100000, // 100k iterations per task
        64,
        'sha512'
    ).toString('hex');

    const durationMs = Number((performance.now() - start).toFixed(2));

    // Send result back to main thread
    parentPort.postMessage({
        taskId: task.id,
        workerThreadId: threadId,
        hashPreview: derivedKey.slice(0, 16) + '...',
        durationMs
    });
});