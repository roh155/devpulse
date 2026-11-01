/**
 * DevPulse Decoupled Job Queue & Worker Pool Engine
 * Architecture: Producer-Consumer pattern with concurrency limits and retry handling.
 */

class TelemetryJobQueue {
    constructor(concurrency = 2, maxRetries = 2) {
        this.queue = [];
        this.concurrency = concurrency;
        this.maxRetries = maxRetries;
        this.activeWorkers = 0;
        this.processedJobs = [];
    }

    // Producer: Enqueue health-probe target
    enqueue(endpointUrl, priority = 'NORMAL') {
        const job = {
            id: `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            endpointUrl,
            priority,
            attempts: 0,
            status: 'QUEUED',
            enqueuedAt: Date.now()
        };

        if (priority === 'HIGH') {
            this.queue.unshift(job); // High-priority jump
        } else {
            this.queue.push(job);
        }

        return job.id;
    }

    // Consumer: Worker processor with concurrency limits
    async processNext() {
        if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const job = this.queue.shift();
        this.activeWorkers++;
        job.status = 'PROCESSING';
        job.attempts++;

        const start = performance.now();

        try {
            // Simulated probe execution
            const result = await this.executeProbe(job.endpointUrl);
            const durationMs = (performance.now() - start).toFixed(2);

            job.status = 'COMPLETED';
            this.processedJobs.push({
                JobID: job.id.slice(-8),
                Target: job.endpointUrl,
                Priority: job.priority,
                Attempts: job.attempts,
                Duration: `${durationMs} ms`,
                Outcome: '✅ 200 OK'
            });
        } catch (err) {
            if (job.attempts <= this.maxRetries) {
                job.status = 'RETRYING';
                this.queue.push(job); // Re-queue failed job
            } else {
                job.status = 'FAILED';
                this.processedJobs.push({
                    JobID: job.id.slice(-8),
                    Target: job.endpointUrl,
                    Priority: job.priority,
                    Attempts: job.attempts,
                    Duration: `${(performance.now() - start).toFixed(2)} ms`,
                    Outcome: '❌ FAILED (Exhausted)'
                });
            }
        } finally {
            this.activeWorkers--;
            this.processNext(); // Drain remaining jobs in queue
        }
    }

    // Simulated network probe (flaky upstream on payment)
    executeProbe(url) {
        return new Promise((resolve, reject) => {
            const delay = Math.floor(Math.random() * 80 + 20);
            setTimeout(() => {
                if (url.includes('flaky') && Math.random() < 0.5) {
                    reject(new Error('504 Gateway Timeout'));
                } else {
                    resolve({ statusCode: 200 });
                }
            }, delay);
        });
    }

    async runWorkerPool() {
        const runners = [];
        while (this.queue.length > 0 || this.activeWorkers > 0) {
            while (this.activeWorkers < this.concurrency && this.queue.length > 0) {
                runners.push(this.processNext());
            }
            await new Promise(r => setTimeout(r, 20));
        }
        await Promise.all(runners);
        return this.processedJobs;
    }
}

// === CLI Simulation for Day 8 Verification ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Starting Decoupled Job Queue (Worker Pool Concurrency: 2)...\n");

        const queue = new TelemetryJobQueue(2, 2);

        // Producer enqueuing jobs
        queue.enqueue('https://api.internal/v1/auth', 'NORMAL');
        queue.enqueue('https://api.internal/v1/flaky-payments', 'HIGH');
        queue.enqueue('https://api.internal/v1/orders', 'NORMAL');
        queue.enqueue('https://api.internal/v1/notifications', 'NORMAL');

        console.log(`Enqueued 4 jobs. Active Queue Size: ${queue.queue.length}. Draining with workers...\n`);

        const results = await queue.runWorkerPool();
        console.table(results);

        console.log("\nInsight: Producer decouples request intake from probe execution, shielding the Node.js event loop from slow network timeouts!");
    })();
}

module.exports = TelemetryJobQueue;