class TelemetryCollectionSimulator {
    constructor() {
        this.records = [];
        this.compoundIndex = new Map(); // Pre-built B-Tree / Map simulation
    }

    seedRecords(count = 50000) {
        const now = Date.now();
        const endpoints = ["auth-service", "payment-service", "catalog-service"];

        for (let i = 0; i < count; i++) {
            const record = {
                id: `rec_${i}`,
                endpointId: endpoints[i % endpoints.length],
                latencyMs: Math.floor(Math.random() * 200 + 20),
                statusCode: Math.random() > 0.05 ? 200 : 500,
                timestamp: now - Math.floor(Math.random() * 40 * 24 * 60 * 60 * 1000)
            };

            this.records.push(record);

            // Populate compound index pointers: key -> endpointId, sorted by timestamp DESC
            if (!this.compoundIndex.has(record.endpointId)) {
                this.compoundIndex.set(record.endpointId, []);
            }
            this.compoundIndex.get(record.endpointId).push(record);
        }

        // Keep index lists pre-sorted (as a real DB B-Tree does on write)
        for (const [endpoint, list] of this.compoundIndex.entries()) {
            list.sort((a, b) => b.timestamp - a.timestamp);
        }
    }

    // Naive Full Collection Scan (COLLSCAN)
    queryCollScan(endpointId, limit = 5) {
        const start = performance.now();
        let docsExamined = 0;

        const results = this.records
            .filter(doc => {
                docsExamined++;
                return doc.endpointId === endpointId;
            })
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);

        const executionTimeMs = (performance.now() - start).toFixed(3);
        return {
            stage: "COLLSCAN (No Index)",
            docsExamined,
            resultsReturned: results.length,
            executionTimeMs: `${executionTimeMs} ms`
        };
    }

    // Optimized Compound Index Scan (IXSCAN)
    queryCompoundIndexScan(endpointId, limit = 5) {
        const start = performance.now();

        // Direct index pointer lookup (O(1) access to pre-sorted index branch)
        const indexBranch = this.compoundIndex.get(endpointId) || [];
        const results = indexBranch.slice(0, limit);

        const executionTimeMs = (performance.now() - start).toFixed(3);
        return {
            stage: "IXSCAN ({ endpointId: 1, timestamp: -1 })",
            docsExamined: results.length,
            resultsReturned: results.length,
            executionTimeMs: `${executionTimeMs} ms`
        };
    }

    purgeExpiredTTL(retentionDays = 30) {
        const initialCount = this.records.length;
        const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

        this.records = this.records.filter(doc => doc.timestamp >= cutoffTime);
        const purgedCount = initialCount - this.records.length;

        return {
            ttlWindow: `${retentionDays} Days`,
            initialCount,
            purgedRecords: purgedCount,
            activeCount: this.records.length
        };
    }
}

// === CLI Execution ===
if (require.main === module) {
    console.log("⚡ DevPulse: Evaluating MongoDB Query Optimization & TTL Lifecycle...\n");

    const simulator = new TelemetryCollectionSimulator();
    simulator.seedRecords(50000);

    const collScanResult = simulator.queryCollScan("payment-service", 5);
    const indexScanResult = simulator.queryCompoundIndexScan("payment-service", 5);

    console.table([
        {
            ExecutionPlan: collScanResult.stage,
            "Docs Examined": collScanResult.docsExamined,
            "Returned": collScanResult.resultsReturned,
            "Execution Time": collScanResult.executionTimeMs
        },
        {
            ExecutionPlan: indexScanResult.stage,
            "Docs Examined": indexScanResult.docsExamined,
            "Returned": indexScanResult.resultsReturned,
            "Execution Time": indexScanResult.executionTimeMs
        }
    ]);

    console.log("\n⚡ Executing Background TTL Index Cleanup (Auto-Drop > 30 Days)...");
    const ttlResult = simulator.purgeExpiredTTL(30);
    console.table([ttlResult]);

    console.log("\nInsight: Compound Indexes eliminate full collection scans, and TTL indexes eliminate manual cron purge maintenance!");
}

module.exports = TelemetryCollectionSimulator;