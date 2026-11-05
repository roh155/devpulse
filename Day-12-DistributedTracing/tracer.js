/**
 * DevPulse Distributed Tracing & Correlation Context Engine
 * Implements W3C Trace Context / Correlation ID Propagation across micro-service hops.
 */

const crypto = require('crypto');

class DistributedTracer {
    constructor() {
        this.traceStore = new Map(); // traceId -> Array of spans
    }

    generateId(bytes = 8) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    extractOrCreateContext(incomingHeaders = {}) {
        const traceId = incomingHeaders['x-correlation-id'] || `trace_${this.generateId(16)}`;
        const parentSpanId = incomingHeaders['x-parent-span-id'] || null;

        return { traceId, parentSpanId };
    }

    async recordSpan(context, serviceName, operationName, actionFn) {
        const spanId = `span_${this.generateId(8)}`;
        const startTime = performance.now();
        const startIso = new Date().toISOString();

        let errorCaptured = null;
        let result = null;

        const spanData = {
            traceId: context.traceId,
            spanId,
            parentSpanId: context.parentSpanId,
            service: serviceName,
            operation: operationName,
            durationMs: 0,
            status: 'PENDING',
            error: null,
            timestamp: startIso
        };

        if (!this.traceStore.has(context.traceId)) {
            this.traceStore.set(context.traceId, []);
        }
        // Add span immediately to maintain execution sequence
        this.traceStore.get(context.traceId).push(spanData);

        try {
            const childContext = {
                traceId: context.traceId,
                parentSpanId: spanId
            };

            result = await actionFn(childContext);
        } catch (err) {
            errorCaptured = err.message;
            throw err;
        } finally {
            spanData.durationMs = Number((performance.now() - startTime).toFixed(2));
            spanData.status = errorCaptured ? 'ERROR' : 'OK';
            spanData.error = errorCaptured;
        }

        return result;
    }

    getTraceReport(traceId) {
        return this.traceStore.get(traceId) || [];
    }
}

// === Micro-Services Flow Simulation ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Simulating Distributed Tracing across 4 Micro-Service Hops...\n");

        const tracer = new DistributedTracer();
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        // Inbound request at Gateway
        const incomingContext = tracer.extractOrCreateContext();
        const activeTraceId = incomingContext.traceId;

        console.log(`[Gateway]: Generated Inbound Correlation ID -> ${activeTraceId}\n`);

        try {
            // Hop 1: API Gateway (Root)
            await tracer.recordSpan(incomingContext, 'api-gateway', 'route_request', async (ctx1) => {
                await delay(20);

                // Hop 2: Auth Service
                await tracer.recordSpan(ctx1, 'auth-service', 'verify_jwt', async () => {
                    await delay(35);
                });

                // Hop 3: Order Engine
                await tracer.recordSpan(ctx1, 'order-service', 'process_checkout', async (ctx2) => {
                    await delay(45);

                    // Hop 4: Payment Gateway
                    await tracer.recordSpan(ctx2, 'payment-gateway', 'capture_stripe_charge', async () => {
                        await delay(95);
                    });
                });
            });
        } catch (err) {
            console.error(`Trace aborted: ${err.message}`);
        }

        // Output Formatted Distributed Trace Spans
        const spans = tracer.getTraceReport(activeTraceId);

        console.table(spans.map(span => ({
            TraceID: span.traceId.slice(0, 16) + '...',
            SpanID: span.spanId,
            ParentSpanID: span.parentSpanId || 'ROOT',
            Service: span.service,
            Operation: span.operation,
            Duration: `${span.durationMs} ms`,
            Status: span.status === 'OK' ? '✅ OK' : '❌ ERR'
        })));

        const rootSpan = spans.find(s => s.parentSpanId === null);
        console.log(`\nInsight: Correlation ID propagates across all hops. Total Root Transaction Duration: ${rootSpan ? rootSpan.durationMs : 0} ms!`);
    })();
}

module.exports = DistributedTracer;