/**
 * Lock-Free Single-Producer Single-Consumer (SPSC) Ring Buffer
 * Backed by SharedArrayBuffer and synchronized via Atomics load/store memory barriers.
 */

class LockFreeRingBuffer {
    constructor(sharedBuffer) {
        // Memory Layout (Int32Array):
        // Index 0: writeIndex (Head - modified only by Producer)
        // Index 1: readIndex  (Tail - modified only by Consumer)
        // Index 2: capacity   (Power of 2 for fast bitwise modulo)
        // Index 3..N: Circular Data Slots
        this.control = new Int32Array(sharedBuffer, 0, 3);
        this.data = new Int32Array(sharedBuffer, 3 * Int32Array.BYTES_PER_ELEMENT);
        this.capacity = Atomics.load(this.control, 2);
        this.mask = this.capacity - 1;
    }

    static createBuffer(capacity = 1024) {
        // Enforce power-of-2 capacity for fast bitwise wrap-around (& mask)
        if ((capacity & (capacity - 1)) !== 0) {
            throw new Error("Capacity must be a power of 2 (e.g., 512, 1024, 4096)");
        }
        const totalBytes = (3 + capacity) * Int32Array.BYTES_PER_ELEMENT;
        const sab = new SharedArrayBuffer(totalBytes);
        const control = new Int32Array(sab, 0, 3);
        Atomics.store(control, 0, 0); // writeIndex
        Atomics.store(control, 1, 0); // readIndex
        Atomics.store(control, 2, capacity);
        return sab;
    }

    // Producer: Push an integer metric into the ring buffer
    push(value) {
        const writeIdx = Atomics.load(this.control, 0);
        const readIdx = Atomics.load(this.control, 1);

        // Buffer is full if write pointer laps read pointer by capacity
        if (writeIdx - readIdx >= this.capacity) {
            return false; // Backpressure: Ring buffer full
        }

        const slot = writeIdx & this.mask;
        this.data[slot] = value;

        // Release barrier: Ensure data write is visible before advancing writeIndex
        Atomics.store(this.control, 0, writeIdx + 1);
        return true;
    }

    // Consumer: Pop an integer metric from the ring buffer
    pop() {
        const readIdx = Atomics.load(this.control, 1);
        const writeIdx = Atomics.load(this.control, 0);

        // Buffer is empty if read pointer catches up to write pointer
        if (readIdx === writeIdx) {
            return null;
        }

        const slot = readIdx & this.mask;
        const value = this.data[slot];

        // Release barrier: Free slot for producer
        Atomics.store(this.control, 1, readIdx + 1);
        return value;
    }
}

module.exports = LockFreeRingBuffer;