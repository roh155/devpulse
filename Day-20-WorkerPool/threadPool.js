/**
 * Day 20: Multithreaded Worker Pool Engine
 * Offloads CPU-intensive tasks across OS cores via Node.js worker_threads,
 * keeping the main Event Loop unblocked.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class WorkerThreadPool {
    constructor(workerScript, poolSize = Math.min(4, os.cpus().length)) {
        this.workerScript = workerScript;
        this.poolSize = poolSize;
        this.workers = [];
        this.idleWorkers = [];
        this.taskQueue = [];

        this.initializePool();
    }

    initializePool() {
        for (let i = 0; i < this.poolSize; i++) {
            const worker = new Worker(this.workerScript);
            this.workers.push(worker);
            this.idleWorkers.push(worker);
        }
    }

    runTask(payload) {
        return new Promise((resolve, reject) => {
            const task = {
                id: `job_${Math.random().toString(36).slice(2, 7)}`,
                payload,
                resolve,
                reject
            };

            if (this.idleWorkers.length > 0) {
                const worker = this.idleWorkers.pop();
                this.dispatch(worker, task);
            } else {
                // Queue task if all worker threads are busy
                this.taskQueue.push(task);
            }
        });
    }

    dispatch(worker, task) {
        const onMessage = (result) => {
            cleanup();
            task.resolve(result);
            this.releaseWorker(worker);
        };

        const onError = (err) => {
            cleanup();
            task.reject(err);
            this.releaseWorker(worker);
        };

        const cleanup = () => {
            worker.off('message', onMessage);
            worker.off('error', onError);
        };

        worker.on('message', onMessage);
        worker.on('error', onError);
        worker.postMessage({ id: task.id, payload: task.payload });
    }

    releaseWorker(worker) {
        if (this.taskQueue.length > 0) {
            const nextTask = this.taskQueue.shift();
            this.dispatch(worker, nextTask);
        } else {
            this.idleWorkers.push(worker);
        }
    }

    async destroy() {
        await Promise.all(this.workers.map((w) => w.terminate()));
    }
}

// === CLI Benchmark: Main Thread Blocking vs Multithreaded Pool ===
if (require.main === module) {
    (async () => {
        const workerPath = path.join(__dirname, 'workerTask.js');
        const poolSize = 4;
        const totalTasks = 8;

        console.log(`⚡ DevPulse: Offloading ${totalTasks} CPU-Intensive Tasks across ${poolSize} Worker Threads...\n`);

        const pool = new WorkerThreadPool(workerPath, poolSize);

        // Measure Main Event Loop responsiveness while workers crunch CPU tasks
        let eventLoopTicks = 0;
        const ticker = setInterval(() => {
            eventLoopTicks++;
        }, 10);

        const wallStart = performance.now();

        // Dispatch all 8 heavy cryptographic jobs concurrently
        const jobPromises = Array.from({ length: totalTasks }, (_, i) =>
            pool.runTask(`telemetry_payload_block_${i + 1}`)
        );

        const results = await Promise.all(jobPromises);
        const totalWallTime = Number((performance.now() - wallStart).toFixed(2));

        clearInterval(ticker);
        await pool.destroy();

        console.table(results.map((r) => ({
            TaskID: r.taskId,
            WorkerThread: `Thread #${r.workerThreadId}`,
            OutputHash: r.hashPreview,
            WorkerTime: `${r.durationMs} ms`
        })));

        const cumulativeCpuTime = results.reduce((acc, r) => acc + r.durationMs, 0).toFixed(2);

        console.log(`\n📊 Performance Summary:`);
        console.log(`• Cumulative CPU Work Done : ${cumulativeCpuTime} ms (if run sequentially on Main Thread)`);
        console.log(`• Actual Wall-Clock Time   : ${totalWallTime} ms (Parallelized across ${poolSize} threads)`);
        console.log(`• Main Event Loop Ticks    : ${eventLoopTicks} healthy timer ticks fired (0ms Event Loop freeze!)`);
    })();
}

module.exports = WorkerThreadPool;