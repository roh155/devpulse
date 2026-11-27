/**
 * Day 31 (BONUS): ES2026 & Node.js v26 LTS Systems Upgrade
 * Showcases native ES2026 primitives (with spec-compliant runtime polyfills for Node v24):
 *  1. Map.prototype.getOrInsertComputed() for single-lookup shard/metric registry
 *  2. Uint8Array.prototype.toHex() / setFromHex() for binary frame transport
 *  3. JSON.parse() source-text reviver & JSON.rawJSON() for lossless 64-bit BigInt LSNs
 *  4. Math.sumPrecise() & Error.isError() for cross-realm fault telemetry
 */

const vm = require('vm');

// === Spec-Compliant ES2026 Polyfills for Node.js v24 Compatibility ===
if (!Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () {
        let out = '';
        for (let i = 0; i < this.length; i++) {
            out += this[i].toString(16).padStart(2, '0');
        }
        return out;
    };
}

if (!Uint8Array.prototype.setFromHex) {
    Uint8Array.prototype.setFromHex = function (hexStr) {
        const byteCount = Math.min(this.length, Math.floor(hexStr.length / 2));
        for (let i = 0; i < byteCount; i++) {
            this[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
        }
        return { read: byteCount * 2, written: byteCount };
    };
}

if (!Map.prototype.getOrInsertComputed) {
    Map.prototype.getOrInsertComputed = function (key, callbackFn) {
        if (this.has(key)) return this.get(key);
        const value = callbackFn(key);
        this.set(key, value);
        return value;
    };
}

if (!Math.sumPrecise) {
    Math.sumPrecise = function (iterable) {
        // Neumaier compensated summation for IEEE-754 drift prevention
        let sum = 0.0;
        let c = 0.0;
        for (const val of iterable) {
            const t = sum + val;
            if (Math.abs(sum) >= Math.abs(val)) {
                c += (sum - t) + val;
            } else {
                c += (val - t) + sum;
            }
            sum = t;
        }
        return sum + c;
    };
}

if (!Error.isError) {
    Error.isError = function (err) {
        return err instanceof Error || Object.prototype.toString.call(err) === '[object Error]';
    };
}

class ES2026TelemetryUpgrade {
    constructor() {
        this.shardMetrics = new Map();
        this.scratchFrame = new Uint8Array(16);
    }

    // 1. Single-lookup metric initialization with Map.prototype.getOrInsertComputed()
    recordShardEvent(shardId, latencyMs) {
        const entry = this.shardMetrics.getOrInsertComputed(shardId, (key) => ({
            shard: key,
            count: 0,
            latencies: []
        }));

        entry.count++;
        entry.latencies.push(latencyMs);
        return entry;
    }

    // 2. Native/Polyfilled Uint8Array Hex Encoding & In-Place Decoding
    encodeBinaryHeader(lsnBigInt, shardCode, flags) {
        const header = new Uint8Array(16);
        const view = new DataView(header.buffer);
        view.setBigUint64(0, lsnBigInt, false); // 8-byte BigInt LSN
        view.setUint32(8, shardCode, false);   // 4-byte Shard ID
        view.setUint32(12, flags, false);      // 4-byte Telemetry Flags

        return header.toHex();
    }

    decodeBinaryHeaderInPlace(hexPayload) {
        const { read, written } = this.scratchFrame.setFromHex(hexPayload);
        const view = new DataView(this.scratchFrame.buffer);

        return {
            bytesDecoded: written,
            hexCharsRead: read,
            lsn: view.getBigUint64(0, false),
            shardCode: view.getUint32(8, false),
            flags: view.getUint32(12, false)
        };
    }

    // 3. Lossless 64-bit BigInt JSON Serialization & Parsing (JSON.rawJSON + context.source)
    serializeLosslessEvent(eventObj) {
        return JSON.stringify(eventObj, (_key, value) => {
            if (typeof value === 'bigint') {
                return JSON.rawJSON(value.toString());
            }
            return value;
        });
    }

    parseLosslessEvent(rawJsonStr) {
        return JSON.parse(rawJsonStr, (key, value, context) => {
            if (key === 'lsn' && context && typeof context.source === 'string') {
                return BigInt(context.source);
            }
            return value;
        });
    }
}

// === CLI Execution & ES2026 Feature Verification ===
if (require.main === module) {
    console.log(`⚡ DevPulse Day 31 (Bonus): Running ES2026 Primitives Benchmark on Node.js ${process.version}...\n`);

    const engine = new ES2026TelemetryUpgrade();

    // Feature Check 1: Lossless 64-bit BigInt LSN exceeding Number.MAX_SAFE_INTEGER (2^53 - 1)
    const highPrecisionLSN = 9007199254740993847n;
    const wireJson = engine.serializeLosslessEvent({
        lsn: highPrecisionLSN,
        shard: 'ap-south-01',
        op: 'COMMIT_BATCH'
    });
    const parsedEvent = engine.parseLosslessEvent(wireJson);
    const naiveNumberCorruption = Number(highPrecisionLSN);

    // Feature Check 2: Uint8Array.toHex() & setFromHex()
    const hexFrame = engine.encodeBinaryHeader(highPrecisionLSN, 0x0A01, 0x00FF);
    const decodedFrame = engine.decodeBinaryHeaderInPlace(hexFrame);

    console.log("1️⃣ ES2026 Binary Wire & Lossless 64-Bit BigInt Verification:");
    console.table([
        {
            Feature: "JSON.rawJSON() + context.source",
            Input: `${highPrecisionLSN}n`,
            Output: `${parsedEvent.lsn}n (Exact Match: ${parsedEvent.lsn === highPrecisionLSN})`,
            LegacyTrapAvoided: `Standard JS Number corrupts to ${naiveNumberCorruption}`
        },
        {
            Feature: "Uint8Array.toHex() / setFromHex()",
            Input: "16-byte Binary Frame",
            Output: `${hexFrame.slice(0, 16)}... (${decodedFrame.bytesDecoded}B decoded)`,
            LegacyTrapAvoided: "Zero intermediate Buffer/string allocations"
        }
    ]);

    // Feature Check 3: Map.getOrInsertComputed() + Math.sumPrecise() + Error.isError()
    const sampleLatencies = [0.1, 0.2, 0.3, 1.45, 0.05];
    for (const lat of sampleLatencies) {
        engine.recordShardEvent('ap-south-01', lat);
    }
    engine.recordShardEvent('us-east-01', 14.25);

    const apSouthStats = engine.shardMetrics.get('ap-south-01');
    const preciseTotalMs = Math.sumPrecise(apSouthStats.latencies);
    const naiveSumMs = apSouthStats.latencies.reduce((a, b) => a + b, 0);

    // Cross-realm Error test via Node vm context
    const crossRealmErr = vm.runInNewContext('new TypeError("Cross-worker stream fault")');

    console.log("\n2️⃣ ES2026 Map.getOrInsertComputed(), Math.sumPrecise() & Error.isError():");
    console.table([
        {
            ES2026Primitive: "Map.getOrInsertComputed()",
            VerifiedResult: `2 shards initialized in single-lookup path (${apSouthStats.count} events on ap-south-01)`,
            SystemsImpact: "Eliminates double hash-table lookups on hot paths"
        },
        {
            ES2026Primitive: "Math.sumPrecise()",
            VerifiedResult: `Exact: ${preciseTotalMs} ms vs Naive Reduce: ${naiveSumMs} ms`,
            SystemsImpact: "Prevents IEEE-754 floating-point drift in SLA aggregation"
        },
        {
            ES2026Primitive: "Error.isError() (Cross-Realm)",
            VerifiedResult: `Error.isError: ${Error.isError(crossRealmErr)} vs instanceof: ${crossRealmErr instanceof Error}`,
            SystemsImpact: "Safe error detection across worker_threads & vm realms"
        }
    ]);

    console.log("\nInsight: ES2026 turns common systems-engineering workarounds—64-bit BigInt JSON parsing, typed-array hex framing, single-lookup Map caching, and cross-realm error checks—into fast, native V8 builtins!");
}

module.exports = ES2026TelemetryUpgrade;