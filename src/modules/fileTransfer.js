/**
 * File Transfer Protocol Module
 * Implements file offer/accept protocol over control channel (ISSUE-002)
 * Handles message serialization and file transfer coordination
 */

import { v4 as uuidv4 } from 'uuid';
import { webrtcManager, ConnectionState, MessageType } from '@modules/webrtcManager.js';
import { FileTransfer, FileState, FileQueueManager } from '@utils/fileState.js';
import { errorHandler } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';

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

        // Persist received file to storage (ISSUE-005)
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
            // Sender: transition based on queue state
            if (this.queueManager.hasCurrentFile()) {
                file.transitionState(FileState.QUEUED);
            } else {
                file.transitionState(FileState.TRANSFERRING);
                this.queueManager.currentFile = file;
            }
            this.queueManager.addFile(file);
            
            // Persist state (ISSUE-005)
            await this.persistFileState(file);
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
     * @param {Object} message - TRANSFER_DONE message
     */
    async handleTransferDone(message) {
        const file = this.files.get(message.fileId);
        if (file) {
            file.transitionState(FileState.COMPLETED);
            await this.persistFileState(file);
            this.queueManager.completeCurrentFile(file);
            
            // Start next file if queue is not empty
            const nextFile = this.queueManager.startNextFile();
            if (nextFile) {
                this.emit('fileTransferStarted', nextFile);
            }
            
            this.emit('fileTransferComplete', file);
        }
    }

    /**
     * Handle CANCELLED message
     * @param {Object} message - CANCELLED message
     */
    async handleFileCancelled(message) {
        const file = this.files.get(message.fileId);
        if (file) {
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

            // Check queue limits (ADR-0009, ISSUE-012)
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
                direction: 'send'
            });

            // Store file
            this.files.set(fileId, file);
            
            // Persist file to storage (ISSUE-005)
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
        
        // Update state
        file.transitionState(FileState.TRANSFERRING);
        this.queueManager.currentFile = file;
        this.pendingOffers.delete(fileId);
        
        // Persist state (ISSUE-005)
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
     * Send TRANSFER_DONE message
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
        
        // Update state
        file.transitionState(FileState.COMPLETED);
        await this.persistFileState(file);
        this.queueManager.completeCurrentFile(file);
        
        this.emit('fileTransferComplete', file);
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
     * Clear all files (on connection close)
     * ADR-0018: Queued files are discarded when connection closes
     */
    async clear() {
        const currentConn = webrtcManager.getConnectionInfo();
        const connId = currentConn.connId;
        
        // Delete all files for this connection from storage
        if (connId) {
            try {
                const files = this.getAllFiles();
                for (const file of files) {
                    await storageManager.deleteFile(connId, file.fileId);
                }
            } catch (error) {
                console.error('Failed to clean up file storage:', error);
            }
        }
        
        this.files.clear();
        this.pendingOffers.clear();
        this.queueManager.clear();
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
