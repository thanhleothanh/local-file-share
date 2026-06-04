/**
 * File Transfer Protocol Module
 * Implements file offer/accept protocol over control channel
 * Handles message serialization and file transfer coordination
 */

import { v4 as uuidv4 } from 'uuid';
import { webrtcManager, ConnectionState, MessageType } from '@modules/webrtcManager.js';
import { FileTransfer, FileState, FileQueueManager } from '@utils/fileState.js';
import { errorHandler } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';
import { chunkHandler } from '@utils/chunkHandler.js';

export { FileState };

// Maximum file size: 500MB (ADR-0005)
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB in bytes

/**
 * File Transfer Manager
 * Manages file offers, accepts, rejects, and protocol messages
 */
export class FileTransferManager {
    constructor() {
        this.queueManager = new FileQueueManager();
        this.files = new Map(); // fileId -> FileTransfer
        this.pendingOffers = new Map(); // fileId -> FileTransfer (for receiver side)
        this.sentChunkCache = new Map(); // fileId -> Map<index, ArrayBuffer> for NACK retransmit
        this.ackTimers = new Map(); // fileId -> timeout handle for waiting on FILE_RECEIVED
        this.eventListeners = {};
        this.initialized = false;
    }

    /**
     * Initialize the manager. Must be called after webrtcManager is fully constructed.
     */
    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.setupMessageHandlers();
    }

    /**
     * Setup message handlers for control channel
     */
    setupMessageHandlers() {
        // Register with WebRTC manager
        webrtcManager.on('controlMessage', async (message) => {
            try {
                await this.handleControlMessage(message);
            } catch (error) {
                console.error('Error handling control message:', error);
                errorHandler.handleError(error);
            }
        });
    }

    /**
     * Persist file state to storage
     * @param {FileTransfer} file - File to persist
     * @returns {Promise<void>}
     */
    async persistFileState(file) {
        try {
            await storageManager.updateFileState(file.connId, file.fileId, file.state);
        } catch (error) {
            console.error('Failed to persist file state:', error);
            errorHandler.handleStorageError(error, { operation: 'persistFileState', fileId: file.fileId });
        }
    }

    /**
     * Handle incoming control messages
     * @param {Object} message - Parsed JSON message
     */
    async handleControlMessage(message) {
        if (!message || typeof message !== 'object' || !message.type) {
            console.warn('Invalid control message format');
            return;
        }

        console.log('FileTransferManager received message:', message.type);
        
        switch (message.type) {
            case MessageType.FILE_OFFER:
                this.handleFileOffer(message);
                break;
            case MessageType.FILE_ACCEPT:
                this.handleFileAccept(message);
                break;
            case MessageType.FILE_REJECT:
                this.handleFileReject(message);
                break;
            case MessageType.TRANSFER_DONE:
                this.handleTransferDone(message);
                break;
            case MessageType.FILE_RECEIVED:
                await this.handleFileReceived(message);
                break;
            case MessageType.CHUNK_REQUEST_NACK:
                await this.handleChunkRequestNack(message);
                break;
            case MessageType.CHUNK_ACK:
                this.handleChunkAck(message);
                break;
            case MessageType.CANCELLED:
                this.handleFileCancelled(message);
                break;
            case MessageType.CLOSE:
                this.handleCloseMessage(message);
                break;
            case MessageType.PING:
                this.handlePing(message);
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Handle FILE_OFFER message
     * @param {Object} message - FILE_OFFER message
     */
    async handleFileOffer(message) {
        // Validate message structure
        const requiredFields = ['connId', 'fileId', 'name', 'size', 'mime'];
        for (const field of requiredFields) {
            if (!(field in message)) {
                console.error('Invalid FILE_OFFER message: missing field', field);
                errorHandler.handleProtocolError(
                    new Error(`Invalid FILE_OFFER message: missing field ${field}`),
                    { message, missingField: field }
                );
                return;
            }
        }

        // Check if this is for our connection
        const currentConn = webrtcManager.getConnectionInfo();
        if (message.connId !== currentConn.connId) {
            console.warn('FILE_OFFER for different connection, ignoring');
            return;
        }

        // Validate file size (ADR-0005)
        if (message.size > MAX_FILE_SIZE) {
            console.error('File too large:', message.size);
            errorHandler.handleFileError(
                new Error(`File too large: ${message.size} bytes (max ${MAX_FILE_SIZE})`),
                { fileId: message.fileId, fileName: message.name }
            );
            // Send reject with reason
            this.sendFileReject(message.fileId, 'FILE_TOO_LARGE');
            return;
        }

        // Check queue limits (ADR-0009)
        const canAdd = this.queueManager.checkCanAddFile(message.size);
        if (!canAdd.canAdd) {
            console.error('Queue limit exceeded:', canAdd.reason);
            errorHandler.handleFileError(
                new Error(`Queue limit exceeded: ${canAdd.reason}`),
                { fileId: message.fileId, fileName: message.name, fileSize: message.size }
            );
            // Send reject with reason
            this.sendFileReject(message.fileId, canAdd.reason);
            return;
        }

        // Create file transfer object
        const file = new FileTransfer({
            connId: message.connId,
            fileId: message.fileId,
            name: message.name,
            size: message.size,
            mime: message.mime,
            direction: 'receive'
        });

        // Store pending offer
        this.pendingOffers.set(file.fileId, file);
        this.files.set(file.fileId, file);

        // Persist received file to storage
        try {
            await storageManager.saveFile({
                connId: file.connId,
                fileId: file.fileId,
                name: file.name,
                size: file.size,
                mime: file.mime,
                state: file.state,
                direction: file.direction,
                createdAt: file.createdAt
            });
        } catch (error) {
            console.error('Failed to save received file to storage:', error);
            errorHandler.handleStorageError(error, { operation: 'handleFileOffer', fileId: file.fileId });
        }

        // Notify UI
        this.emit('fileOfferReceived', file);
    }

    /**
     * Handle FILE_ACCEPT message
     * @param {Object} message - FILE_ACCEPT message
     */
    async handleFileAccept(message) {
        const requiredFields = ['connId', 'fileId'];
        for (const field of requiredFields) {
            if (!(field in message)) {
                console.error('Invalid FILE_ACCEPT message: missing field', field);
                webrtcManager.close();
                return;
            }
        }

        const file = this.files.get(message.fileId);
        if (!file) {
            console.warn('FILE_ACCEPT for unknown file:', message.fileId);
            return;
        }

        // Update file state
        if (file.direction === 'send') {
            // Sender: transition based on queue state. A file is either the
            // currentFile (being transferred) OR a queued file (waiting) —
            // never both. Adding it to the queue when it becomes current
            // would cause startNextFile to re-shift the just-completed file
            // and re-send it, leaving the real next file stuck at QUEUED.
            const becomesCurrent = !this.queueManager.hasCurrentFile();
            if (becomesCurrent) {
                file.transitionState(FileState.TRANSFERRING);
                this.queueManager.currentFile = file;
            } else {
                file.transitionState(FileState.QUEUED);
                this.queueManager.addFile(file);
            }

            // Persist state
            await this.persistFileState(file);

            if (becomesCurrent) {
                this.startSendingChunks(file);
            }
        }

        // Notify UI
        this.emit('fileAccepted', file);
    }

    /**
     * Handle FILE_REJECT message
     * @param {Object} message - FILE_REJECT message
     */
    async handleFileReject(message) {
        const file = this.files.get(message.fileId);
        if (file) {
            // Flush any pending ACKs for this file before marking as REJECTED (ADR-0030)
            chunkHandler.flushAckBatch(message.fileId);
            
            file.transitionState(FileState.REJECTED);
            await this.persistFileState(file);
            
            // Clean up from storage
            try {
                await storageManager.deleteFile(file.connId, file.fileId);
            } catch (error) {
                console.error('Failed to delete rejected file from storage:', error);
            }
            
            this.files.delete(message.fileId);
            this.emit('fileRejected', file);
        }
    }

    /**
     * Handle TRANSFER_DONE message
     *
     * This is the *sender's* "I queued my last byte" signal. It is NOT a
     * confirmation that the receiver has all the bytes — the control and data
     * channels are independent and the control message can race ahead of late
     * data chunks. With reliable data channels this should be rare, but the
     * receiver's transition to COMPLETED happens in chunkHandler.assembleFile
     * once the expected chunk count is reached.
     *
     * The sender transitions its own file to COMPLETED only after receiving
     * FILE_RECEIVED from the receiver. If chunks are missing, the receiver
     * will send CHUNK_REQUEST_NACK; we re-send the missing chunks from cache.
     *
     * @param {Object} message - TRANSFER_DONE message
     */
    async handleTransferDone(message) {
        const file = this.files.get(message.fileId);
        if (!file) return;

        // No-op on this side: we don't advance the queue or mark COMPLETED.
        // Wait for FILE_RECEIVED (success) or NACK (retransmit).
    }

    /**
     * Handle FILE_RECEIVED message — the receiver's explicit "I have all the
     * bytes" acknowledgement. This is the only thing that should mark the
     * sender's local file as COMPLETED.
     * @param {Object} message - FILE_RECEIVED message
     */
    async handleFileReceived(message) {
        const file = this.files.get(message.fileId);
        if (!file) return;

        this.clearAckTimer(message.fileId);
        this.sentChunkCache.delete(message.fileId);

        file.transitionState(FileState.COMPLETED);
        await this.persistFileState(file);
        this.queueManager.completeCurrentFile(file);

        this.emit('fileTransferComplete', file);

        // Advance the local send queue now that the receiver has confirmed.
        const nextFile = this.queueManager.startNextFile();
        if (nextFile) {
            this.emit('fileTransferStarted', nextFile);
            this.startSendingChunks(nextFile);
        }
    }

    /**
     * Handle CHUNK_REQUEST_NACK — the receiver detected missing chunks. Re-send
     * the requested indices from the in-memory cache.
     * @param {Object} message - CHUNK_REQUEST_NACK message
     */
    async handleChunkRequestNack(message) {
        const { fileId, missingIndices, connId } = message;
        const cache = this.sentChunkCache.get(fileId);

        if (!cache) {
            console.warn('NACK for file with no cache (probably evicted):', fileId);
            return;
        }

        const file = this.files.get(fileId);
        if (!file) return;

        console.log(`Re-sending ${missingIndices.length} chunks for file ${fileId}`);

        for (const index of missingIndices) {
            const chunk = cache.get(index);
            if (!chunk) {
                console.warn('Cache miss for chunk index', index, 'file', fileId);
                continue;
            }
            const header = chunkHandler.createChunkHeader(fileId, index, false);
            const messageBuffer = chunkHandler.combineBuffer(header, chunk);
            await webrtcManager.sendDataMessage(messageBuffer);
        }

        // Reset the ack timer; the receiver should respond with FILE_RECEIVED
        // once the re-sent chunks arrive.
        this.scheduleAckTimeout(fileId);
    }

    /**
     * Expand range format to individual indices
     * e.g., [[0,2],[4,5]] -> [0,1,2,4,5]
     * @param {Array<[number, number]>} ranges - Array of [start, end] ranges
     * @returns {Array<number>} Flat array of indices
     */
    expandRangesToIndices(ranges) {
        if (!ranges || !Array.isArray(ranges)) return [];
        
        const indices = [];
        for (const [start, end] of ranges) {
            for (let i = start; i <= end; i++) {
                indices.push(i);
            }
        }
        return indices;
    }

    /**
     * Handle CHUNK_ACK — the receiver has acknowledged receipt of specific chunks.
     * Delete the acknowledged chunks from the sender's cache to prevent memory
     * growth (ADR-0030). This is idempotent: if a chunk was already deleted, no-op.
     * @param {Object} message - CHUNK_ACK message with { fileId, ranges: Array<[number, number]> }
     */
    handleChunkAck(message) {
        const { fileId, ranges, connId } = message;
        
        if (!fileId || !ranges || !Array.isArray(ranges)) {
            console.warn('Invalid CHUNK_ACK message format:', message);
            return;
        }

        const cache = this.sentChunkCache.get(fileId);
        if (!cache) {
            // File cache may have been cleared already (file completed/failed/cancelled)
            console.log('CHUNK_ACK for file with no cache (already cleaned up):', fileId);
            return;
        }

        const file = this.files.get(fileId);
        if (!file) {
            console.warn('CHUNK_ACK for unknown file:', fileId);
            return;
        }

        // Check if this is for our connection
        const currentConn = webrtcManager.getConnectionInfo();
        if (connId && connId !== currentConn.connId) {
            console.warn('CHUNK_ACK for different connection, ignoring');
            return;
        }

        // Expand ranges to individual indices
        const indices = this.expandRangesToIndices(ranges);

        let deletedCount = 0;
        for (const index of indices) {
            // Idempotent: delete is a no-op if key doesn't exist
            if (cache.delete(index)) {
                deletedCount++;
            }
        }

        console.log(`CHUNK_ACK: deleted ${deletedCount} of ${indices.length} cached chunks for file ${fileId.substring(0, 8)}...`);

        // If cache is now empty, we can remove the fileId entry entirely
        if (cache.size === 0) {
            this.sentChunkCache.delete(fileId);
            console.log(`CHUNK_ACK: cache for file ${fileId.substring(0, 8)}... is now empty, removed`);
        }
    }

    /**
     * Handle CANCELLED message
     * @param {Object} message - CANCELLED message
     */
    async handleFileCancelled(message) {
        const file = this.files.get(message.fileId);
        if (file) {
            // Flush any pending ACKs for this file before marking as CANCELLED (ADR-0030)
            chunkHandler.flushAckBatch(message.fileId);
            
            file.transitionState(FileState.CANCELLED);
            await this.persistFileState(file);
            
            // Clean up from storage
            try {
                await storageManager.deleteFile(file.connId, file.fileId);
            } catch (error) {
                console.error('Failed to delete cancelled file from storage:', error);
            }
            
            this.queueManager.cancelFile(message.fileId);
            this.files.delete(message.fileId);
            this.emit('fileCancelled', file);
        }
    }

    /**
     * Handle CLOSE message
     * @param {Object} message - CLOSE message
     */
    handleCloseMessage(message) {
        // Close the connection
        webrtcManager.close();
    }

    /**
     * Handle PING message
     * @param {Object} message - PING message
     */
    handlePing(message) {
        // Respond with PONG
        this.sendControlMessage({ type: MessageType.PONG });
    }

    /**
     * Select files to send
     * @param {FileList|Array} fileList - Files to send
     * @param {Object} options - Options for selection
     * @param {boolean} options.sendImmediately - Whether to send offers immediately (default: true)
     * @returns {Promise<Array<FileTransfer>>} Created file transfers
     */
    async selectFiles(fileList, options = {}) {
        const { sendImmediately = true } = options;
        const files = [];
        const currentConn = webrtcManager.getConnectionInfo();
        
        if (!currentConn.connId) {
            console.error('No active connection, cannot send files');
            return files;
        }

        for (const fileItem of fileList) {
            // Validate file size (ADR-0005)
            if (fileItem.size > MAX_FILE_SIZE) {
                console.error('File too large:', fileItem.name, fileItem.size);
                this.emit('fileError', { file: fileItem, error: 'FILE_TOO_LARGE' });
                continue;
            }

            // Check queue limits (ADR-0009)
            const canAdd = this.queueManager.checkCanAddFile(fileItem.size);
            if (!canAdd.canAdd) {
                console.error('Queue limit exceeded:', canAdd.reason);
                const errorReason = canAdd.reason === 'QUEUE_FILE_LIMIT' 
                    ? 'Queue has reached maximum number of files (50)'
                    : 'Queue has reached maximum size (500MB)';
                this.emit('fileError', { file: fileItem, error: errorReason });
                errorHandler.handleFileError(
                    new Error(errorReason),
                    { fileId: 'N/A', fileName: fileItem.name, fileSize: fileItem.size, reason: canAdd.reason }
                );
                continue;
            }

            const fileId = uuidv4();
            const file = new FileTransfer({
                connId: currentConn.connId,
                fileId,
                name: fileItem.name,
                size: fileItem.size,
                mime: fileItem.type || this.getMimeType(fileItem.name),
                direction: 'send',
                fileObject: fileItem
            });

            // Store file
            this.files.set(fileId, file);
            
            // Persist file to storage
            try {
                await storageManager.saveFile({
                    connId: file.connId,
                    fileId: file.fileId,
                    name: file.name,
                    size: file.size,
                    mime: file.mime,
                    state: file.state,
                    direction: file.direction,
                    createdAt: file.createdAt
                });
            } catch (error) {
                console.error('Failed to save file to storage:', error);
                errorHandler.handleStorageError(error, { operation: 'selectFiles', fileId: file.fileId });
            }
            
            // Send FILE_OFFER message only if requested (ADR-0013)
            if (sendImmediately) {
                this.sendFileOffer(file);
            }

            files.push(file);
        }

        return files;
    }

    /**
     * Send file offers for already selected files
     * @param {Array<FileTransfer>} files - Files to send offers for
     */
    sendFileOffers(files) {
        for (const file of files) {
            this.sendFileOffer(file);
        }
    }

    /**
     * Send FILE_OFFER message
     * @param {FileTransfer} file - File to offer
     */
    sendFileOffer(file) {
        const message = {
            type: MessageType.FILE_OFFER,
            connId: file.connId,
            fileId: file.fileId,
            name: file.name,
            size: file.size,
            mime: file.mime
        };
        
        webrtcManager.sendControlMessage(message);
        this.emit('fileOfferSent', file);
    }

    /**
     * Send FILE_ACCEPT message
     * @param {string} fileId - File ID to accept
     */
    async sendFileAccept(fileId) {
        const file = this.pendingOffers.get(fileId);
        if (!file) {
            console.error('Cannot accept unknown file:', fileId);
            return;
        }

        const message = {
            type: MessageType.FILE_ACCEPT,
            connId: file.connId,
            fileId: file.fileId
        };
        
        webrtcManager.sendControlMessage(message);

        // Update state. The receiver's progress is tracked by the file's own
        // state (TRANSFERRING -> COMPLETED in assembleFile), NOT by the queue
        // manager. The queue manager tracks the SEND queue only — sharing the
        // `currentFile` slot with receive-side tracking would leak terminal
        // receive state across direction switches and leave the next send
        // stuck at QUEUED (startNextFile short-circuits on a non-null
        // currentFile).
        file.transitionState(FileState.TRANSFERRING);
        this.pendingOffers.delete(fileId);

        // Persist state
        await this.persistFileState(file);

        this.emit('fileAccepted', file);
    }

    /**
     * Send FILE_REJECT message
     * @param {string} fileId - File ID to reject
     * @param {string} reason - Reason for rejection
     */
    async sendFileReject(fileId, reason = 'USER_REJECTED') {
        const file = this.pendingOffers.get(fileId);
        if (!file) {
            console.error('Cannot reject unknown file:', fileId);
            return;
        }

        const message = {
            type: MessageType.FILE_REJECT,
            connId: file.connId,
            fileId: file.fileId,
            reason
        };
        
        webrtcManager.sendControlMessage(message);
        
        // Update state
        file.transitionState(FileState.REJECTED);
        await this.persistFileState(file);
        
        // Clean up from storage on reject
        try {
            await storageManager.deleteFile(file.connId, file.fileId);
        } catch (error) {
            console.error('Failed to delete rejected file from storage:', error);
        }
        
        this.pendingOffers.delete(fileId);
        this.files.delete(fileId);
        
        this.emit('fileRejected', file);
    }

    /**
     * Send CANCELLED message
     * @param {string} fileId - File ID to cancel
     */
    async sendFileCancelled(fileId) {
        await this.sendFileCancel(fileId);
    }

    /**
     * Send CANCELLED message to cancel a pending file offer
     * @param {string} fileId - File ID to cancel
     */
    async sendFileCancel(fileId) {
        const file = this.files.get(fileId);
        if (!file) {
            console.error('Cannot cancel unknown file:', fileId);
            return;
        }

        const message = {
            type: MessageType.CANCELLED,
            connId: file.connId,
            fileId: file.fileId
        };
        
        webrtcManager.sendControlMessage(message);
        
        // Update state
        file.transitionState(FileState.CANCELLED);
        await this.persistFileState(file);
        
        // Clean up from storage
        try {
            await storageManager.deleteFile(file.connId, file.fileId);
        } catch (error) {
            console.error('Failed to delete cancelled file from storage:', error);
        }
        
        this.queueManager.cancelFile(fileId);
        this.files.delete(fileId);
        
        this.emit('fileCancelled', file);
    }

    /**
     * Start sending chunks for a file that has just become the current transfer.
     * Called from handleFileAccept (first file) and handleTransferDone (next queued).
     * @param {FileTransfer} file - File whose chunks to send
     */
    startSendingChunks(file) {
        if (!file.fileObject) {
            console.error('Cannot send chunks: no File object for', file.fileId, '(likely a received file)');
            file.transitionState(FileState.FAILED);
            this.emit('fileError', { file, error: 'NO_FILE_OBJECT' });
            return;
        }
        if (typeof chunkHandler?.sendFile !== 'function') {
            console.error('chunkHandler.sendFile is not available');
            file.transitionState(FileState.FAILED);
            this.emit('fileError', { file, error: 'CHUNK_HANDLER_UNAVAILABLE' });
            return;
        }
        chunkHandler.sendFile(file.fileObject, file.fileId).catch((error) => {
            console.error('Chunk send failed for', file.fileId, error);
            errorHandler.handleFileError(error, { operation: 'sendFile', fileId: file.fileId });
            file.transitionState(FileState.FAILED);
            this.emit('fileError', { file, error: error.message });
        });
    }

    /**
     * Send TRANSFER_DONE message
     *
     * The sender queues this after all data chunks have been queued. It does
     * NOT mark the file as COMPLETED here — the file only transitions to
     * COMPLETED on this side when FILE_RECEIVED arrives from the receiver.
     * @param {string} fileId - File ID that completed
     */
    async sendTransferDone(fileId) {
        const file = this.files.get(fileId);
        if (!file) {
            console.error('Cannot complete unknown file:', fileId);
            return;
        }

        const message = {
            type: MessageType.TRANSFER_DONE,
            connId: file.connId,
            fileId: file.fileId
        };

        webrtcManager.sendControlMessage(message);

        // Start waiting for the receiver's FILE_RECEIVED acknowledgement. If
        // the receiver detects missing chunks it will issue a NACK; we
        // re-send from the cache. If no response arrives in time, the file
        // is marked FAILED.
        this.scheduleAckTimeout(fileId);
    }

    /**
     * Cache a chunk for possible retransmit on NACK.
     * @param {string} fileId
     * @param {number} index
     * @param {ArrayBuffer} data - chunk payload (header-stripped)
     */
    cacheChunk(fileId, index, data) {
        if (!this.sentChunkCache.has(fileId)) {
            this.sentChunkCache.set(fileId, new Map());
        }
        this.sentChunkCache.get(fileId).set(index, data);
    }

    /**
     * Drop the in-memory chunk cache for a file.
     * @param {string} fileId
     */
    clearChunkCache(fileId) {
        this.sentChunkCache.delete(fileId);
    }

    /**
     * Schedule (or reset) the timeout that marks a file FAILED if the receiver
     * never acknowledges it.
     * @param {string} fileId
     */
    scheduleAckTimeout(fileId) {
        this.clearAckTimer(fileId);
        const handle = setTimeout(() => {
            const file = this.files.get(fileId);
            if (!file) return;
            if (file.state === FileState.COMPLETED || file.state === FileState.FAILED) {
                return;
            }
            console.error('Timed out waiting for FILE_RECEIVED:', fileId);
            this.sentChunkCache.delete(fileId);
            file.transitionState(FileState.FAILED);
            this.persistFileState(file).catch(() => {});
            this.emit('fileTransferFailed', file);
            this.queueManager.failCurrentFile(file);
            const nextFile = this.queueManager.startNextFile();
            if (nextFile) {
                this.emit('fileTransferStarted', nextFile);
                this.startSendingChunks(nextFile);
            }
        }, 30_000);
        this.ackTimers.set(fileId, handle);
    }

    /**
     * Clear a pending ack timeout for a file.
     * @param {string} fileId
     */
    clearAckTimer(fileId) {
        const handle = this.ackTimers.get(fileId);
        if (handle) {
            clearTimeout(handle);
            this.ackTimers.delete(fileId);
        }
    }

    /**
     * Send a control message
     * @param {Object} message - Message to send
     */
    sendControlMessage(message) {
        webrtcManager.sendControlMessage(message);
    }

    /**
     * Get files by state
     * @param {string} state - State to filter by
     * @returns {Array<FileTransfer>}
     */
    getFilesByState(state) {
        return Array.from(this.files.values()).filter(f => f.state === state);
    }

    /**
     * Get all files
     * @returns {Array<FileTransfer>}
     */
    getAllFiles() {
        return Array.from(this.files.values());
    }

    /**
     * Get file by ID
     * @param {string} fileId - File ID
     * @returns {FileTransfer|null}
     */
    getFile(fileId) {
        return this.files.get(fileId) || null;
    }

    /**
     * Wipe the in-memory file list and clean up persisted state.
     * The in-memory wipe runs synchronously so the Files tab can
     * re-render to the empty state without waiting for storage.
     * IndexedDB cleanup runs in the background.
     */
    async clear() {
        const currentConn = webrtcManager.getConnectionInfo();
        const connId = currentConn.connId;

        // Cancel ack timers first so they don't fire and try to
        // advance the queue after it has been cleared.
        for (const handle of this.ackTimers.values()) {
            clearTimeout(handle);
        }
        this.ackTimers.clear();
        this.sentChunkCache.clear();

        // Flush all pending ACKs on the receiver side (ADR-0030)
        chunkHandler.flushAllAckBatches();

        // Snapshot the file IDs that need to be removed from IndexedDB
        // *before* we wipe the in-memory maps; the async cleanup loop
        // below still needs to know what to delete.
        const fileIds = [...this.files.keys()];

        // Wipe in-memory state synchronously so the next render of
        // the Files tab sees an empty list.
        this.files.clear();
        this.pendingOffers.clear();
        this.queueManager.clear();

        // IndexedDB cleanup runs in the background. We don't `await` it
        // because (a) the in-memory wipe is what the UI cares about and
        // is already done, and (b) any leftover rows in storage will be
        // reaped on the next `clear()` call. Per-file errors are
        // logged but not rethrown — the connection is already gone.
        if (connId && fileIds.length > 0) {
            (async () => {
                for (const fileId of fileIds) {
                    try {
                        await storageManager.deleteFile(connId, fileId);
                    } catch (error) {
                        console.error('Failed to clean up file storage:', error);
                    }
                }
            })();
        }
    }

    /**
     * Get queue info
     * @returns {Object}
     */
    getQueueInfo() {
        return this.queueManager.getQueueInfo();
    }

    /**
     * Check if queue can accept a file
     * @param {number} fileSize - Size of file
     * @returns {{canAdd: boolean, reason?: string}}
     */
    checkQueueForFile(fileSize) {
        return this.queueManager.checkCanAddFile(fileSize);
    }

    /**
     * Get MIME type from file name
     * @param {string} fileName - File name
     * @returns {string} MIME type
     */
    getMimeType(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        const mimeTypes = {
            txt: 'text/plain',
            html: 'text/html',
            htm: 'text/html',
            css: 'text/css',
            js: 'application/javascript',
            json: 'application/json',
            xml: 'application/xml',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            svg: 'image/svg+xml',
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            zip: 'application/zip',
            rar: 'application/x-rar-compressed',
            tar: 'application/x-tar',
            gz: 'application/gzip',
            tgz: 'application/gzip',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            mp4: 'video/mp4',
            webm: 'video/webm',
            mov: 'video/quicktime',
            avi: 'video/x-msvideo'
        };
        return mimeTypes[extension] || 'application/octet-stream';
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
}

// Singleton instance
export const fileTransferManager = new FileTransferManager();
