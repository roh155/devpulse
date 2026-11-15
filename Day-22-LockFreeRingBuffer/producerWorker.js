const { parentPort, workerData } = require('worker_threads');
const LockFreeRingBuffer = require('./ringBuffer');

const { sharedBuffer, totalEvents } = workerData;
const ring = new LockFreeRingBuffer(sharedBuffer);

let sent = 0;
let spinBackpressureCount = 0;

while (sent < totalEvents) {
    // Stream sequential telemetry latency values (100us to 999us)
    const metricValue = (sent % 900) + 100;
    if (ring.push(metricValue)) {
        sent++;
    } else {
        // Ring buffer temporarily full: spin-yield until consumer drains slots
        spinBackpressureCount++;
    }
}

parentPort.postMessage({ sent, spinBackpressureCount });