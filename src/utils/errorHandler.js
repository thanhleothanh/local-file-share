/**
 * Error Handler Module
 * Centralized error handling and recovery (ISSUE-012, ADR-0006)
 */

import { webrtcManager } from '@modules/webrtcManager.js';
import { fileTransferManager } from '@modules/fileTransfer.js';

/**
 * Error types
 */
export const ErrorType = {
    // WebRTC errors
    WEBRTC_CONNECTION_FAILED: 'WEBRTC_CONNECTION_FAILED',
    WEBRTC_ICE_ERROR: 'WEBRTC_ICE_ERROR',
    WEBRTC_DATA_CHANNEL_ERROR: 'WEBRTC_DATA_CHANNEL_ERROR',
    WEBRTC_SIGNALING_ERROR: 'WEBRTC_SIGNALING_ERROR',
    
    // QR errors
    QR_SCAN_ERROR: 'QR_SCAN_ERROR',
    QR_INVALID_FORMAT: 'QR_INVALID_FORMAT',
    QR_SECRET_MISMATCH: 'QR_SECRET_MISMATCH',
    QR_CONNID_MISMATCH: 'QR_CONNID_MISMATCH',
    QR_COMPRESSION_ERROR: 'QR_COMPRESSION_ERROR',
    
    // File errors
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    FILE_VALIDATION_ERROR: 'FILE_VALIDATION_ERROR',
    FILE_CHUNK_PARSING_ERROR: 'FILE_CHUNK_PARSING_ERROR',
    FILE_REASSEMBLY_ERROR: 'FILE_REASSEMBLY_ERROR',
    FILE_QUEUE_FULL: 'FILE_QUEUE_FULL',
    
    // Storage errors
    STORAGE_ERROR: 'STORAGE_ERROR',
    STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
    STORAGE_CONNECTION_ERROR: 'STORAGE_CONNECTION_ERROR',
    
    // Network errors
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    NETWORK_DISCONNECTED: 'NETWORK_DISCONNECTED',
    
    // Protocol errors
    PROTOCOL_ERROR: 'PROTOCOL_ERROR',
    INVALID_MESSAGE: 'INVALID_MESSAGE',
    
    // General
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
    CRITICAL: 'CRITICAL',   // Requires immediate action, closes connection
    HIGH: 'HIGH',           // Severe error, user must acknowledge
    MEDIUM: 'MEDIUM',       // Error that can be recovered from
    LOW: 'LOW'              // Warning, non-blocking
};

/**
 * Error information structure
 */
export class AppError extends Error {
    constructor(message, type, severity, context = {}) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.severity = severity;
        this.context = context;
        this.timestamp = Date.now();
        this.userMessage = this.getUserMessage();
    }

    getUserMessage() {
        const messages = {
            // WebRTC
            [ErrorType.WEBRTC_CONNECTION_FAILED]: 'Connection failed. Please check your network and try again.',
            [ErrorType.WEBRTC_ICE_ERROR]: 'ICE negotiation failed. Cannot establish direct connection.',
            [ErrorType.WEBRTC_DATA_CHANNEL_ERROR]: 'Data channel error. File transfer cannot continue.',
            [ErrorType.WEBRTC_SIGNALING_ERROR]: 'Signaling error. Connection cannot be established.',
            
            // QR
            [ErrorType.QR_SCAN_ERROR]: 'Failed to scan QR code. Please try again.',
            [ErrorType.QR_INVALID_FORMAT]: 'Invalid QR code format. This is not a valid Local File Share QR code.',
            [ErrorType.QR_SECRET_MISMATCH]: 'Connection secret mismatch. The answer QR does not match the offer QR.',
            [ErrorType.QR_CONNID_MISMATCH]: 'Connection ID mismatch. The answer QR is for a different connection.',
            [ErrorType.QR_COMPRESSION_ERROR]: 'Failed to compress/decompress QR data.',
            
            // File
            [ErrorType.FILE_TOO_LARGE]: 'File is too large. Maximum size is 500MB.',
            [ErrorType.FILE_VALIDATION_ERROR]: 'File validation failed. Please check the file and try again.',
            [ErrorType.FILE_CHUNK_PARSING_ERROR]: 'Failed to parse file chunk. Transfer aborted.',
            [ErrorType.FILE_REASSEMBLY_ERROR]: 'Failed to reassemble file. Transfer aborted.',
            [ErrorType.FILE_QUEUE_FULL]: 'Queue is full. Please wait for current transfers to complete.',
            
            // Storage
            [ErrorType.STORAGE_ERROR]: 'Storage error occurred. Please try again.',
            [ErrorType.STORAGE_QUOTA_EXCEEDED]: 'Storage quota exceeded. Please free up space and try again.',
            [ErrorType.STORAGE_CONNECTION_ERROR]: 'Failed to save connection data.',
            
            // Network
            [ErrorType.NETWORK_TIMEOUT]: 'Connection timed out due to inactivity.',
            [ErrorType.NETWORK_DISCONNECTED]: 'Network disconnected. Please reconnect.',
            
            // Protocol
            [ErrorType.PROTOCOL_ERROR]: 'Protocol error. Connection will be closed.',
            [ErrorType.INVALID_MESSAGE]: 'Invalid message received. Connection will be closed.',
            
            // General
            [ErrorType.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.'
        };

        return messages[this.type] || this.message;
    }

    toJSON() {
        return {
            type: this.type,
            severity: this.severity,
            message: this.message,
            userMessage: this.userMessage,
            context: this.context,
            timestamp: this.timestamp
        };
    }

    static fromError(error, type, severity, context = {}) {
        if (error instanceof AppError) {
            return error;
        }
        return new AppError(
            error.message || String(error),
            type,
            severity,
            context
        );
    }
}

/**
 * Error Handler
 * Centralized error handling for the application
 */
export class ErrorHandler {
    constructor() {
        this.errorListeners = {};
        this.setupGlobalHandlers();
    }

    /**
     * Setup global error handlers
     */
    setupGlobalHandlers() {
        // Uncaught exceptions
        window.addEventListener('error', (event) => {
            this.handleError(
                new AppError(
                    event.message,
                    ErrorType.UNKNOWN_ERROR,
                    ErrorSeverity.HIGH,
                    { filename: event.filename, lineno: event.lineno, colno: event.colno }
                )
            );
        });

        // Uncaught promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(
                new AppError(
                    event.reason?.message || String(event.reason),
                    ErrorType.UNKNOWN_ERROR,
                    ErrorSeverity.HIGH,
                    { reason: event.reason }
                )
            );
        });

        // Beforeunload - warn about active transfers
        window.addEventListener('beforeunload', (event) => {
            if (webrtcManager.isConnected()) {
                event.preventDefault();
                event.returnValue = 'You have an active connection. Closing this tab will end the connection.';
                return event.returnValue;
            }
        });
    }

    /**
     * Handle an error
     * @param {AppError|Error} error - The error to handle
     */
    handleError(error) {
        const appError = error instanceof AppError ? error : 
            new AppError(error.message || String(error), ErrorType.UNKNOWN_ERROR, ErrorSeverity.MEDIUM);

        console.error(`[${appError.type}] ${appError.message}`, {
            severity: appError.severity,
            context: appError.context,
            stack: error.stack
        });

        // Emit error event
        this.emit('error', appError);

        // Handle based on severity
        switch (appError.severity) {
            case ErrorSeverity.CRITICAL:
                // Close connection and notify user
                webrtcManager.close();
                this.showUserError(appError);
                break;
                
            case ErrorSeverity.HIGH:
                // Show error to user, may need action
                this.showUserError(appError);
                break;
                
            case ErrorSeverity.MEDIUM:
                // Log and optionally show to user
                this.showUserError(appError);
                break;
                
            case ErrorSeverity.LOW:
                // Just log
                break;
        }
    }

    /**
     * Handle a WebRTC error
     * @param {Error} error - WebRTC error
     * @param {string} context - Additional context
     */
    handleWebRTCError(error, context = {}) {
        let errorType = ErrorType.WEBRTC_CONNECTION_FAILED;
        let severity = ErrorSeverity.CRITICAL;

        if (error.message.includes('ICE')) {
            errorType = ErrorType.WEBRTC_ICE_ERROR;
        } else if (error.message.includes('DataChannel')) {
            errorType = ErrorType.WEBRTC_DATA_CHANNEL_ERROR;
        } else if (error.message.includes('signaling')) {
            errorType = ErrorType.WEBRTC_SIGNALING_ERROR;
        }

        this.handleError(new AppError(
            error.message,
            errorType,
            severity,
            { ...context, module: 'WebRTC' }
        ));
    }

    /**
     * Handle a QR error
     * @param {Error} error - QR error
     * @param {string} context - Additional context
     */
    handleQRError(error, context = {}) {
        let errorType = ErrorType.QR_SCAN_ERROR;
        let severity = ErrorSeverity.MEDIUM;

        if (error.message.includes('Invalid QR code')) {
            errorType = ErrorType.QR_INVALID_FORMAT;
        } else if (error.message.includes('secret')) {
            errorType = ErrorType.QR_SECRET_MISMATCH;
            severity = ErrorSeverity.CRITICAL;
        } else if (error.message.includes('Connection ID')) {
            errorType = ErrorType.QR_CONNID_MISMATCH;
            severity = ErrorSeverity.CRITICAL;
        } else if (error.message.includes('compress')) {
            errorType = ErrorType.QR_COMPRESSION_ERROR;
        }

        this.handleError(new AppError(
            error.message,
            errorType,
            severity,
            { ...context, module: 'QR' }
        ));
    }

    /**
     * Handle a file error
     * @param {Error} error - File error
     * @param {string} context - Additional context
     */
    handleFileError(error, context = {}) {
        let errorType = ErrorType.FILE_VALIDATION_ERROR;
        let severity = ErrorSeverity.MEDIUM;

        if (error.message.includes('FILE_TOO_LARGE')) {
            errorType = ErrorType.FILE_TOO_LARGE;
        } else if (error.message.includes('chunk')) {
            errorType = ErrorType.FILE_CHUNK_PARSING_ERROR;
            severity = ErrorSeverity.CRITICAL;
        } else if (error.message.includes('reassemble')) {
            errorType = ErrorType.FILE_REASSEMBLY_ERROR;
            severity = ErrorSeverity.CRITICAL;
        } else if (error.message.includes('queue full')) {
            errorType = ErrorType.FILE_QUEUE_FULL;
        }

        this.handleError(new AppError(
            error.message,
            errorType,
            severity,
            { ...context, module: 'FileTransfer' }
        ));
    }

    /**
     * Handle a storage error
     * @param {Error} error - Storage error
     * @param {string} context - Additional context
     */
    handleStorageError(error, context = {}) {
        let errorType = ErrorType.STORAGE_ERROR;
        let severity = ErrorSeverity.CRITICAL; // Storage errors are critical (fail-fast)

        if (error.message.includes('quota')) {
            errorType = ErrorType.STORAGE_QUOTA_EXCEEDED;
        } else if (error.message.includes('connection')) {
            errorType = ErrorType.STORAGE_CONNECTION_ERROR;
        }

        this.handleError(new AppError(
            error.message,
            errorType,
            severity,
            { ...context, module: 'Storage' }
        ));
    }

    /**
     * Handle a protocol error
     * @param {Error} error - Protocol error
     * @param {string} context - Additional context
     */
    handleProtocolError(error, context = {}) {
        let errorType = ErrorType.PROTOCOL_ERROR;
        let severity = ErrorSeverity.CRITICAL; // Protocol errors are critical (fail-fast)

        if (error.message.includes('Invalid FILE_OFFER')) {
            errorType = ErrorType.INVALID_MESSAGE;
        }

        this.handleError(new AppError(
            error.message,
            errorType,
            severity,
            { ...context, module: 'Protocol' }
        ));
    }

    /**
     * Handle a network timeout
     * @param {string} context - Additional context
     */
    handleTimeout(context = {}) {
        this.handleError(new AppError(
            'Connection timed out',
            ErrorType.NETWORK_TIMEOUT,
            ErrorSeverity.HIGH,
            { ...context, module: 'Network' }
        ));
    }

    /**
     * Show error to user
     * @param {AppError} error - Error to display
     */
    showUserError(error) {
        this.emit('showError', {
            message: error.userMessage,
            type: error.severity === ErrorSeverity.CRITICAL ? 'error' : 'warning',
            error: error.toJSON()
        });
    }

    /**
     * Register an error listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.errorListeners[event]) {
            this.errorListeners[event] = [];
        }
        this.errorListeners[event].push(callback);
    }

    /**
     * Emit an error event
     * @param {string} event - Event name
     * @param {...any} args - Arguments
     */
    emit(event, ...args) {
        if (this.errorListeners[event]) {
            for (const listener of this.errorListeners[event]) {
                listener(...args);
            }
        }
    }
}

// Singleton instance
export const errorHandler = new ErrorHandler();

// Convenience function for throwing critical errors
export function throwCriticalError(message, type, context = {}) {
    throw new AppError(message, type, ErrorSeverity.CRITICAL, context);
}
