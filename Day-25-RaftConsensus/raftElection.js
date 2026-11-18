/**
 * Day 25: Simplified Raft Consensus Leader Election Engine
 * Implements Follower -> Candidate -> Leader state machine, logical Terms,
 * Quorum majority voting, Split-Vote recovery, and automatic Leader Failover.
 */

const ROLES = {
    FOLLOWER: '🔵 FOLLOWER',
    CANDIDATE: '🟡 CANDIDATE',
    LEADER: '👑 LEADER',
    CRASHED: '💀 CRASHED'
};

class RaftNode {
    constructor(nodeId, clusterSize) {
        this.nodeId = nodeId;
        this.clusterSize = clusterSize;
        this.quorum = Math.floor(clusterSize / 2) + 1;

        this.currentTerm = 0;
        this.votedFor = null;
        this.role = ROLES.FOLLOWER;
        this.leaderId = null;

        // Randomized election timeout (in ticks) to prevent perpetual split votes
        this.electionTimeout = this.resetElectionTimer();
        this.ticksSinceHeartbeat = 0;
    }

    resetElectionTimer() {
        this.ticksSinceHeartbeat = 0;
        // Randomized window between 3 and 7 ticks
        this.electionTimeout = Math.floor(Math.random() * 5) + 3;
        return this.electionTimeout;
    }

    // Receive AppendEntries heartbeat from an authoritative Leader
    receiveHeartbeat(leaderId, term) {
        if (this.role === ROLES.CRASHED) return false;

        if (term >= this.currentTerm) {
            this.currentTerm = term;
            this.role = ROLES.FOLLOWER;
            this.leaderId = leaderId;
            this.votedFor = null;
            this.resetElectionTimer();
            return true;
        }
        return false;
    }

    // Handle RequestVote RPC from a Candidate
    handleVoteRequest(candidateId, candidateTerm) {
        if (this.role === ROLES.CRASHED) return false;

        // Step down if candidate has a strictly higher logical Term
        if (candidateTerm > this.currentTerm) {
            this.currentTerm = candidateTerm;
            this.role = ROLES.FOLLOWER;
            this.votedFor = null;
            this.leaderId = null;
        }

        // Grant vote at most once per Term
        if (candidateTerm === this.currentTerm && (this.votedFor === null || this.votedFor === candidateId)) {
            this.votedFor = candidateId;
            this.resetElectionTimer();
            return true;
        }

        return false;
    }
}

class RaftCluster {
    constructor(nodeIds) {
        this.nodes = nodeIds.map((id) => new RaftNode(id, nodeIds.length));
        this.tickCount = 0;
        this.electionLogs = [];
    }

    getLeader() {
        return this.nodes.find((n) => n.role === ROLES.LEADER) || null;
    }

    // Force an artificial split vote between two nodes to verify Raft resolution
    triggerSplitVote(nodeAId, nodeBId) {
        const nextTerm = Math.max(...this.nodes.map((n) => n.currentTerm)) + 1;
        const nodeA = this.nodes.find((n) => n.nodeId === nodeAId);
        const nodeB = this.nodes.find((n) => n.nodeId === nodeBId);

        [nodeA, nodeB].forEach((cand) => {
            cand.currentTerm = nextTerm;
            cand.role = ROLES.CANDIDATE;
            cand.votedFor = cand.nodeId;
            cand.resetElectionTimer();
        });

        // Remaining followers split their votes evenly (neither hits Quorum of 3/5)
        const followers = this.nodes.filter((n) => n.nodeId !== nodeAId && n.nodeId !== nodeBId);
        followers[0].handleVoteRequest(nodeAId, nextTerm);
        followers[1].handleVoteRequest(nodeBId, nextTerm);
        // 5th follower experiences simulated packet drop (abstains)

        this.electionLogs.push({
            Tick: `Tick #${this.tickCount}`,
            Term: `Term ${nextTerm}`,
            Event: `⚡ Split Vote (${nodeAId}: 2 votes, ${nodeBId}: 2 votes) -> No Quorum (Need 3/5)`
        });
    }

    stepTick() {
        this.tickCount++;
        const activeLeader = this.getLeader();

        // 1. If a healthy Leader exists, broadcast heartbeats to suppress follower elections
        if (activeLeader) {
            for (const peer of this.nodes) {
                if (peer.nodeId !== activeLeader.nodeId) {
                    peer.receiveHeartbeat(activeLeader.nodeId, activeLeader.currentTerm);
                }
            }
            return;
        }

        // 2. Otherwise, advance election timers on active nodes
        for (const node of this.nodes) {
            if (node.role === ROLES.CRASHED) continue;

            node.ticksSinceHeartbeat++;
            if (node.ticksSinceHeartbeat >= node.electionTimeout) {
                this.runElection(node);
                if (this.getLeader()) break; // Stop once a leader wins quorum this tick
            }
        }
    }

    runElection(candidate) {
        candidate.currentTerm++;
        candidate.role = ROLES.CANDIDATE;
        candidate.votedFor = candidate.nodeId;
        candidate.resetElectionTimer();

        let votesGranted = 1; // Self-vote

        for (const peer of this.nodes) {
            if (peer.nodeId === candidate.nodeId) continue;
            if (peer.handleVoteRequest(candidate.nodeId, candidate.currentTerm)) {
                votesGranted++;
            }
        }

        if (votesGranted >= candidate.quorum) {
            candidate.role = ROLES.LEADER;
            candidate.leaderId = candidate.nodeId;

            // Immediately establish authority via heartbeat
            for (const peer of this.nodes) {
                if (peer.nodeId !== candidate.nodeId) {
                    peer.receiveHeartbeat(candidate.nodeId, candidate.currentTerm);
                }
            }

            this.electionLogs.push({
                Tick: `Tick #${this.tickCount}`,
                Term: `Term ${candidate.currentTerm}`,
                Event: `👑 ${candidate.nodeId} elected LEADER with Quorum (${votesGranted}/${candidate.clusterSize} votes)`
            });
        }
    }

    crashCurrentLeader() {
        const leader = this.getLeader();
        if (leader) {
            leader.role = ROLES.CRASHED;
            leader.leaderId = null;
            this.electionLogs.push({
                Tick: `Tick #${this.tickCount}`,
                Term: `Term ${leader.currentTerm}`,
                Event: `💀 Leader ${leader.nodeId} CRASHED! Heartbeats halted.`
            });
        }
    }

    getClusterSnapshot() {
        return this.nodes.map((n) => ({
            NodeID: n.nodeId,
            Role: n.role,
            LogicalTerm: `Term ${n.currentTerm}`,
            VotedFor: n.votedFor || '-',
            KnownLeader: n.leaderId || 'None'
        }));
    }
}

// === CLI Execution & Consensus Failover Simulation ===
if (require.main === module) {
    console.log("⚡ DevPulse: Running Raft Consensus Leader Election & Failover Simulation...\n");

    const cluster = new RaftCluster([
        'raft-node-01',
        'raft-node-02',
        'raft-node-03',
        'raft-node-04',
        'raft-node-05'
    ]);

    // Phase 1: Simulate an initial Split Vote, then advance ticks until randomized timer elects a Leader
    cluster.triggerSplitVote('raft-node-01', 'raft-node-02');
    while (!cluster.getLeader()) {
        cluster.stepTick();
    }

    console.log("Phase 1: Split-Vote Resolved via Randomized Election Timers -> Strong Leader Elected:");
    console.table(cluster.getClusterSnapshot());

    // Phase 2: Crash the elected Leader and advance ticks until remaining 4 nodes elect a new Leader
    cluster.crashCurrentLeader();
    while (!cluster.getLeader()) {
        cluster.stepTick();
    }

    console.log("\nPhase 2: Automatic Leader Failover -> New Term & Quorum Majority Re-Elected:");
    console.table(cluster.getClusterSnapshot());

    console.log("\n📜 Raft Consensus Audit Trail:");
    console.table(cluster.electionLogs);

    console.log("\nInsight: Strictly enforcing Quorum majority (3/5 votes) and monotonic Term increments guarantees at most one authoritative Leader per Term—preventing Split-Brain data corruption!");
}

module.exports = { RaftNode, RaftCluster, ROLES };