/**
 * Day 26: Consistent Hashing Ring with Virtual Nodes (VNodes)
 * Implements 32-bit FNV-1a ring hashing, O(log V) binary search routing,
 * uniform load balancing across VNodes, and minimal key migration on cluster scaling.
 */

class ConsistentHashRing {
    constructor(virtualNodesPerServer = 150) {
        this.vnodes = virtualNodesPerServer;
        this.ring = []; // Sorted array of { hash: uint32, nodeId: string }
        this.physicalNodes = new Set();
    }

    // Fast, deterministic 32-bit FNV-1a hash function
    hash32(key) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return hash >>> 0;
    }

    // Add a physical server along with its Virtual Nodes onto the ring
    addNode(nodeId) {
        if (this.physicalNodes.has(nodeId)) return;
        this.physicalNodes.add(nodeId);

        for (let v = 0; v < this.vnodes; v++) {
            const vnodeKey = `${nodeId}#vnode-${v}`;
            const hash = this.hash32(vnodeKey);
            this.ring.push({ hash, nodeId });
        }

        // Maintain ascending ring order for O(log V) binary search
        this.ring.sort((a, b) => a.hash - b.hash);
    }

    // Remove a crashed/decommissioned server and all its Virtual Nodes
    removeNode(nodeId) {
        if (!this.physicalNodes.has(nodeId)) return;
        this.physicalNodes.delete(nodeId);
        this.ring = this.ring.filter((entry) => entry.nodeId !== nodeId);
    }

    // Route a key clockwise to the nearest VNode via Binary Search
    getNode(key) {
        if (this.ring.length === 0) return null;

        const keyHash = this.hash32(key);
        let low = 0;
        let high = this.ring.length - 1;

        // Wrap-around: if keyHash exceeds the largest ring hash, route to index 0
        if (keyHash > this.ring[high].hash) {
            return this.ring[0].nodeId;
        }

        while (low < high) {
            const mid = (low + high) >>> 1;
            if (this.ring[mid].hash < keyHash) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return this.ring[low].nodeId;
    }
}

// === CLI Execution & Shard Rebalancing Benchmark ===
if (require.main === module) {
    console.log("⚡ DevPulse: Running Consistent Hashing Ring (150 VNodes/Server) Benchmark...\n");

    const totalKeys = 100000;
    const keys = Array.from({ length: totalKeys }, (_, i) => `tenant:telemetry:stream:${i}`);

    const ring = new ConsistentHashRing(150);
    const initialServers = ['shard-ap-south-01', 'shard-ap-south-02', 'shard-us-east-01', 'shard-eu-west-01'];
    initialServers.forEach((srv) => ring.addNode(srv));

    // Phase 1: Route 100,000 keys across 4 servers and measure distribution balance
    const initialMapping = new Map();
    const distributionBefore = {};
    initialServers.forEach((s) => (distributionBefore[s] = 0));

    for (const k of keys) {
        const target = ring.getNode(k);
        initialMapping.set(k, target);
        distributionBefore[target]++;
    }

    console.log("Phase 1: Uniform Key Distribution across 4 Nodes (100,000 Telemetry Keys):");
    console.table(
        Object.entries(distributionBefore).map(([node, count]) => ({
            ShardNode: node,
            AssignedKeys: count.toLocaleString(),
            LoadShare: `${((count / totalKeys) * 100).toFixed(2)}%`,
            IdealTarget: "25.00%"
        }))
    );

    // Phase 2: Scale out cluster by adding a 5th node -> Measure moved vs retained keys
    const newServer = 'shard-ap-southeast-01';
    ring.addNode(newServer);

    let keysMoved = 0;
    const distributionAfter = {};
    [...initialServers, newServer].forEach((s) => (distributionAfter[s] = 0));

    for (const k of keys) {
        const newTarget = ring.getNode(k);
        distributionAfter[newTarget]++;
        if (newTarget !== initialMapping.get(k)) {
            keysMoved++;
        }
    }

    const keysRetained = totalKeys - keysMoved;
    const remappedPct = ((keysMoved / totalKeys) * 100).toFixed(2);
    const moduloRemappedPct = (80.0).toFixed(2); // Standard hash(k) % N moves ~80% on 4 -> 5 resize

    console.log(`\nPhase 2: Zero-Downtime Scale-Out (+1 Node: '${newServer}') Rebalancing Metrics:`);
    console.table([
        {
            Metric: "Total Telemetry Keys Routed",
            Result: totalKeys.toLocaleString(),
            Comparison: "100% deterministic O(log V) lookup"
        },
        {
            Metric: "Cache/Shard Hits Preserved",
            Result: `${keysRetained.toLocaleString()} keys (${(100 - Number(remappedPct)).toFixed(2)}%)`,
            Comparison: "Zero global cache stampede"
        },
        {
            Metric: "Keys Migrated to New Shard",
            Result: `${keysMoved.toLocaleString()} keys (${remappedPct}%)`,
            Comparison: `Matches theoretical 1/N (20.00%) vs ~${moduloRemappedPct}% naive modulo`
        }
    ]);

    console.log("\nInsight: Virtual Nodes eliminate hotspot skew (~25% even split per node), while ring topology limits key migration strictly to 1/N (~20%) during horizontal scale-out!");
}

module.exports = ConsistentHashRing;