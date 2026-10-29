/**
 * DevPulse Real-Time Telemetry Stream Engine
 * Streams continuous endpoint health and latency metrics using Server-Sent Events (SSE)
 * Protocol: HTTP text/event-stream (Unidirectional, low-overhead push)
 */

const http = require('http');

class TelemetryBroadcaster {
    constructor() {
        this.clients = new Set();
    }

    addClient(res) {
        // SSE standard headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // Send initial handshake frame
        res.write(`data: ${JSON.stringify({ status: "CONNECTED", message: "DevPulse Live Stream Active" })}\n\n`);

        this.clients.add(res);

        res.on('close', () => {
            this.clients.delete(res);
        });
    }

    // Broadcast telemetry frame to all active listeners
    broadcast(telemetryEvent) {
        const payload = `event: telemetry\ndata: ${JSON.stringify(telemetryEvent)}\n\n`;
        for (const client of this.clients) {
            client.write(payload);
        }
    }

    getClientCount() {
        return this.clients.size;
    }
}

// === Server & CLI Simulation ===
const broadcaster = new TelemetryBroadcaster();
const PORT = 4000;

const server = http.createServer((req, res) => {
    if (req.url === '/events') {
        broadcaster.addClient(res);
        console.log(`[DevPulse SSE]: Client connected. Active streams: ${broadcaster.getClientCount()}`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <h3>DevPulse Live Telemetry Listener</h3>
            <p>Listen live at <code>/events</code> using EventSource API</p>
        `);
    }
});

server.listen(PORT, () => {
    console.log(`⚡ DevPulse SSE Engine running at http://localhost:${PORT}/events\n`);
    console.log("Simulating real-time telemetry emission every 2 seconds...\n");

    let counter = 1;
    setInterval(() => {
        const sampleTelemetry = {
            id: counter++,
            endpoint: "https://api.internal/v1/auth",
            statusCode: Math.random() > 0.1 ? 200 : 503,
            latencyMs: Number((Math.random() * 45 + 15).toFixed(2)),
            timestamp: new Date().toISOString()
        };

        broadcaster.broadcast(sampleTelemetry);

        // Terminal Preview Table
        console.table([{
            Frame: `#${sampleTelemetry.id}`,
            Target: sampleTelemetry.endpoint,
            Status: sampleTelemetry.statusCode,
            "Latency (TTFB)": `${sampleTelemetry.latencyMs} ms`,
            "Active SSE Listeners": broadcaster.getClientCount()
        }]);
    }, 2000);
});