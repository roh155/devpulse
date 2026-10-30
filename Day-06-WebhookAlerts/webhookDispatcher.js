/**
 * DevPulse Cryptographic Webhook Alerting Engine
 * Signs outbound incident payloads using HMAC SHA-256 to prevent spoofing and replay attacks.
 */

const crypto = require('crypto');

class WebhookDispatcher {
    constructor(secretKey) {
        this.secretKey = secretKey;
    }

    /**
     * Generates HMAC-SHA256 signature for payload
     */
    generateSignature(payload, timestamp) {
        const serializedPayload = JSON.stringify(payload);
        const signaturePayload = `${timestamp}.${serializedPayload}`;
        
        return crypto
            .createHmac('sha256', this.secretKey)
            .update(signaturePayload)
            .digest('hex');
    }

    /**
     * Dispatches an incident alert with security headers
     */
    dispatchAlert(incidentData) {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = this.generateSignature(incidentData, timestamp);

        const outboundHeaders = {
            'Content-Type': 'application/json',
            'X-DevPulse-Timestamp': timestamp,
            'X-DevPulse-Signature': `v1=${signature}`
        };

        return {
            status: "DISPATCHED",
            endpoint: "https://api.monitoring.internal/webhooks/alerts",
            headers: outboundHeaders,
            payload: incidentData
        };
    }

    /**
     * Verifies incoming webhook signature on consumer end
     */
    verifySignature(payload, incomingSignature, incomingTimestamp, toleranceSec = 300) {
        const currentTimestamp = Math.floor(Date.now() / 1000);

        // 1. Replay attack prevention: Reject timestamps older than 5 minutes
        if (Math.abs(currentTimestamp - incomingTimestamp) > toleranceSec) {
            return { valid: false, reason: "Replay attack detected: Timestamp expired." };
        }

        // 2. Compute expected HMAC signature
        const expectedSignature = this.generateSignature(payload, incomingTimestamp);

        // 3. Constant-time comparison to prevent timing attacks
        const isValid = crypto.timingSafeEqual(
            Buffer.from(incomingSignature.replace('v1=', '')),
            Buffer.from(expectedSignature)
        );

        return {
            valid: isValid,
            reason: isValid ? "Signature verified successfully." : "Tampered or invalid signature."
        };
    }
}

// === CLI Simulation for Day 6 Verification ===
if (require.main === module) {
    console.log("⚡ DevPulse: Simulating Secure HMAC Webhook Dispatch & Verification...\n");

    const SHARED_SECRET = "devpulse_super_secret_webhook_key_2026";
    const dispatcher = new WebhookDispatcher(SHARED_SECRET);

    // 1. Triggered Incident
    const incidentPayload = {
        alertId: "INC-98214",
        target: "https://api.internal/v1/checkout",
        metric: "p99_latency_breach",
        thresholdMs: 500,
        currentP99Ms: 1420.50,
        severity: "CRITICAL",
        triggeredAt: new Date().toISOString()
    };

    const dispatched = dispatcher.dispatchAlert(incidentPayload);

    // 2. Verify legitimate dispatch
    const legitimateVerification = dispatcher.verifySignature(
        incidentPayload,
        dispatched.headers['X-DevPulse-Signature'],
        dispatched.headers['X-DevPulse-Timestamp']
    );

    // 3. Tampering Simulation (Attacker modifies severity to LOW)
    const tamperedPayload = { ...incidentPayload, severity: "LOW" };
    const tamperedVerification = dispatcher.verifySignature(
        tamperedPayload,
        dispatched.headers['X-DevPulse-Signature'],
        dispatched.headers['X-DevPulse-Timestamp']
    );

    console.table([
        {
            Test: "Legitimate Incident Alert",
            AlertID: incidentPayload.alertId,
            Severity: incidentPayload.severity,
            Valid: legitimateVerification.valid ? "✅ VALID" : "❌ REJECTED",
            SecurityStatus: legitimateVerification.reason
        },
        {
            Test: "Tampered Alert Simulation",
            AlertID: tamperedPayload.alertId,
            Severity: tamperedPayload.severity,
            Valid: tamperedVerification.valid ? "✅ VALID" : "❌ REJECTED",
            SecurityStatus: tamperedVerification.reason
        }
    ]);

    console.log(`\nGenerated Header: X-DevPulse-Signature -> ${dispatched.headers['X-DevPulse-Signature'].substring(0, 35)}...`);
}

module.exports = WebhookDispatcher;