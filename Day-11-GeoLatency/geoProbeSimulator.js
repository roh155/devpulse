/**
 * DevPulse Multi-Region Geo-Latency Simulation Engine
 * Simulates distributed regional worker probes across global edge nodes
 * Measures Cross-Region Round-Trip Time (RTT), TTFB variance, and Edge CDN routing savings.
 */

class MultiRegionProbeEngine {
    constructor() {
        // Defined edge worker nodes with realistic physical fiber latency baselines
        this.nodes = [
            { regionId: 'ap-south-1', location: 'Mumbai, IN', baseRttMs: 18, edgeAvailable: true },
            { regionId: 'ap-southeast-1', location: 'Singapore, SG', baseRttMs: 46, edgeAvailable: true },
            { regionId: 'eu-central-1', location: 'Frankfurt, DE', baseRttMs: 124, edgeAvailable: true },
            { regionId: 'us-east-1', location: 'N. Virginia, US', baseRttMs: 198, edgeAvailable: true },
            { regionId: 'sa-east-1', location: 'São Paulo, BR', baseRttMs: 275, edgeAvailable: false }
        ];
    }

    // Helper: Simulate network jitter and server processing time
    simulateLatency(baseMs, jitterMax = 12) {
        const jitter = Math.random() * jitterMax - (jitterMax / 2);
        const serverProcessing = Math.random() * 15 + 10;
        return Number((baseMs + jitter + serverProcessing).toFixed(2));
    }

    // Execute concurrent global probes against a target URL
    async runGlobalProbe(targetEndpoint, originRegion = 'ap-south-1') {
        const timestamp = new Date().toISOString();

        const regionalResults = this.nodes.map(node => {
            // Direct Origin Hit vs Edge Cache Hit simulation
            const originLatency = this.simulateLatency(node.baseRttMs);
            
            // Edge POP brings TLS & static cache closer to the client
            const edgeLatency = node.edgeAvailable 
                ? this.simulateLatency(Math.min(node.baseRttMs * 0.25, 22), 4)
                : originLatency;

            const latencyDeltaMs = Number((originLatency - edgeLatency).toFixed(2));
            const optimizationGain = node.edgeAvailable 
                ? `${((latencyDeltaMs / originLatency) * 100).toFixed(1)}% Faster`
                : 'No Edge POP (0%)';

            return {
                Region: node.regionId,
                Location: node.location,
                OriginTTFB: `${originLatency} ms`,
                EdgeTTFB: `${edgeLatency} ms`,
                LatencySaved: `${latencyDeltaMs} ms`,
                EdgeGain: optimizationGain,
                HealthStatus: originLatency > 220 ? '⚠️ High Geo-Lag' : '✅ Optimal'
            };
        });

        return {
            target: targetEndpoint,
            origin: originRegion,
            timestamp,
            probes: regionalResults
        };
    }
}

// === CLI Simulation for Day 11 Verification ===
if (require.main === module) {
    (async () => {
        console.log("⚡ DevPulse: Dispatching Multi-Region Geo-Latency Probes across 5 Global Nodes...\n");

        const geoEngine = new MultiRegionProbeEngine();
        const telemetry = await geoEngine.runGlobalProbe('https://api.devpulse.io/v1/telemetry');

        console.table(telemetry.probes);

        console.log("\nInsight: Probing from a single location is an observability blindspot. Global edge nodes isolate cross-region network penalties vs origin server processing!");
    })();
}

module.exports = MultiRegionProbeEngine;