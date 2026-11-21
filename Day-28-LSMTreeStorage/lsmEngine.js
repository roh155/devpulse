/**
 * Day 28: LSM-Tree (Log-Structured Merge-Tree) Storage Engine
 * Combines in-memory MemTable buffering, sorted immutable SSTable disk flushing,
 * Tombstone deletions, and Bloom Filter disk-read avoidance.
 */

const fs = require('fs');
const path = require('path');

const TOMBSTONE = '__DEV_PULSE_TOMBSTONE__';

// Lightweight embedded Bloom Filter per SSTable
class SSTableBloomFilter {
    constructor(bitSize = 512, hashCount = 4) {
        this.bitSize = bitSize;
        this.hashCount = hashCount;
        this.bytes = new Uint8Array(Math.ceil(bitSize / 8));
    }

    getPositions(key) {
        let h1 = 0x811c9dc5;
        let h2 = 0x01000193;
        for (let i = 0; i < key.length; i++) {
            const c = key.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x01000193);
            h2 = Math.imul(h2 ^ c, 0x85ebca6b);
        }
        const pos = [];
        for (let i = 0; i < this.hashCount; i++) {
            pos.push((((h1 >>> 0) + i * (h2 >>> 0)) >>> 0) % this.bitSize);
        }
        return pos;
    }

    add(key) {
        for (const bit of this.getPositions(key)) {
            this.bytes[bit >>> 3] |= (1 << (bit & 7));
        }
    }

    mightContain(key) {
        for (const bit of this.getPositions(key)) {
            if ((this.bytes[bit >>> 3] & (1 << (bit & 7))) === 0) return false;
        }
        return true;
    }
}

class LSMStorageEngine {
    constructor(dataDir, memTableThreshold = 4) {
        this.dataDir = dataDir;
        this.memTableThreshold = memTableThreshold;
        this.memTable = new Map();
        this.ssTables = []; // Newest to oldest SSTable metadata descriptors
        this.sstableSeq = 0;

        // Telemetry counters to verify disk read avoidance
        this.stats = {
            memTableHits: 0,
            sstableDiskReads: 0,
            bloomSkipsAvoidedIO: 0
        };

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    put(key, value) {
        this.memTable.set(key, { value, ts: Date.now() });
        if (this.memTable.size >= this.memTableThreshold) {
            this.flushMemTableToSSTable();
        }
    }

    // Logical delete via Tombstone marker (appended, never mutates old SSTables)
    delete(key) {
        this.put(key, TOMBSTONE);
    }

    // Sort MemTable keys and flush as an immutable SSTable JSON/binary segment on disk
    flushMemTableToSSTable() {
        if (this.memTable.size === 0) return;

        this.sstableSeq++;
        const fileName = `sstable_${String(this.sstableSeq).padStart(4, '0')}.sst`;
        const filePath = path.join(this.dataDir, fileName);

        const sortedEntries = [...this.memTable.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const bloom = new SSTableBloomFilter(1024, 5);
        const serializedLines = [];

        for (const [k, record] of sortedEntries) {
            bloom.add(k);
            serializedLines.push(JSON.stringify({ k, v: record.value, ts: record.ts }));
        }

        fs.writeFileSync(filePath, serializedLines.join('\n'), 'utf8');

        // Prepend newest SSTable so reads always check newest segments first
        this.ssTables.unshift({
            id: fileName,
            filePath,
            keyCount: sortedEntries.length,
            minKey: sortedEntries[0][0],
            maxKey: sortedEntries[sortedEntries.length - 1][0],
            bloom
        });

        this.memTable.clear();
    }

    get(key) {
        // 1. Check mutable in-memory MemTable first
        if (this.memTable.has(key)) {
            this.stats.memTableHits++;
            const val = this.memTable.get(key).value;
            return val === TOMBSTONE ? null : val;
        }

        // 2. Scan immutable SSTables from newest to oldest, guarded by Bloom Filters
        for (const sst of this.ssTables) {
            if (!sst.bloom.mightContain(key)) {
                this.stats.bloomSkipsAvoidedIO++;
                continue; // Skip disk read completely!
            }

            // Bloom filter positive -> Perform actual disk read
            this.stats.sstableDiskReads++;
            const lines = fs.readFileSync(sst.filePath, 'utf8').split('\n');
            for (const line of lines) {
                const parsed = JSON.parse(line);
                if (parsed.k === key) {
                    return parsed.v === TOMBSTONE ? null : parsed.v;
                }
            }
        }

        return null;
    }

    // Merge all SSTables, resolve overwritten keys, and purge Tombstones
    compact() {
        const merged = new Map();

        // Iterate oldest to newest so newer values/tombstones overwrite stale entries
        for (let i = this.ssTables.length - 1; i >= 0; i--) {
            const sst = this.ssTables[i];
            const lines = fs.readFileSync(sst.filePath, 'utf8').split('\n');
            for (const line of lines) {
                const { k, v, ts } = JSON.parse(line);
                merged.set(k, { value: v, ts });
            }
            fs.unlinkSync(sst.filePath);
        }

        this.ssTables = [];

        // Re-populate compacted live records (dropping Tombstones)
        for (const [k, rec] of merged.entries()) {
            if (rec.value !== TOMBSTONE) {
                this.memTable.set(k, rec);
            }
        }
        this.flushMemTableToSSTable();
    }

    cleanup() {
        for (const sst of this.ssTables) {
            if (fs.existsSync(sst.filePath)) fs.unlinkSync(sst.filePath);
        }
        if (fs.existsSync(this.dataDir)) fs.rmdirSync(this.dataDir);
    }
}

// === CLI Execution & Storage Engine Benchmark ===
if (require.main === module) {
    const storageDir = path.join(__dirname, 'sst_data');
    const lsm = new LSMStorageEngine(storageDir, 4); // Flush every 4 writes

    console.log("⚡ DevPulse: Running LSM-Tree Storage Engine (MemTable + SSTable + Bloom Reads)...\n");

    // 1. Write 8 keys -> Triggers 2 immutable SSTable flushes on disk
    lsm.put('node:01:cpu', '42%');
    lsm.put('node:02:cpu', '67%');
    lsm.put('node:03:cpu', '19%');
    lsm.put('node:04:cpu', '88%'); // Flush #1 (sstable_0001.sst)

    lsm.put('node:02:cpu', '71%'); // Overwrite newer value for node:02
    lsm.put('node:05:cpu', '53%');
    lsm.delete('node:03:cpu');      // Tombstone delete for node:03
    lsm.put('node:06:cpu', '31%'); // Flush #2 (sstable_0002.sst)

    // 2. Keep 2 hot keys in active MemTable
    lsm.put('node:07:cpu', '94%');
    lsm.put('node:08:cpu', '12%');

    console.log("Phase 1: Disk SSTable Segments Flushed from MemTable:");
    console.table(lsm.ssTables.map((s) => ({
        SSTableID: s.id,
        SortedKeys: s.keyCount,
        KeyRange: `${s.minKey} .. ${s.maxKey}`,
        BloomGuard: 'Active (1024-bit)'
    })));

    // 3. Execute Read Queries (MemTable hit, SSTable overwrite, Tombstone delete, and 100 missing keys)
    const sampleLookups = [
        { key: 'node:07:cpu', source: 'Active MemTable', result: lsm.get('node:07:cpu') },
        { key: 'node:02:cpu', source: 'SSTable #2 (Latest Overwrite)', result: lsm.get('node:02:cpu') },
        { key: 'node:03:cpu', source: 'SSTable #2 (Tombstone Deleted)', result: lsm.get('node:03:cpu') },
        { key: 'node:01:cpu', source: 'SSTable #1 (Older Segment)', result: lsm.get('node:01:cpu') }
    ];

    // Query 100 non-existent keys to benchmark Bloom Filter disk-read avoidance
    for (let i = 100; i < 200; i++) {
        lsm.get(`node:${i}:missing`);
    }

    console.log("\nPhase 2: Point Lookup Resolution (MemTable -> Newest SSTable -> Tombstones):");
    console.table(sampleLookups);

    // 4. Compact SSTables and verify disk read efficiency
    lsm.compact();

    console.log("\nPhase 3: Read Path I/O Efficiency & Compaction Telemetry:");
    console.table([
        { Metric: "MemTable In-Memory Hits", Value: `${lsm.stats.memTableHits} lookups (0 disk I/O)` },
        { Metric: "Bloom Filter Disk Skips", Value: `${lsm.stats.bloomSkipsAvoidedIO} SSTable scans avoided` },
        { Metric: "Actual SSTable Disk Reads", Value: `${lsm.stats.sstableDiskReads} physical file reads` },
        { Metric: "Post-Compaction SSTables", Value: `${lsm.ssTables.length} merged file (${lsm.ssTables[0].keyCount} live keys, Tombstones purged)` }
    ]);

    console.log("\nInsight: LSM-Trees convert random mutations into sequential SSTable flushes, while per-SSTable Bloom Filters eliminate unnecessary disk seeks for non-existent keys!");
    lsm.cleanup();
}

module.exports = LSMStorageEngine;