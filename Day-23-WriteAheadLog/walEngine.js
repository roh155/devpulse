/**
 * Day 23: Crash-Safe Write-Ahead Log (WAL) Engine
 * Implements binary log framing, LSN (Log Sequence Numbers), CRC32 checksum verification,
 * torn-write corruption detection, and deterministic crash recovery replay.
 */

const fs = require('fs');
const path = require('path');

// Precomputed CRC32 lookup table (IEEE 802.3 polynomial)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[i] = c >>> 0;
}

function computeCRC32(buffer) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const MAGIC_BYTE = 0xA5; // Frame boundary marker (10100101 in binary)
const HEADER_SIZE = 13; // 1B Magic + 4B LSN + 4B CRC32 + 4B PayloadLength

class WriteAheadLog {
    constructor(filePath) {
        this.filePath = filePath;
        this.lsn = 0; // Log Sequence Number
        this.fd = null;
    }

    open() {
        this.fd = fs.openSync(this.filePath, 'a+');
    }

    // Serialize record into a binary frame and append to WAL
    append(eventPayload) {
        this.lsn++;
        const payloadBuf = Buffer.from(JSON.stringify(eventPayload), 'utf8');
        const crc = computeCRC32(payloadBuf);

        const frame = Buffer.allocUnsafe(HEADER_SIZE + payloadBuf.length);
        frame.writeUInt8(MAGIC_BYTE, 0);                  // Byte 0: Magic Marker
        frame.writeUInt32BE(this.lsn, 1);                 // Bytes 1..4: LSN
        frame.writeUInt32BE(crc, 5);                      // Bytes 5..8: CRC32 Checksum
        frame.writeUInt32BE(payloadBuf.length, 9);        // Bytes 9..12: Payload Length
        payloadBuf.copy(frame, HEADER_SIZE);              // Bytes 13..N: Payload

        fs.writeSync(this.fd, frame);
        fs.fsyncSync(this.fd); // Flush OS page cache to physical disk
        return this.lsn;
    }

    // Simulate power-loss torn write or disk bit-rot corruption at file tail
    simulateTornWriteCorruption() {
        const corruptedTail = Buffer.from([MAGIC_BYTE, 0x00, 0x00, 0x00, 0x99, 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00, 0x00, 0x20, 0x7B, 0x22]);
        fs.writeSync(this.fd, corruptedTail);
    }

    close() {
        if (this.fd !== null) {
            fs.closeSync(this.fd);
            this.fd = null;
        }
    }

    // Crash Recovery: Scan binary frames, verify CRC32, and replay intact state
    recover() {
        const fileBuffer = fs.readFileSync(this.filePath);
        let offset = 0;
        const recoveredRecords = [];
        let corruptedFramesSkipped = 0;

        while (offset < fileBuffer.length) {
            // Check if remaining bytes can hold a complete header
            if (offset + HEADER_SIZE > fileBuffer.length) {
                corruptedFramesSkipped++;
                break;
            }

            const magic = fileBuffer.readUInt8(offset);
            const lsn = fileBuffer.readUInt32BE(offset + 1);
            const expectedCrc = fileBuffer.readUInt32BE(offset + 5);
            const payloadLen = fileBuffer.readUInt32BE(offset + 9);

            // Validate magic byte & frame bounds against torn writes
            if (magic !== MAGIC_BYTE || offset + HEADER_SIZE + payloadLen > fileBuffer.length) {
                corruptedFramesSkipped++;
                break;
            }

            const payloadSlice = fileBuffer.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + payloadLen);
            const actualCrc = computeCRC32(payloadSlice);

            if (actualCrc !== expectedCrc) {
                corruptedFramesSkipped++;
                break;
            }

            recoveredRecords.push({
                LSN: lsn,
                CRC32: `0x${actualCrc.toString(16).toUpperCase().padStart(8, '0')}`,
                Bytes: HEADER_SIZE + payloadLen,
                Payload: JSON.parse(payloadSlice.toString('utf8'))
            });

            this.lsn = lsn;
            offset += HEADER_SIZE + payloadLen;
        }

        return { recoveredRecords, corruptedFramesSkipped, totalBytesScanned: fileBuffer.length };
    }
}

// === CLI Execution & Crash Simulation Suite ===
if (require.main === module) {
    const walPath = path.join(__dirname, 'devpulse.wal');
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);

    console.log("⚡ DevPulse: Running Crash-Safe Write-Ahead Log (WAL) Engine...\n");

    const wal = new WriteAheadLog(walPath);
    wal.open();

    // 1. Append 4 valid telemetry state mutations
    wal.append({ op: 'SET_THRESHOLD', route: '/api/pay', p99LimitMs: 120 });
    wal.append({ op: 'ALERT_TRIGGERED', route: '/api/auth', zScore: 3.42 });
    wal.append({ op: 'CIRCUIT_OPEN', upstream: 'redis-primary', failures: 5 });
    wal.append({ op: 'NODE_JOINED', nodeId: 'pulse-worker-04', region: 'ap-south-1' });

    // 2. Simulate abrupt crash / torn write at tail of log
    wal.simulateTornWriteCorruption();
    wal.close();

    // 3. Reboot & Recover State from WAL
    const recoveryEngine = new WriteAheadLog(walPath);
    const { recoveredRecords, corruptedFramesSkipped, totalBytesScanned } = recoveryEngine.recover();

    console.table(recoveredRecords.map((r) => ({
        LSN: `#${r.LSN}`,
        CRC32_Checksum: r.CRC32,
        FrameSize: `${r.Bytes} B`,
        Operation: r.Payload.op,
        Details: JSON.stringify(r.Payload)
    })));

    console.log(`\n🛡️ Recovery Summary:`);
    console.log(`• Total WAL File Scanned    : ${totalBytesScanned} bytes`);
    console.log(`• Intact Frames Replayed    : ${recoveredRecords.length} records (100% CRC32 verified)`);
    console.log(`• Torn/Corrupted Tail Frames: ${corruptedFramesSkipped} truncated frame safely isolated & discarded`);
    console.log("\nInsight: Binary framing + fsync + CRC32 checksums allow storage engines to recover exact pre-crash state while rejecting partial torn writes!");

    // Cleanup temporary WAL file after verification
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
}

module.exports = { WriteAheadLog, computeCRC32 };