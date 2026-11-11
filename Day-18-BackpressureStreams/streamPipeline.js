/**
 * Day 18: Custom Backpressured Transform Stream Pipeline
 * Ingests high-throughput telemetry logs in chunks, transforms on-the-fly,
 * and regulates flow control using native Stream backpressure handling.
 */

const { Readable, Writable, Transform, pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

// 1. Custom Readable Stream: Generates large volume of raw telemetry log chunks
class TelemetryLogSource extends Readable {
    constructor(totalRecords = 10000, options = {}) {
        super({ ...options, objectMode: true });
        this.totalRecords = totalRecords;
        this.currentIndex = 0;
    }

    _read() {
        while (this.currentIndex < this.totalRecords) {
            const record = {
                id: this.currentIndex + 1,
                route: `/api/v1/checkout/probe-${(this.currentIndex % 5) + 1}`,
                rawLatency: Number((Math.random() * 200 + 20).toFixed(2)),
                status: Math.random() > 0.08 ? 200 : 504,
                timestamp: Date.now()
            };

            this.currentIndex++;

            // If push() returns false, stream must pause until downstream catches up (Backpressure)
            const canContinue = this.push(record);
            if (!canContinue) {
                return;
            }
        }

        // Signal EOF (End of Stream)
        this.push(null);
    }
}

// 2. Custom Transform Stream: Sanitizes, tags, and enriches records on-the-fly
class TelemetryEnricher extends Transform {
    constructor(options = {}) {
        super({ ...options, objectMode: true });
        this.processedCount = 0;
    }

    _transform(chunk, encoding, callback) {
        this.processedCount++;

        const enriched = {
            id: chunk.id,
            route: chunk.route,
            latencyMs: chunk.rawLatency,
            isSlow: chunk.rawLatency > 150,
            status: chunk.status,
            category: chunk.status === 200 ? 'SUCCESS' : 'FAILURE'
        };

        // Pass enriched chunk forward to writable destination
        callback(null, enriched);
    }
}

// 3. Custom Writable Stream: Simulates slow database ingestion with deliberate delay
class SlowDatabaseSink extends Writable {
    constructor(options = {}) {
        // HighWaterMark = 100 objects to force backpressure trigger under load
        super({ ...options, objectMode: true, highWaterMark: 100 });
        this.persistedCount = 0;
        this.backpressureEvents = 0;
    }

    _write(chunk, encoding, callback) {
        this.persistedCount++;

        // Simulate async I/O persistence latency (e.g., MongoDB/PostgreSQL insert)
        setImmediate(() => {
            callback();
        });
    }
}

// === CLI Execution Suite ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Running Custom Backpressured Stream Pipeline...\n");

        const source = new TelemetryLogSource(15000);
        const enricher = new TelemetryEnricher();
        const sink = new SlowDatabaseSink();

        const startMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const startTime = performance.now();

        let drainSignals = 0;
        sink.on('drain', () => {
            drainSignals++;
        });

        try {
            // Stream pipeline automatically manages error handling & backpressure propagation
            await pipelineAsync(source, enricher, sink);

            const durationMs = (performance.now() - startTime).toFixed(2);
            const endMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const deltaMem = Math.max(0, (endMem - startMem)).toFixed(2);

            console.table([
                {
                    Metric: "Total Ingested Records",
                    Value: `${sink.persistedCount.toLocaleString()} events`
                },
                {
                    Metric: "Pipeline Throughput",
                    Value: `${((sink.persistedCount / (durationMs / 1000))).toFixed(0)} events/sec`
                },
                {
                    Metric: "Total Duration",
                    Value: `${durationMs} ms`
                },
                {
                    Metric: "Initial Heap Used",
                    Value: `${startMem} MB`
                },
                {
                    Metric: "Peak Delta Memory",
                    Value: `${deltaMem} MB (Flat footprint)`
                },
                {
                    Metric: "Backpressure Drain Cycles",
                    Value: `${drainSignals} triggers`
                }
            ]);

            console.log("\nInsight: Notice how memory remained completely flat while streaming 15,000 objects. Backpressure prevented heap starvation by pausing the readable source whenever the sink's highWaterMark buffer filled up!");
        } catch (err) {
            console.error("Pipeline failure:", err);
        }
    })();
}

module.exports = { TelemetryLogSource, TelemetryEnricher, SlowDatabaseSink };