const https = require('https');
const http = require('http');

const { performance } = require('perf_hooks');
const { URL } = require('url');

/**
 * Measures granular HTTP lifecycle phases (DNS, TCP, TLS, TTFB, Total)
 * for any target URL using native Node.js socket event hooks.
 */
function measureEndpoint(targetUrl, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const marks = {
      start: performance.now(),
      dnsLookup: null,
      tcpConnect: null,
      tlsHandshake: null,
      ttfb: null,
      end: null,
    };

    const req = client.request(
      parsedUrl,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'DevPulse-Telemetry-Probe/1.0' },
      },
      (res) => {
        marks.ttfb = performance.now();

        // Consume response stream to measure full transfer completion
        res.on('data', () => {});
        res.on('end', () => {
          marks.end = performance.now();

          const dnsMs = marks.dnsLookup ? marks.dnsLookup - marks.start : 0;
          const tcpMs = marks.tcpConnect
            ? marks.tcpConnect - (marks.dnsLookup || marks.start)
            : 0;
          const tlsMs = marks.tlsHandshake
            ? marks.tlsHandshake - marks.tcpConnect
            : 0;
          const ttfbMs =
            marks.ttfb -
            (marks.tlsHandshake || marks.tcpConnect || marks.start);
          const totalMs = marks.end - marks.start;

          resolve({
            url: targetUrl,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString(),
            metricsMs: {
              dnsLookup: Number(dnsMs.toFixed(2)),
              tcpHandshake: Number(tcpMs.toFixed(2)),
              tlsHandshake: Number(tlsMs.toFixed(2)),
              ttfb: Number(ttfbMs.toFixed(2)),
              totalDuration: Number(totalMs.toFixed(2)),
            },
          });
        });
      }
    );

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        marks.dnsLookup = performance.now();
      });
      socket.on('connect', () => {
        marks.tcpConnect = performance.now();
      });
      socket.on('secureConnect', () => {
        marks.tlsHandshake = performance.now();
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Probe timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject({
        url: targetUrl,
        timestamp: new Date().toISOString(),
        error: err.message,
      });
    });

    req.end();
  });
}

// Quick CLI test run for Day 1 screenshot
if (require.main === module) {
  (async () => {
    const result = await measureEndpoint('https://api.github.com');
    console.log('⚡ DevPulse Telemetry Probe Output:');
    console.table(result.metricsMs);
  })();
}

module.exports = { measureEndpoint };
