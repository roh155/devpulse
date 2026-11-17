/**
 * Day 24: Epidemic Gossip Protocol & SWIM-Style Failure Detector
 * Simulates decentralized peer-to-peer membership convergence, heartbeat merging,
 * and Suspect -> Dead node failure propagation without a central coordinator.
 */

const NODE_STATES = {
    ALIVE: '🟢 ALIVE',
    SUSPECT: '🟡 SUSPECT',
    DEAD: '🔴 DEAD'
};

class GossipNode {
    constructor(nodeId, region) {
        this.nodeId = nodeId;
        this.region = region;
        this.heartbeat = 1;
        this.isCrashed = false;

        // Local membership table: nodeId -> { heartbeat, state, lastUpdatedTick, region }
        this.membership = new Map();
        this.membership.set(nodeId, {
            heartbeat: 1,
            state: NODE_STATES.ALIVE,
            lastUpdatedTick: 0,
            region
        });
    }

    // Seed initial knowledge of another peer
    introducePeer(peerNode) {
        if (!this.membership.has(peerNode.nodeId)) {
            this.membership.set(peerNode.nodeId, {
                heartbeat: 1,
                state: NODE_STATES.ALIVE,
                lastUpdatedTick: 0,
                region: peerNode.region
            });
        }
    }

    // Advance local heartbeat and evaluate peer timeouts on every gossip tick
    tick(currentTick, suspectThreshold = 3, deadThreshold = 6) {
        if (this.isCrashed) return;

        this.heartbeat++;
        this.membership.set(this.nodeId, {
            heartbeat: this.heartbeat,
            state: NODE_STATES.ALIVE,
            lastUpdatedTick: currentTick,
            region: this.region
        });

        // Evaluate peers for staleness (SWIM-style Suspicion -> Dead transition)
        for (const [peerId, info] of this.membership.entries()) {
            if (peerId === this.nodeId || info.state === NODE_STATES.DEAD) continue;

            const ticksSinceLastSeen = currentTick - info.lastUpdatedTick;
            if (ticksSinceLastSeen >= deadThreshold) {
                info.state = NODE_STATES.DEAD;
            } else if (ticksSinceLastSeen >= suspectThreshold) {
                info.state = NODE_STATES.SUSPECT;
            }
        }
    }

    // Merge incoming membership digest from a gossip peer (CRDT-style max-heartbeat merge)
    receiveGossip(incomingMembership, currentTick) {
        if (this.isCrashed) return;

        for (const [peerId, remoteInfo] of incomingMembership.entries()) {
            if (peerId === this.nodeId) continue;

            const localInfo = this.membership.get(peerId);

            if (!localInfo) {
                this.membership.set(peerId, {
                    ...remoteInfo,
                    lastUpdatedTick: currentTick
                });
            } else if (remoteInfo.heartbeat > localInfo.heartbeat && localInfo.state !== NODE_STATES.DEAD) {
                // Newer heartbeat proves peer is alive
                this.membership.set(peerId, {
                    heartbeat: remoteInfo.heartbeat,
                    state: NODE_STATES.ALIVE,
                    lastUpdatedTick: currentTick,
                    region: remoteInfo.region
                });
            } else if (remoteInfo.state === NODE_STATES.DEAD && localInfo.state !== NODE_STATES.DEAD) {
                // Propagate confirmed failure state across cluster
                localInfo.state = NODE_STATES.DEAD;
            }
        }
    }
}

class GossipClusterSimulator {
    constructor(nodeConfigs, fanout = 2) {
        this.nodes = nodeConfigs.map((cfg) => new GossipNode(cfg.id, cfg.region));
        this.fanout = fanout; // Number of random peers contacted per tick (O(1) overhead)
        this.currentTick = 0;

        // Seed minimal ring topology (each node initially only knows its immediate neighbor)
        for (let i = 0; i < this.nodes.length; i++) {
            const nextPeer = this.nodes[(i + 1) % this.nodes.length];
            this.nodes[i].introducePeer(nextPeer);
        }
    }

    stepRound() {
        this.currentTick++;

        // 1. Every healthy node increments its heartbeat & checks suspicion timers
        for (const node of this.nodes) {
            node.tick(this.currentTick);
        }

        // 2. Each healthy node selects `fanout` random known peers and exchanges state
        for (const sender of this.nodes) {
            if (sender.isCrashed) continue;

            const candidates = this.nodes.filter(
                (n) => n.nodeId !== sender.nodeId && sender.membership.has(n.nodeId)
            );

            // Shuffle and pick `fanout` peers
            const targets = candidates
                .sort(() => Math.random() - 0.5)
                .slice(0, this.fanout);

            for (const target of targets) {
                if (!target.isCrashed) {
                    // Bidirectional push-pull gossip exchange
                    target.receiveGossip(sender.membership, this.currentTick);
                    sender.receiveGossip(target.membership, this.currentTick);
                }
            }
        }
    }

    crashNode(nodeId) {
        const target = this.nodes.find((n) => n.nodeId === nodeId);
        if (target) {
            target.isCrashed = true;
        }
    }

    getClusterViewFrom(observerNodeId) {
        const observer = this.nodes.find((n) => n.nodeId === observerNodeId);
        const rows = [];
        for (const [peerId, info] of [...observer.membership.entries()].sort()) {
            rows.push({
                MemberNode: peerId,
                Region: info.region,
                LatestHeartbeat: `v${info.heartbeat}`,
                LastSeenTick: `Tick #${info.lastUpdatedTick}`,
                DetectedStatus: info.state
            });
        }
        return rows;
    }
}

// === CLI Execution & Failure Convergence Simulation ===
if (require.main === module) {
    console.log("⚡ DevPulse: Running Decentralized Gossip Protocol & Failure Detection Simulation...\n");

    const cluster = new GossipClusterSimulator([
        { id: 'pulse-node-01', region: 'ap-south-1' },
        { id: 'pulse-node-02', region: 'ap-south-1' },
        { id: 'pulse-node-03', region: 'us-east-1' },
        { id: 'pulse-node-04', region: 'eu-west-1' },
        { id: 'pulse-node-05', region: 'ap-southeast-1' }
    ], 2);

    // Phase 1: Run 4 gossip rounds -> Full cluster membership converges from minimal ring seeds
    for (let i = 0; i < 4; i++) cluster.stepRound();

    console.log("Phase 1 (Tick #4): Epidemic Membership Convergence across all 5 decentralized nodes:");
    console.table(cluster.getClusterViewFrom('pulse-node-01'));

    // Phase 2: Crash 'pulse-node-04' abruptly and advance 3 ticks -> Transitions to SUSPECT
    cluster.crashNode('pulse-node-04');
    for (let i = 0; i < 3; i++) cluster.stepRound();

    console.log("\nPhase 2 (Tick #7): 'pulse-node-04' stopped heartbeating -> Peers mark node as SUSPECT:");
    console.table(cluster.getClusterViewFrom('pulse-node-01'));

    // Phase 3: Advance 4 more ticks -> Exceeds dead threshold and converges to DEAD cluster-wide
    for (let i = 0; i < 4; i++) cluster.stepRound();

    console.log("\nPhase 3 (Tick #11): Failure threshold exceeded -> Cluster-wide consensus marks 'pulse-node-04' DEAD:");
    console.table(cluster.getClusterViewFrom('pulse-node-05'));

    console.log("\nInsight: With O(1) fanout=2 per tick, membership discovery and failure detection converged across all regions without a single central coordinator!");
}

module.exports = { GossipNode, GossipClusterSimulator, NODE_STATES };