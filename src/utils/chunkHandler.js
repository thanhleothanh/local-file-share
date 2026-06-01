/**
 * Chunk Handler
 * Handles binary chunk parsing and creation for data channel (ADR-0014, ADR-0015)
 */

import { webrtcManager, MessageType } from '@modules/webrtcManager.js';
import { fileTransferManager } from '@modules/fileTransfer.js';
import { FileState } from '@utils/fileState.js';
import { errorHandler } from '@utils/errorHandler.js';

// Chunk size: 8KB (ADR-0015)
const CHUNK_SIZE = 8192;
const HEADER_SIZE = 41; // 36 (fileId) + 4 (index) + 1 (isLast)

// Max retransmit rounds per file before declaring failure.
const MAX_NACK_ROUNDS = 3;

/**
 * Chunk Handler
 * Manages chunking of files and reassembly
 */
export class ChunkHandler {
    constructor() {
        this.receivedChunks = new Map(); // fileId -> Map<index, ArrayBuffer>
        this.nackRounds = new Map(); // fileId -> count of NACK rounds issued
        this.eventListeners = {};
        this.initialized = false;
    }

    /**
     * Initialize the handler. Must be called after webrtcManager is fully constructed.
     */
    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.setupDataChannelHandler();
    }

    /**
     * Register event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {...any} args - Arguments
     */
    emit(event, ...args) {
        if (this.eventListeners[event]) {
            for (const listener of this.eventListeners[event]) {
                listener(...args);
            }
        }
    }

    /**
     * Setup data channel message handler
     */
    setupDataChannelHandler() {
        webrtcManager.on('dataMessage', (data) => {
            this.handleDataMessage(data);
        });
    }

    /**
     * Handle incoming data message (chunk)
     * @param {ArrayBuffer} data - Binary data from data channel
     */
    handleDataMessage(data) {
        // Validate data size
        if (data.byteLength < HEADER_SIZE) {
            console.warn('Malformed chunk: too small (', data.byteLength, 'bytes)');
            errorHandler.handleFileError(
                new Error(`Malformed chunk: expected at least ${HEADER_SIZE} bytes, got ${data.byteLength}`),
                { operation: 'parseChunkHeader' }
            );
            return;
        }

        try {
            // Parse header. `data` is an ArrayBuffer — it does not have
            // indexed access, so we must go through a Uint8Array view to
            // read individual bytes. `data[40]` returns undefined, not the
            // byte value, which silently broke isLast detection.
            const headerView = new Uint8Array(data);
            const fileId = new TextDecoder().decode(data.slice(0, 36));
            const indexBuffer = data.slice(36, 40);
            const index = new DataView(indexBuffer).getUint32(0, false); // big-endian
            const isLast = headerView[40] === 1;
            const chunkData = data.slice(HEADER_SIZE);

            console.log(`Received chunk: fileId=${fileId.substring(0, 8)}... index=${index} isLast=${isLast} size=${chunkData.byteLength}`);

            // Store chunk and update progress
            this.storeChunk(fileId, index, chunkData, isLast);
        } catch (error) {
            errorHandler.handleFileError(
                new Error(`Failed to parse chunk: ${error.message}`),
                { operation: 'parseChunkHeader', error: error.message }
            );
        }
    }

    /**
     * Store a received chunk
     * @param {string} fileId - File ID
     * @param {number} index - Chunk index
     * @param {ArrayBuffer} data - Chunk data
     * @param {boolean} isLast - Whether this is the last chunk
     * @returns {Promise<void>} Resolves once assembly (if triggered) finishes.
     */
    storeChunk(fileId, index, data, isLast) {
        if (!this.receivedChunks.has(fileId)) {
            this.receivedChunks.set(fileId, new Map());
        }

        const fileChunks = this.receivedChunks.get(fileId);

        // If we've already assembled this file, late-arriving chunks are
        // expected in a small but nonzero number of cases: the receiver
        // briefly NACKs when the isLast chunk arrives a hair ahead of
        // earlier ones (SCTP tail reordering), the sender re-sends from
        // cache, and the original missing chunks arrive in the meantime
        // so assembly completes and FILE_RECEIVED goes out before the
        // re-send reaches us. The data is correct (integrity check
        // verified all indices 0..N-1 before the transition); these are
        // just stragglers from the SCTP send buffer.
        const file = fileTransferManager.getFile(fileId);
        if (file && (file.state === FileState.COMPLETED || file.state === FileState.FAILED)) {
            console.log('Late chunk for terminal-state file (ignored):', fileId, 'index', index, 'state', file.state);
            return Promise.resolve();
        }

        fileChunks.set(index, data);

        // Update file progress
        if (file) {
            file.updateProgress(data.byteLength);
            file.updateChunks(1);
            fileTransferManager.emit('fileProgress', file);
        }

        const expectedChunks = file ? Math.ceil(file.size / CHUNK_SIZE) : 0;

        // Happy path: all expected chunks have arrived. Assemble.
        if (expectedChunks > 0 && fileChunks.size >= expectedChunks) {
            return this.assembleFile(fileId);
        }

        // The sender's isLast chunk is its "I'm done queueing" signal. With
        // a reliable data channel we should always have all chunks by now,
        // but if the count is short the sender's signal is our cue to ask
        // for a retransmit of the missing indices rather than silently
        // assemble a corrupt file.
        if (isLast && file) {
            const missingIndices = [];
            for (let i = 0; i < expectedChunks; i++) {
                if (!fileChunks.has(i)) missingIndices.push(i);
            }
            if (missingIndices.length > 0) {
                return this.handleMissingChunks(fileId, file, missingIndices);
            }
        }

        return Promise.resolve();
    }

    /**
     * Assemble a complete file from received chunks
     * @param {string} fileId - File ID
     */
    async assembleFile(fileId) {
        const fileChunks = this.receivedChunks.get(fileId);
        if (!fileChunks || fileChunks.size === 0) {
            console.error('No chunks for file:', fileId);
            // Mark file as failed
            const file = fileTransferManager.getFile(fileId);
            if (file) {
                file.transitionState(FileState.FAILED);
                fileTransferManager.emit('fileTransferFailed', file);
            }
            return;
        }

        // Get the file info
        const file = fileTransferManager.getFile(fileId);
        if (!file) {
            console.error('Unknown file:', fileId);
            return;
        }

        // Determine expected chunk count from the file size. This is the
        // receiver's source of truth — NOT the isLast flag on a chunk.
        const expectedChunks = Math.ceil(file.size / CHUNK_SIZE);

        // Defensive integrity check: if we got here via the chunk-count path
        // the size should match, but make absolutely sure we don't assemble
        // a corrupt file (e.g., a duplicate-index edge case that slipped
        // through). NACK instead.
        const missingIndices = [];
        for (let i = 0; i < expectedChunks; i++) {
            if (!fileChunks.has(i)) missingIndices.push(i);
        }
        if (missingIndices.length > 0) {
            await this.handleMissingChunks(fileId, file, missingIndices);
            return;
        }

        // Sort chunks by index (should be 0..expectedChunks-1, but be defensive).
        const sortedChunks = Array.from(fileChunks.entries())
            .sort((a, b) => a[0] - b[0]);

        // Calculate total size
        let totalSize = 0;
        for (const [index, chunk] of sortedChunks) {
            totalSize += chunk.byteLength;
        }

        // Create complete file buffer
        const completeBuffer = new Uint8Array(totalSize);
        let offset = 0;

        for (const [index, chunk] of sortedChunks) {
            completeBuffer.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }

        // Mark the file as COMPLETED on the receiver here, not when the sender's
        // TRANSFER_DONE message arrives — the control message can race ahead of
        // late data chunks, and the file is only truly "done" once assembled.
        file.transitionState(FileState.COMPLETED);
        await fileTransferManager.persistFileState(file);
        fileTransferManager.emit('fileTransferComplete', file);

        // Acknowledge receipt to the sender so its UI can also mark COMPLETED.
        this.sendFileReceived(file);

        // Notify that file is complete
        this.emit('fileDataComplete', {
            file,
            data: completeBuffer.buffer
        });

        // Clean up
        this.receivedChunks.delete(fileId);
        this.nackRounds.delete(fileId);
    }

    /**
     * Handle a file with missing chunks by requesting retransmits or
     * declaring failure if too many NACK rounds have been issued.
     * @param {string} fileId
     * @param {FileTransfer} file
     * @param {Array<number>} missingIndices
     */
    async handleMissingChunks(fileId, file, missingIndices) {
        const rounds = (this.nackRounds.get(fileId) || 0) + 1;
        this.nackRounds.set(fileId, rounds);

        if (rounds > MAX_NACK_ROUNDS) {
            console.error('Giving up on file after', MAX_NACK_ROUNDS, 'NACK rounds:', fileId,
                'missing', missingIndices.length, 'chunks');
            errorHandler.handleFileError(
                new Error(`Missing chunks after ${MAX_NACK_ROUNDS} retransmit attempts: ${missingIndices.length} chunks still missing`),
                { fileId, fileName: file.name, missingCount: missingIndices.length, rounds }
            );
            file.transitionState(FileState.FAILED);
            fileTransferManager.emit('fileTransferFailed', file);
            this.receivedChunks.delete(fileId);
            this.nackRounds.delete(fileId);
            return;
        }

        console.warn(`Missing ${missingIndices.length} chunks for file ${fileId}, sending NACK (round ${rounds}/${MAX_NACK_ROUNDS})`);

        const message = {
            type: MessageType.CHUNK_REQUEST_NACK,
            connId: file.connId,
            fileId: file.fileId,
            missingIndices
        };
        webrtcManager.sendControlMessage(message);
    }

    /**
     * Send FILE_RECEIVED to the sender so it can mark its local file COMPLETED
     * and advance the send queue. The receiver's view is the source of truth
     * for "transfer is done from the receiver's perspective".
     * @param {FileTransfer} file
     */
    sendFileReceived(file) {
        const message = {
            type: MessageType.FILE_RECEIVED,
            connId: file.connId,
            fileId: file.fileId,
            totalBytes: file.size
        };
        webrtcManager.sendControlMessage(message);
    }

    /**
     * Send a file over the data channel
     * @param {File} file - File to send
     * @param {string} fileId - File ID
     * @returns {Promise<void>}
     */
    async sendFile(file, fileId) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            let offset = 0;
            let index = 0;
            const fileSize = file.size;

            reader.onload = async (event) => {
                const chunk = event.target.result;
                offset += chunk.byteLength;

                // Check if this is the last chunk
                const isLast = offset >= fileSize;

                // Cache the payload for possible NACK retransmit.
                fileTransferManager.cacheChunk(fileId, index, chunk);

                // Create header + chunk
                const header = this.createChunkHeader(fileId, index, isLast);
                const message = this.combineBuffer(header, chunk);

                // Send via data channel. sendDataMessage returns a Promise
                // that resolves once the SCTP send buffer has drained past
                // bufferedAmountLowThreshold — awaiting it is what stops
                // the channel from overflowing on large files.
                await webrtcManager.sendDataMessage(message);

                // Read next chunk
                if (!isLast) {
                    this.readNextChunk(reader, file, offset, index + 1, resolve, reject);
                } else {
                    // File transfer complete (from sender's perspective); the
                    // receiver's FILE_RECEIVED will mark the local state COMPLETED.
                    fileTransferManager.sendTransferDone(fileId);
                    resolve();
                }

                index++;
            };

            reader.onerror = (error) => {
                console.error('File read error:', error);
                reject(error);
            };

            // Start reading
            this.readNextChunk(reader, file, offset, index, resolve, reject);
        });
    }

    /**
     * Read the next chunk from a file
     * @param {FileReader} reader - FileReader instance
     * @param {File} file - File being read
     * @param {number} offset - Current offset in file
     * @param {number} index - Current chunk index
     * @param {Function} resolve - Promise resolve
     * @param {Function} reject - Promise reject
     */
    readNextChunk(reader, file, offset, index, resolve, reject) {
        const nextOffset = offset + CHUNK_SIZE;
        const chunkSize = Math.min(CHUNK_SIZE, file.size - offset);

        if (chunkSize <= 0) {
            // No more data to read
            resolve();
            return;
        }

        const blob = file.slice(offset, nextOffset);
        reader.readAsArrayBuffer(blob);
    }

    /**
     * Create chunk header
     * @param {string} fileId - File ID (36 bytes UTF-8)
     * @param {number} index - Chunk index
     * @param {boolean} isLast - Whether this is the last chunk
     * @returns {ArrayBuffer} Header buffer
     */
    createChunkHeader(fileId, index, isLast) {
        const headerBuffer = new ArrayBuffer(HEADER_SIZE);
        const view = new DataView(headerBuffer);

        // Write fileId (36 bytes UTF-8)
        const fileIdBytes = new TextEncoder().encode(fileId);
        const headerView = new Uint8Array(headerBuffer);
        headerView.set(fileIdBytes.subarray(0, 36), 0);

        // Write index (4 bytes big-endian Uint32)
        view.setUint32(36, index, false);

        // Write isLast (1 byte)
        view.setUint8(40, isLast ? 1 : 0);

        return headerBuffer;
    }

    /**
     * Combine two buffers
     * @param {ArrayBuffer} buffer1 - First buffer
     * @param {ArrayBuffer} buffer2 - Second buffer
     * @returns {ArrayBuffer} Combined buffer
     */
    combineBuffer(buffer1, buffer2) {
        const combined = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
        combined.set(new Uint8Array(buffer1), 0);
        combined.set(new Uint8Array(buffer2), buffer1.byteLength);
        return combined.buffer;
    }

    /**
     * Get chunk size
     * @returns {number}
     */
    getChunkSize() {
        return CHUNK_SIZE;
    }

    /**
     * Get header size
     * @returns {number}
     */
    getHeaderSize() {
        return HEADER_SIZE;
    }

    /**
     * Clean up chunks for a file
     * @param {string} fileId - File ID
     */
    cleanupFile(fileId) {
        this.receivedChunks.delete(fileId);
        this.nackRounds.delete(fileId);
    }

    /**
     * Clean up all chunks
     */
    cleanupAll() {
        this.receivedChunks.clear();
        this.nackRounds.clear();
    }

    /**
     * Get file data from received chunks (if still in memory)
     * @param {string} fileId - File ID
     * @returns {Promise<ArrayBuffer|null>}
     */
    async getFileData(fileId) {
        const fileChunks = this.receivedChunks.get(fileId);
        if (!fileChunks || fileChunks.size === 0) {
            return null;
        }

        // Sort chunks by index
        const sortedChunks = Array.from(fileChunks.entries())
            .sort((a, b) => a[0] - b[0]);

        // Calculate total size
        let totalSize = 0;
        for (const [index, chunk] of sortedChunks) {
            totalSize += chunk.byteLength;
        }

        // Create complete file buffer
        const completeBuffer = new Uint8Array(totalSize);
        let offset = 0;

        for (const [index, chunk] of sortedChunks) {
            completeBuffer.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }

        return completeBuffer.buffer;
    }
}

// Singleton instance
export const chunkHandler = new ChunkHandler();
