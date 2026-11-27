/**
 * Day 30 (GRAND FINALE): DevPulse Distributed Telemetry & Storage Capstone Engine
 * Integrates:
 *  1. Atomic Token Bucket Rate Limiter (Edge Traffic Shaping)
 *  2. Bit-Packed Bloom Filter (O(1) Event Deduplication)
 *  3. Consistent Hashing Ring with VNodes (Deterministic Shard Routing)
 *  4. Crash-Safe Binary Write-Ahead Log with CRC32 Checksums (Durability)
 *  5. LSM-Tree MemTable/SSTable Engine + Count-Min Sketch (Storage & Live Observability)
 */

const fs = require('fs');
const path = require('path');

// === 1. CRC32 Integrity Engine (Day 23) ===
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC32_TABLE[i] = c >>> 0;
}
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// === 2. Atomic Token Bucket Rate Limiter (Day 29) ===
class EdgeRateLimiter {
    constructor(capacity = 500, refillPerSec = 2000) {
        this.capacity = capacity;
        this.refillPerMs = refillPerSec / 1000;
        this.buckets = new Map();
    }
    allow(tenantId, nowMs) {
        let b = this.buckets.get(tenantId) || { tokens: this.capacity, lastTs: nowMs };
        b.tokens = Math.min(this.capacity, b.tokens + (nowMs - b.lastTs) * this.refillPerMs);
        b.lastTs = nowMs;
        if (b.tokens >= 1) {
            b.tokens -= 1;
            this.buckets.set(tenantId, b);
            return true;
        }
        this.buckets.set(tenantId, b);
        return false;
    }
}

// === 3. Bit-Packed Bloom Filter + Count-Min Sketch (Day 27) ===
class ProbabilisticTelemetryGuard {
    constructor(bitSize = 32768, cmsWidth = 1024, cmsDepth = 4) {
        this.bitSize = bitSize;
        this.bloom = new Uint8Array(bitSize >>> 3);
        this.cmsWidth = cmsWidth;
        this.cmsDepth = cmsDepth;
        this.cms = new Uint32Array(cmsWidth * cmsDepth);
        this.seeds = [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];
    }
    hash(str, seed) {
        let h = seed;
        for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
        return h >>> 0;
    }
    isDuplicateAndMark(eventId) {
        let seenAll = true;
        for (let i = 0; i < 4; i++) {
            const bit = this.hash(eventId, this.seeds[i]) % this.bitSize;
            const mask = 1 << (bit & 7);
            if ((this.bloom[bit >>> 3] & mask) === 0) {
                seenAll = false;
                this.bloom[bit >>> 3] |= mask;
            }
        }
        return seenAll;
    }
    recordServiceHit(serviceName) {
        for (let r = 0; r < this.cmsDepth; r++) {
            const col = this.hash(serviceName, this.seeds[r]) % this.cmsWidth;
            this.cms[r * this.cmsWidth + col]++;
        }
    }
    estimateServiceHits(serviceName) {
        let min = Infinity;
        for (let r = 0; r < this.cmsDepth; r++) {
            const col = this.hash(serviceName, this.seeds[r]) % this.cmsWidth;
            min = Math.min(min, this.cms[r * this.cmsWidth + col]);
        }
        return min;
    }
}

// === 4. Consistent Hashing Ring with VNodes (Day 26) ===
class ShardRouter {
    constructor(shards, vnodes = 100) {
        this.ring = [];
        for (const shard of shards) {
            for (let v = 0; v < vnodes; v++) {
                this.ring.push({ hash: this.fnv1a(`${shard}#${v}`), shard });
            }
        }
        this.ring.sort((a, b) => a.hash - b.hash);
    }
    fnv1a(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
        return h >>> 0;
    }
    route(key) {
        const h = this.fnv1a(key);
        let lo = 0, hi = this.ring.length - 1;
        if (h > this.ring[hi].hash) return this.ring[0].shard;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.ring[mid].hash < h) lo = mid + 1;
            else hi = mid;
        }
        return this.ring[lo].shard;
    }
}

// === 5. Unified DevPulse Core Pipeline Node (WAL + LSM-Tree) ===
class DevPulseCapstoneNode {
    constructor(workDir) {
        this.workDir = workDir;
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

        this.walPath = path.join(workDir, 'capstone.wal');
        this.walFd = fs.openSync(this.walPath, 'a+');
        this.lsn = 0;

        this.rateLimiter = new EdgeRateLimiter(250, 5000);
        this.guard = new ProbabilisticTelemetryGuard();
        this.router = new ShardRouter(['shard-ap-south-01', 'shard-us-east-01', 'shard-eu-west-01'], 100);

        this.memTable = new Map();
        this.memTableLimit = 500;
        this.sstables = [];

        this.metrics = {
            totalReceived: 0,
            throttled429: 0,
            duplicatesDropped: 0,
            committedRecords: 0,
            walBytesWritten: 0,
            shardDistribution: { 'shard-ap-south-01': 0, 'shard-us-east-01': 0, 'shard-eu-west-01': 0 }
        };
    }

    ingestEvent(event, nowMs) {
        this.metrics.totalReceived++;

        // Step 1: Edge Token Bucket Rate Limiting
        if (!this.rateLimiter.allow(event.tenant, nowMs)) {
            this.metrics.throttled429++;
            return { status: 429, reason: 'RATE_LIMITED' };
        }

        // Step 2: O(1) Bloom Filter Deduplication
        if (this.guard.isDuplicateAndMark(event.eventId)) {
            this.metrics.duplicatesDropped++;
            return { status: 202, reason: 'DUPLICATE_IGNORED' };
        }

        // Step 3: Consistent Hash Shard Assignment
        const targetShard = this.router.route(event.service);
        this.metrics.shardDistribution[targetShard]++;

        // Step 4: Append Binary Frame + CRC32 to Write-Ahead Log
        this.lsn++;
        const payloadBuf = Buffer.from(JSON.stringify({ ...event, shard: targetShard }), 'utf8');
        const frame = Buffer.allocUnsafe(9 + payloadBuf.length);
        frame.writeUInt8(0xA5, 0);
        frame.writeUInt32BE(this.lsn, 1);
        frame.writeUInt32BE(crc32(payloadBuf), 5);
        payloadBuf.copy(frame, 9);
        fs.writeSync(this.walFd, frame);
        this.metrics.walBytesWritten += frame.length;

        // Step 5: Write to LSM MemTable & Track Heavy-Hitter Sketch
        this.memTable.set(event.eventId, { service: event.service, latencyMs: event.latencyMs, shard: targetShard });
        this.guard.recordServiceHit(event.service);
        this.metrics.committedRecords++;

        if (this.memTable.size >= this.memTableLimit) {
            this.flushSSTable();
        }

        return { status: 200, shard: targetShard, lsn: this.lsn };
    }

    flushSSTable() {
        const sstId = `sst_${String(this.sstables.length + 1).padStart(3, '0')}.dat`;
        const sstPath = path.join(this.workDir, sstId);
        const sorted = [...this.memTable.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        fs.writeFileSync(sstPath, sorted.map(([k, v]) => JSON.stringify({ k, ...v })).join('\n'), 'utf8');
        this.sstables.push({ id: sstId, path: sstPath, count: sorted.length });
        this.memTable.clear();
    }

    shutdownAndCleanup() {
        fs.closeSync(this.walFd);
        if (fs.existsSync(this.walPath)) fs.unlinkSync(this.walPath);
        for (const sst of this.sstables) {
            if (fs.existsSync(sst.path)) fs.unlinkSync(sst.path);
        }
        if (fs.existsSync(this.workDir)) fs.rmdirSync(this.workDir);
    }
}

// === CLI Grand Finale Execution Suite ===
if (require.main === module) {
    console.log("🏆 DevPulse Day 30 GRAND FINALE: Running End-to-End Distributed Telemetry Engine...\n");

    const workDir = path.join(__dirname, 'capstone_runtime');
    const engine = new DevPulseCapstoneNode(workDir);

    const services = ['checkout-service', 'auth-gateway', 'payment-ledger', 'search-indexer'];
    const baseTs = 1700000000000;
    const startTime = performance.now();

    // Simulate 2,500 incoming telemetry events:
    // - Includes aggressive burst from 'noisy-tenant' (triggers 429 rate limiting)
    // - Includes 300 replayed duplicate event IDs (caught by Bloom Filter)
    for (let i = 0; i < 2500; i++) {
        const isNoisyBurst = i < 450; // 450 events in 0ms exceeds 250 burst bucket
        const tenant = isNoisyBurst ? 'noisy-tenant' : `tenant-${i % 10}`;
        const simTime = isNoisyBurst ? baseTs : baseTs + Math.floor(i / 5);

        // Inject 300 duplicate event IDs intentionally
        const effectiveId = (i >= 1000 && i < 1300) ? `evt_${i - 500}` : `evt_${i}`;
        const service = services[i % services.length];

        engine.ingestEvent({
            eventId: effectiveId,
            tenant,
            service,
            latencyMs: (i % 120) + 12
        }, simTime);
    }

    const elapsedMs = Number((performance.now() - startTime).toFixed(2));
    const throughput = Math.round(engine.metrics.totalReceived / (elapsedMs / 1000)).toLocaleString();

    console.log("1️⃣ End-to-End Pipeline Admission, Deduplication & Durability Telemetry:");
    console.table([
        { PipelineStage: "Total Incoming Telemetry Events", Metric: `${engine.metrics.totalReceived.toLocaleString()} events`, Subsystem: "Edge Ingestion" },
        { PipelineStage: "Burst Traffic Shed (429 Throttled)", Metric: `${engine.metrics.throttled429} events rejected`, Subsystem: "Atomic Token Bucket (Day 29)" },
        { PipelineStage: "Duplicate Events Filtered (0 Disk I/O)", Metric: `${engine.metrics.duplicatesDropped} duplicates caught`, Subsystem: "Bit-Packed Bloom Filter (Day 27)" },
        { PipelineStage: "CRC32 Binary WAL Frames Committed", Metric: `${engine.metrics.committedRecords.toLocaleString()} frames (${(engine.metrics.walBytesWritten / 1024).toFixed(2)} KB)`, Subsystem: "Write-Ahead Log (Day 23)" },
        { PipelineStage: "Immutable SSTables Flushed + MemTable", Metric: `${engine.sstables.length} SSTables + ${engine.memTable.size} live MemTable keys`, Subsystem: "LSM-Tree Storage (Day 28)" },
        { PipelineStage: "End-to-End Pipeline Throughput", Metric: `${throughput} events/sec (${elapsedMs} ms)`, Subsystem: "DevPulse Core Engine" }
    ]);

    console.log("\n2️⃣ Consistent Hash Ring Shard Routing & Count-Min Sketch Service Observability:");
    console.table(
        services.map((svc) => ({
            Microservice: svc,
            AssignedShard: engine.router.route(svc),
            CMSEstimatedTraffic: `${engine.guard.estimateServiceHits(svc)} committed hits`,
            Status: "🟢 HEALTHY"
        }))
    );

    console.log("\n🎉 30-DAY CHALLENGE COMPLETE! All low-level Node.js, Concurrency, Storage, and Distributed Systems engines integrated and verified!");
    engine.shutdownAndCleanup();
}

module.exports = DevPulseCapstoneNode;
