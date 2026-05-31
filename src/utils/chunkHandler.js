/**
 * Chunk Handler
 * Handles binary chunk parsing and creation for data channel (ADR-0014, ADR-0015)
 */

import { webrtcManager } from '../modules/webrtcManager.js';
import { fileTransferManager } from '../modules/fileTransfer.js';
import { errorHandler } from './errorHandler.js';

// Chunk size: 8KB (ADR-0015)
const CHUNK_SIZE = 8192;
const HEADER_SIZE = 41; // 36 (fileId) + 4 (index) + 1 (isLast)

/**
 * Chunk Handler
 * Manages chunking of files and reassembly
 */
export class ChunkHandler {
    constructor() {
        this.receivedChunks = new Map(); // fileId -> Map<index, ArrayBuffer>
        this.eventListeners = {};
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
            // Parse header
            const fileId = new TextDecoder().decode(data.slice(0, 36));
            const indexBuffer = data.slice(36, 40);
            const index = new DataView(indexBuffer).getUint32(0, false); // big-endian
            const isLast = data[40] === 1;
            const chunkData = data.slice(HEADER_SIZE);

            console.log(`Received chunk: fileId=${fileId.substring(0, 8)}... index=${index} isLast=${isLast} size=${chunkData.byteLength}`);

            // Store chunk
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
     */
    storeChunk(fileId, index, data, isLast) {
        if (!this.receivedChunks.has(fileId)) {
            this.receivedChunks.set(fileId, new Map());
        }

        const fileChunks = this.receivedChunks.get(fileId);
        fileChunks.set(index, data);

        // Check if this is the last chunk
        if (isLast) {
            // All chunks should be here, assemble the file
            this.assembleFile(fileId);
        }
    }

    /**
     * Assemble a complete file from received chunks
     * @param {string} fileId - File ID
     */
    assembleFile(fileId) {
        const fileChunks = this.receivedChunks.get(fileId);
        if (!fileChunks || fileChunks.size === 0) {
            console.error('No chunks for file:', fileId);
            return;
        }

        // Get the file info
        const file = fileTransferManager.getFile(fileId);
        if (!file) {
            console.error('Unknown file:', fileId);
            return;
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

        // Notify that file is complete
        this.emit('fileDataComplete', {
            file,
            data: completeBuffer.buffer
        });

        // Clean up
        this.receivedChunks.delete(fileId);
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

            reader.onload = (event) => {
                const chunk = event.target.result;
                offset += chunk.byteLength;

                // Check if this is the last chunk
                const isLast = offset >= fileSize;

                // Create header + chunk
                const header = this.createChunkHeader(fileId, index, isLast);
                const message = this.combineBuffer(header, chunk);

                // Send via data channel
                webrtcManager.sendDataMessage(message);

                // Read next chunk
                if (!isLast) {
                    this.readNextChunk(reader, file, offset, index + 1, resolve, reject);
                } else {
                    // File transfer complete
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
    }

    /**
     * Clean up all chunks
     */
    cleanupAll() {
        this.receivedChunks.clear();
    }
}

// Singleton instance
export const chunkHandler = new ChunkHandler();
