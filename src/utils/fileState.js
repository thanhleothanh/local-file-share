/**
 * File State Machine
 * Manages file transfer state transitions (ADR-0011)
 */

// File state constants
export const FileState = {
    PENDING: 'PENDING',       // File offered, waiting for accept/reject
    QUEUED: 'QUEUED',         // File accepted but waiting for current transfer to finish
    TRANSFERRING: 'TRANSFERRING', // Actively sending/receiving chunks
    COMPLETED: 'COMPLETED',     // All chunks received, ready for download
    REJECTED: 'REJECTED',       // Receiver declined the file
    FAILED: 'FAILED',          // Transfer error occurred
    CANCELLED: 'CANCELLED'     // Sender cancelled before transfer started
};

/**
 * Valid file state transitions
 */
export const ValidFileTransitions = {
    [FileState.PENDING]: [FileState.QUEUED, FileState.TRANSFERRING, FileState.REJECTED, FileState.CANCELLED, FileState.FAILED],
    [FileState.QUEUED]: [FileState.TRANSFERRING, FileState.CANCELLED, FileState.FAILED],
    [FileState.TRANSFERRING]: [FileState.COMPLETED, FileState.FAILED],
    [FileState.COMPLETED]: [], // Terminal state
    [FileState.REJECTED]: [],  // Terminal state
    [FileState.FAILED]: [],     // Terminal state
    [FileState.CANCELLED]: []  // Terminal state
};

/**
 * File class representing a file transfer
 */
export class FileTransfer {
    constructor({ connId, fileId, name, size, mime, direction = 'send', fileObject = null }) {
        this.connId = connId;
        this.fileId = fileId;
        this.name = name;
        this.size = size;
        this.mime = mime;
        this.direction = direction; // 'send' or 'receive'
        this.fileObject = fileObject; // Browser File/Blob on send side, null on receive side
        this.state = FileState.PENDING;
        this.createdAt = Date.now();
        this.completedAt = null;
        this.terminatedAt = null;
        this.bytesTransferred = 0;
        this.chunksReceived = 0;
        this.totalChunks = 0;
    }

    /**
     * Get progress percentage
     * @returns {number} Progress percentage (0-100)
     */
    getProgress() {
        if (this.size === 0) return 100;
        return Math.round((this.bytesTransferred / this.size) * 100);
    }

    /**
     * Update transfer progress
     * @param {number} bytes - Additional bytes transferred
     */
    updateProgress(bytes) {
        this.bytesTransferred += bytes;
    }

    /**
     * Update chunk count
     * @param {number} chunks - Number of chunks received
     */
    updateChunks(chunks) {
        this.chunksReceived += chunks;
    }

    /**
     * Set total chunks for this file
     * @param {number} totalChunks - Total number of chunks
     */
    setTotalChunks(totalChunks) {
        this.totalChunks = totalChunks;
    }

    /**
     * Transition to a new state
     * @param {string} newState - New state
     * @returns {boolean} True if transition was valid
     */
    transitionState(newState) {
        const allowedTransitions = ValidFileTransitions[this.state] || [];
        if (allowedTransitions.includes(newState)) {
            this.state = newState;
            if (newState === FileState.COMPLETED) {
                this.completedAt = Date.now();
            } else if (newState === FileState.FAILED
                || newState === FileState.REJECTED
                || newState === FileState.CANCELLED) {
                this.terminatedAt = Date.now();
            }
            return true;
        }
        return false;
    }

    /**
     * Get the timestamp of the most recent state-changing event on this file.
     * Used to sort the All chip chronologically: a COMPLETED file appears by
     * its completion time, a FAILED file by its termination time, an active
     * file by its creation time.
     * @returns {number}
     */
    getLastEventTime() {
        return this.completedAt || this.terminatedAt || this.createdAt;
    }

    /**
     * Which filter group this file belongs to in the UI:
     *  - 'active': PENDING, QUEUED, or TRANSFERRING — anything needing
     *    attention or in flight.
     *  - 'done': COMPLETED, FAILED, REJECTED, CANCELLED — terminal states.
     * @returns {'active'|'done'}
     */
    getStateGroup() {
        switch (this.state) {
            case FileState.PENDING:
            case FileState.QUEUED:
            case FileState.TRANSFERRING:
                return 'active';
            case FileState.COMPLETED:
            case FileState.FAILED:
            case FileState.REJECTED:
            case FileState.CANCELLED:
            default:
                return 'done';
        }
    }

    /**
     * Get file info as JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            connId: this.connId,
            fileId: this.fileId,
            name: this.name,
            size: this.size,
            mime: this.mime,
            state: this.state,
            direction: this.direction,
            createdAt: this.createdAt,
            completedAt: this.completedAt,
            bytesTransferred: this.bytesTransferred,
            progress: this.getProgress(),
            chunksReceived: this.chunksReceived,
            totalChunks: this.totalChunks
        };
    }

    /**
     * Check if file is in terminal state
     * @returns {boolean}
     */
    isTerminal() {
        return [FileState.COMPLETED, FileState.REJECTED, FileState.FAILED, FileState.CANCELLED]
            .includes(this.state);
    }

    /**
     * Check if file can be transferred (not terminal and not pending)
     * @returns {boolean}
     */
    isTransferable() {
        return [FileState.QUEUED].includes(this.state);
    }

    /**
     * Check if file is currently transferring
     * @returns {boolean}
     */
    isCurrentlyTransferring() {
        return this.state === FileState.TRANSFERRING;
    }
}

/**
 * File Queue Manager
 * Manages FIFO queue of file transfers (ADR-0009)
 */
export class FileQueueManager {
    constructor() {
        this.queue = [];
        this.currentFile = null;
        this.maxQueueSize = 50; // Max files in queue
        this.maxQueueBytes = 500 * 1024 * 1024; // 500MB total queue size limit (ADR-0009)
    }

    /**
     * Get current queue size in bytes
     * @returns {number}
     */
    getQueueSizeBytes() {
        return this.queue.reduce((total, file) => total + (file.size || 0), 0);
    }

    /**
     * Check if queue has space for a new file
     * @param {number} fileSize - Size of file to add
     * @returns {boolean}
     */
    hasSpaceForFile(fileSize) {
        return this.getQueueSizeBytes() + fileSize <= this.maxQueueBytes;
    }

    /**
     * Add a file to the queue
     * @param {FileTransfer} file - File to add
     * @returns {boolean} True if added successfully
     */
    addFile(file) {
        if (this.queue.length >= this.maxQueueSize) {
            return false; // Queue full (file count limit)
        }
        
        if (!this.hasSpaceForFile(file.size)) {
            return false; // Queue full (size limit) - ADR-0009
        }
        
        this.queue.push(file);
        return true;
    }

    /**
     * Check if adding a file would exceed queue limits
     * @param {number} fileSize - Size of file to add
     * @returns {{canAdd: boolean, reason?: string}}
     */
    checkCanAddFile(fileSize) {
        if (this.queue.length >= this.maxQueueSize) {
            return { canAdd: false, reason: 'QUEUE_FILE_LIMIT' };
        }
        
        if (!this.hasSpaceForFile(fileSize)) {
            return { canAdd: false, reason: 'QUEUE_SIZE_LIMIT' };
        }
        
        return { canAdd: true };
    }

    /**
     * Get the next file to transfer
     * @returns {FileTransfer|null} Next file or null if none
     */
    getNextFile() {
        if (this.queue.length > 0) {
            return this.queue[0];
        }
        return null;
    }

    /**
     * Start transferring the next file
     * @returns {FileTransfer|null} File being transferred or null
     */
    startNextFile() {
        if (this.currentFile) {
            // Already transferring
            return this.currentFile;
        }

        // Skip files that are already in a terminal state (e.g., a file that
        // was added to the queue while already complete). Without this guard
        // we'd re-send a completed file and block the real next file.
        while (this.queue.length > 0) {
            const candidate = this.queue.shift();
            if (!candidate.isTerminal()) {
                this.currentFile = candidate;
                this.currentFile.transitionState(FileState.TRANSFERRING);
                return this.currentFile;
            }
        }

        return null;
    }

    /**
     * Complete the current file and start the next one
     * @param {FileTransfer} file - The file that completed
     */
    completeCurrentFile(file) {
        if (this.currentFile && this.currentFile.fileId === file.fileId) {
            this.currentFile.transitionState(FileState.COMPLETED);
            this.currentFile = null;
            // Next file will start automatically when transfer is initiated
        }
    }

    /**
     * Fail the current file
     * @param {FileTransfer} file - The file that failed
     */
    failCurrentFile(file) {
        if (this.currentFile && this.currentFile.fileId === file.fileId) {
            this.currentFile.transitionState(FileState.FAILED);
            this.currentFile = null;
            // Start next file
            this.startNextFile();
        }
    }

    /**
     * Cancel a pending or queued file
     * @param {string} fileId - File ID to cancel
     * @returns {boolean} True if file was found and cancelled
     */
    cancelFile(fileId) {
        // Check queue
        const queueIndex = this.queue.findIndex(f => f.fileId === fileId);
        if (queueIndex !== -1) {
            this.queue[queueIndex].transitionState(FileState.CANCELLED);
            this.queue.splice(queueIndex, 1);
            return true;
        }
        
        // Check current file
        if (this.currentFile && this.currentFile.fileId === fileId) {
            // Cannot cancel a file that's already transferring - must fail it
            this.currentFile.transitionState(FileState.CANCELLED);
            this.currentFile = null;
            return true;
        }
        
        return false;
    }

    /**
     * Reject a pending file (called by receiver)
     * @param {string} fileId - File ID to reject
     * @returns {boolean} True if file was found and rejected
     */
    rejectFile(fileId) {
        // Find in queue or pending
        const queueIndex = this.queue.findIndex(f => f.fileId === fileId && f.state === FileState.PENDING);
        if (queueIndex !== -1) {
            this.queue[queueIndex].transitionState(FileState.REJECTED);
            this.queue.splice(queueIndex, 1);
            return true;
        }
        
        return false;
    }

    /**
     * Accept a pending file and add to queue
     * @param {string} fileId - File ID to accept
     * @returns {FileTransfer|null} Accepted file or null
     */
    acceptFile(fileId) {
        const queueIndex = this.queue.findIndex(f => f.fileId === fileId && f.state === FileState.PENDING);
        if (queueIndex !== -1) {
            const file = this.queue[queueIndex];
            
            // Transition based on whether there's a current transfer
            if (this.currentFile) {
                file.transitionState(FileState.QUEUED);
            } else {
                // Start immediately
                this.currentFile = this.queue.splice(queueIndex, 1)[0];
                this.currentFile.transitionState(FileState.TRANSFERRING);
            }
            
            return this.currentFile || file;
        }
        
        return null;
    }

    /**
     * Get all files
     * @returns {Array<FileTransfer>}
     */
    getAllFiles() {
        return [...this.queue, this.currentFile].filter(f => f !== null);
    }

    /**
     * Get files by state
     * @param {string} state - State to filter by
     * @returns {Array<FileTransfer>}
     */
    getFilesByState(state) {
        return this.getAllFiles().filter(f => f.state === state);
    }

    /**
     * Get file by ID
     * @param {string} fileId - File ID
     * @returns {FileTransfer|null}
     */
    getFile(fileId) {
        const allFiles = this.getAllFiles();
        return allFiles.find(f => f.fileId === fileId) || null;
    }

    /**
     * Clear all files (on connection close)
     */
    clear() {
        this.queue = [];
        this.currentFile = null;
    }

    /**
     * Get queue size (number of files)
     * @returns {number}
     */
    getQueueSize() {
        return this.queue.length;
    }

    /**
     * Get queue size in bytes
     * @returns {number}
     */
    getQueueSizeInBytes() {
        return this.getQueueSizeBytes();
    }

    /**
     * Get remaining queue capacity in bytes
     * @returns {number}
     */
    getRemainingCapacity() {
        return this.maxQueueBytes - this.getQueueSizeBytes();
    }

    /**
     * Get queue info
     * @returns {Object}
     */
    getQueueInfo() {
        return {
            fileCount: this.getQueueSize(),
            totalBytes: this.getQueueSizeBytes(),
            maxBytes: this.maxQueueBytes,
            remainingBytes: this.getRemainingCapacity(),
            hasCurrentFile: this.hasCurrentFile()
        };
    }

    /**
     * Check if queue is empty
     * @returns {boolean}
     */
    isEmpty() {
        return this.queue.length === 0 && this.currentFile === null;
    }

    /**
     * Check if a file is currently transferring
     * @returns {boolean}
     */
    hasCurrentFile() {
        return this.currentFile !== null;
    }
}
