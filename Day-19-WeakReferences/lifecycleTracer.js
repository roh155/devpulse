/**
 * Day 19: Object Lifecycle & Memory Leak Diagnostic Engine
 * Uses WeakMap, WeakRef, and FinalizationRegistry to trace V8 garbage collection
 * without preventing memory reclamation.
 */

class ObjectLifecycleTracer {
    constructor() {
        this.weakRefs = new Map();          // id -> WeakRef
        this.metadataStore = new WeakMap(); // Object -> Metadata (Auto-collected with object)
        this.gcEvents = [];                 // Audit log of finalized objects

        // FinalizationRegistry hooks directly into V8 Garbage Collection sweeps
        this.registry = new FinalizationRegistry((heldValue) => {
            this.gcEvents.push({
                ObjectID: heldValue.id,
                Type: heldValue.type,
                Status: '🗑️ RECLAIMED BY V8 GC',
                ReclaimedAt: new Date().toISOString()
            });
        });
    }

    // Track an object without retaining a strong reference
    trackObject(id, targetObj, type = 'TelemetrySession') {
        const ref = new WeakRef(targetObj);
        this.weakRefs.set(id, ref);

        // Attach metadata via WeakMap (zero memory leak overhead)
        this.metadataStore.set(targetObj, {
            createdAt: Date.now(),
            allocatedBytes: 1024 * 64 // Simulated 64KB payload
        });

        // Register for GC notification (avoid passing targetObj as unregisterToken if not needed)
        this.registry.register(targetObj, { id, type });
    }

    // Check which tracked objects are still alive vs collected
    inspectHeapStatus() {
        const report = [];
        for (const [id, weakRef] of this.weakRefs.entries()) {
            const derefObj = weakRef.deref();
            const isAlive = derefObj !== undefined;
            const meta = isAlive ? this.metadataStore.get(derefObj) : null;

            report.push({
                ObjectID: id,
                State: isAlive ? '🟢 ALIVE IN HEAP' : '⚪ DEREFERENCED (COLLECTED)',
                MetadataAttached: meta ? 'Yes (WeakMap Active)' : 'Purged'
            });
        }
        return report;
    }

    getGcAuditLogs() {
        return this.gcEvents;
    }
}

// Helper to allocate ephemeral object in an isolated lexical scope
function allocateEphemeralSession(tracer) {
    const temp = { sessionId: 'sess_02', buffer: Buffer.alloc(1024 * 512) };
    tracer.trackObject('Session-02 (Ephemeral)', temp);
}

// === CLI Execution Suite ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Tracing Object Lifecycles via WeakRef & FinalizationRegistry...\n");

        const tracer = new ObjectLifecycleTracer();

        // 1. Retained object in outer scope + Ephemeral object in isolated function scope
        const activeSession = { sessionId: 'sess_01', buffer: Buffer.alloc(1024 * 512) };
        tracer.trackObject('Session-01 (Retained)', activeSession);
        allocateEphemeralSession(tracer);

        console.log("Phase 1: Both objects alive immediately after allocation (Same Turn):");
        console.table(tracer.inspectHeapStatus());

        // 2. Yield to next Event Loop turn so V8 clears current-turn WeakRef retention
        await new Promise((r) => setImmediate(r));

        if (global.gc) {
            global.gc();
        }
        await new Promise((r) => setTimeout(r, 50));

        console.log("\nPhase 2: Next Event Loop Turn + V8 GC Sweep:");
        console.table(tracer.inspectHeapStatus());

        const gcLogs = tracer.getGcAuditLogs();
        if (gcLogs.length > 0) {
            console.log("\nFinalizationRegistry GC Hook Triggered:");
            console.table(gcLogs);
        }

        // Keep activeSession alive until inspection completes
        void activeSession.sessionId;

        console.log("\nInsight: Session-01 stayed alive because of an active reference, while Session-02 and its WeakMap metadata were cleanly collected on the next turn without leaking memory!");
    })();
}

module.exports = ObjectLifecycleTracer;