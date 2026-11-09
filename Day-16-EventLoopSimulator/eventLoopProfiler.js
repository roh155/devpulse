/**
 * Day 16: Event Loop Phases & Microtask vs Macrotask Profiler
 * Demonstrates execution hierarchy, event loop delay/lag, and starvation mitigation.
 */

class EventLoopProfiler {
    constructor() {
        this.executionLogs = [];
        this.stepCounter = 1;
    }

    logEvent(phase, description) {
        this.executionLogs.push({
            Step: this.stepCounter++,
            Phase: phase,
            Description: description,
            TimestampMs: Number(performance.now().toFixed(3))
        });
    }

    // Measure Event Loop Lag / Delay
    measureLag(callback) {
        const start = performance.now();
        setTimeout(() => {
            const delay = performance.now() - start;
            // Native setTimeout target is 0ms (clamped to ~1-4ms by runtime)
            const loopLag = Math.max(0, delay - 1).toFixed(2);
            callback(loopLag);
        }, 0);
    }

    // Run priority sequence verification
    runPrioritySimulation() {
        return new Promise((resolve) => {
            this.logEvent("1. Synchronous", "Script execution starts (Main Callstack)");

            // Macrotask: Timers Phase
            setTimeout(() => {
                this.logEvent("4. Macrotask (Timer)", "setTimeout(..., 0) executed");
            }, 0);

            // Macrotask: Check Phase
            setImmediate(() => {
                this.logEvent("5. Macrotask (Check)", "setImmediate() executed");
            });

            // Microtask: process.nextTick (Highest priority microtask)
            process.nextTick(() => {
                this.logEvent("2. Microtask (nextTick)", "process.nextTick() drained before event loop tick");
            });

            // Microtask: Promise / queueMicrotask
            queueMicrotask(() => {
                this.logEvent("3. Microtask (Promise)", "queueMicrotask() / Promise.then() drained");
            });

            this.logEvent("1. Synchronous", "Script execution ends (Synchronous code finished)");

            // Complete simulation after all phases drain
            setTimeout(() => {
                resolve(this.executionLogs);
            }, 20);
        });
    }

    // Demonstrate Starvation vs Cooperative Multitasking
    simulateCooperativeTask(totalChunks = 3) {
        return new Promise((resolve) => {
            let chunk = 1;
            const processChunk = () => {
                this.logEvent("Cooperative Task", `Processed chunk #${chunk} via setImmediate`);
                chunk++;
                if (chunk <= totalChunks) {
                    // Yields execution back to event loop so I/O is not starved
                    setImmediate(processChunk);
                } else {
                    resolve();
                }
            };
            setImmediate(processChunk);
        });
    }
}

// === CLI Execution Suite ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Profiling Node.js Event Loop Priority & Task Queues...\n");

        const profiler = new EventLoopProfiler();

        // 1. Measure initial loop lag
        profiler.measureLag((lagMs) => {
            console.log(`⏱️ Event Loop Delay / Scheduling Lag: ${lagMs} ms\n`);
        });

        // 2. Run execution sequence simulation
        const results = await profiler.runPrioritySimulation();
        console.table(results);

        // 3. Run Cooperative Chunking Demo
        console.log("🔄 Demonstrating Cooperative Task Scheduling (Yielding to Event Loop):");
        await profiler.simulateCooperativeTask(3);

        console.log("\nInsight: Synchronous blocks Callstack -> nextTick drains first -> Promises drain next -> Timers/setImmediate execute on next loop turn!");
    })();
}

module.exports = EventLoopProfiler;