/**
 * File Transfer Protocol Module
 * Implements file offer/accept protocol over control channel (ISSUE-002)
 * Handles message serialization and file transfer coordination
 */

import { v4 as uuidv4 } from 'uuid';
import { webrtcManager, ConnectionState, MessageType } from './webrtcManager.js';
import { FileTransfer, FileState, FileQueueManager } from '../utils/fileState.js';
import { errorHandler } from '../utils/errorHandler.js';

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
        this.setupMessageHandlers();
    }

    /**
     * Setup message handlers for control channel
     */
    setupMessageHandlers() {
        // Register with WebRTC manager
        webrtcManager.on('controlMessage', (message) => {
            this.handleControlMessage(message);
        });
    }

    /**
     * Handle incoming control messages
     * @param {Object} message - Parsed JSON message
     */
    handleControlMessage(message) {
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
    handleFileOffer(message) {
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

        // Notify UI
        this.emit('fileOfferReceived', file);
    }

    /**
     * Handle FILE_ACCEPT message
     * @param {Object} message - FILE_ACCEPT message
     */
    handleFileAccept(message) {
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
        }

        // Notify UI
        this.emit('fileAccepted', file);
    }

    /**
     * Handle FILE_REJECT message
     * @param {Object} message - FILE_REJECT message
     */
    handleFileReject(message) {
        const file = this.files.get(message.fileId);
        if (file) {
            file.transitionState(FileState.REJECTED);
            this.files.delete(message.fileId);
            this.emit('fileRejected', file);
        }
    }

    /**
     * Handle TRANSFER_DONE message
     * @param {Object} message - TRANSFER_DONE message
     */
    handleTransferDone(message) {
        const file = this.files.get(message.fileId);
        if (file) {
            file.transitionState(FileState.COMPLETED);
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
    handleFileCancelled(message) {
        const file = this.files.get(message.fileId);
        if (file) {
            file.transitionState(FileState.CANCELLED);
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
     * @returns {Array<FileTransfer>} Created file transfers
     */
    selectFiles(fileList) {
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
            
            // Send FILE_OFFER message (ADR-0013)
            this.sendFileOffer(file);

            files.push(file);
        }

        return files;
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
    sendFileAccept(fileId) {
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
        
        this.emit('fileAccepted', file);
    }

    /**
     * Send FILE_REJECT message
     * @param {string} fileId - File ID to reject
     * @param {string} reason - Reason for rejection
     */
    sendFileReject(fileId, reason = 'USER_REJECTED') {
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
        this.pendingOffers.delete(fileId);
        this.files.delete(fileId);
        
        this.emit('fileRejected', file);
    }

    /**
     * Send CANCELLED message
     * @param {string} fileId - File ID to cancel
     */
    sendFileCancelled(fileId) {
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
        this.queueManager.cancelFile(fileId);
        this.files.delete(fileId);
        
        this.emit('fileCancelled', file);
    }

    /**
     * Send TRANSFER_DONE message
     * @param {string} fileId - File ID that completed
     */
    sendTransferDone(fileId) {
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
    clear() {
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
