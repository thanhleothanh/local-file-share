/**
 * WebRTC Manager
 * Manages WebRTC peer connection lifecycle and data channels
 * Handles offer/answer exchange and ICE candidate gathering
 * (ADR-0002, ADR-0007, ADR-0010)
 */

import { v4 as uuidv4 } from 'uuid';
import { compressToBase64, decompressFromBase64, generateSecret, validateQRData } from '@utils/qrCompression.js';
import { errorHandler, ErrorType, ErrorSeverity } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';

// Will be set by main.js to avoid circular dependency
let fileTransferManager = null;

export const setFileTransferManager = (manager) => {
    fileTransferManager = manager;
};

// Connection state constants (ADR-0010)
export const ConnectionState = {
    NEW: 'NEW',           // After QR #1 created, before QR #2 scanned
    CONNECTING: 'CONNECTING', // WebRTC handshake in progress
    CONNECTED: 'CONNECTED',   // Data channels open, no active transfer
    TRANSFERRING: 'TRANSFERRING', // File transfer in progress
    FAILED: 'FAILED',       // Connection error occurred
    CLOSED: 'CLOSED'        // Terminal state, connection closed
};

// Message types for control channel
export const MessageType = {
    FILE_OFFER: 'FILE_OFFER',
    FILE_ACCEPT: 'FILE_ACCEPT',
    FILE_REJECT: 'FILE_REJECT',
    FILE_CHUNK: 'FILE_CHUNK',
    TRANSFER_DONE: 'TRANSFER_DONE',
    FILE_RECEIVED: 'FILE_RECEIVED',
    CHUNK_REQUEST_NACK: 'CHUNK_REQUEST_NACK',
    CLOSE: 'CLOSE',
    CANCELLED: 'CANCELLED',
    PING: 'PING',
    PONG: 'PONG'
};

/**
 * WebRTC Manager class
 * Manages a single WebRTC connection with control and data channels
 */
export class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.controlChannel = null;
        this.dataChannel = null;
        this.controlChannelOpen = false;
        this.dataChannelOpen = false;
        this.connectionId = null;
        this.secret = null;
        this.state = ConnectionState.CLOSED;
        this.idleTimer = null;
        this.idleTimeout = 5 * 60 * 1000; // 5 minutes
        this.eventListeners = {};
        this.pendingIceCandidates = [];
        this.initialized = false;
    }

    /**
     * Initialize the manager - load any persisted connection state
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) return;
        
        try {
            await storageManager.ensureInit();
            
            // Try to load a persisted connection
            const connections = await this.loadAllConnections();
            if (connections.length > 0) {
                const conn = connections[0];
                this.connectionId = conn.connId;
                this.secret = conn.secret;
                console.log('Loaded persisted connection:', conn.connId, 'state:', conn.state);
            }
        } catch (error) {
            console.error('Failed to initialize WebRTC manager:', error);
            errorHandler.handleStorageError(error, { operation: 'webrtcManagerInit' });
        }
        
        this.initialized = true;
    }

    /**
     * Load all persisted connections
     * @returns {Promise<Array>}
     */
    async loadAllConnections() {
        try {
            await storageManager.ensureInit();
            const transaction = storageManager.db.transaction('connections', 'readonly');
            const store = transaction.objectStore('connections');
            
            return new Promise((resolve, reject) => {
                const connections = [];
                const request = store.openCursor();
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        connections.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(connections);
                    }
                };
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * Register an event listener
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
     * Emit an event to all listeners
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to listeners
     */
    emit(event, ...args) {
        if (this.eventListeners[event]) {
            for (const listener of this.eventListeners[event]) {
                listener(...args);
            }
        }
    }

    /**
     * Generate a new offer QR code
     * Creates a WebRTC offer and packages it into a QR code payload
     * @returns {Promise<{qrData: Object, connId: string, secret: string}>}
     */
    async generateOfferQR() {
        // Generate connection ID and secret
        this.connectionId = uuidv4();
        this.secret = generateSecret(16);
        
        // Create peer connection
        this.peerConnection = this.createPeerConnection();
        
        // Setup event handlers
        this.setupPeerConnectionHandlers();
        
        // Create data channels
        await this.setupDataChannels();
        
        // Create offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        // Wait for ICE candidates to be gathered
        await this.waitForIceCandidates();
        
        // Get all ICE candidates
        const iceCandidates = this.getAllIceCandidates();
        
        // Compress and encode
        const payload = compressToBase64({
            sdp: offer.sdp,
            ice: iceCandidates
        });
        
        const qrData = {
            type: 'OFFER',
            payload,
            secret: this.secret,
            connId: this.connectionId
        };
        
        // Save connection to storage
        try {
            await storageManager.saveConnection({
                connId: this.connectionId,
                secret: this.secret,
                state: ConnectionState.NEW
            });
        } catch (error) {
            console.error('Failed to save connection:', error);
            errorHandler.handleStorageError(error, { operation: 'generateOfferQR' });
            throw error;
        }
        
        // Transition to NEW state (ADR-0010)
        await this.transitionState(ConnectionState.NEW);
        
        return { qrData, connId: this.connectionId, secret: this.secret };
    }

    /**
     * Process a scanned offer QR code and generate answer QR
     * @param {Object} qrData - Parsed QR code data
     * @returns {Promise<{qrData: Object, connId: string, secret: string}>}
     */
    async processOfferQR(qrData) {
        if (!validateQRData(qrData) || qrData.type !== 'OFFER') {
            throw new Error('Invalid offer QR code');
        }
        
        // Store connection info from offer
        this.connectionId = qrData.connId;
        this.secret = qrData.secret;
        
        // Decompress payload
        const { sdp, ice } = decompressFromBase64(qrData.payload);
        
        // Create peer connection
        this.peerConnection = this.createPeerConnection();
        this.setupPeerConnectionHandlers();
        
        // Set remote description
        await this.peerConnection.setRemoteDescription({
            type: 'offer',
            sdp
        });

        // Add ICE candidates from offer
        for (const candidate of ice) {
            await this.peerConnection.addIceCandidate(candidate);
        }

        // Answerer only listens for incoming data channels
        await this.setupDataChannels(false);
        
        // Create answer
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        // Wait for ICE candidates
        await this.waitForIceCandidates();
        
        // Get all ICE candidates
        const iceCandidates = this.getAllIceCandidates();
        
        // Compress and encode answer
        const payload = compressToBase64({
            sdp: answer.sdp,
            ice: iceCandidates
        });
        
        const answerQRData = {
            type: 'ANSWER',
            payload,
            secret: this.secret,
            connId: this.connectionId
        };
        
        // Save connection to storage
        try {
            await storageManager.saveConnection({
                connId: this.connectionId,
                secret: this.secret,
                state: ConnectionState.CONNECTING
            });
        } catch (error) {
            console.error('Failed to save connection:', error);
            errorHandler.handleStorageError(error, { operation: 'processOfferQR' });
            throw error;
        }
        
        // Transition to CONNECTING state
        await this.transitionState(ConnectionState.CONNECTING);
        
        return { qrData: answerQRData, connId: this.connectionId, secret: this.secret };
    }

    /**
     * Process a scanned answer QR code and complete the connection
     * @param {Object} qrData - Parsed QR code data
     * @returns {Promise<void>}
     */
    async processAnswerQR(qrData) {
        if (!validateQRData(qrData) || qrData.type !== 'ANSWER') {
            throw new Error('Invalid answer QR code');
        }
        
        // Verify connection ID and secret match
        if (qrData.connId !== this.connectionId) {
            throw new Error('Connection ID mismatch: answer does not match offer');
        }
        
        if (qrData.secret !== this.secret) {
            throw new Error('Secret mismatch: answer does not match offer');
        }
        
        // Decompress payload
        const { sdp, ice } = decompressFromBase64(qrData.payload);
        
        // Set remote description
        await this.peerConnection.setRemoteDescription({
            type: 'answer',
            sdp
        });
        
        // Add ICE candidates from answer
        for (const candidate of ice) {
            await this.peerConnection.addIceCandidate(candidate);
        }
        
        // Transition to CONNECTING state - wait for actual connection
        // The connection will transition to CONNECTED when data channels open
        // (handled in setupChannelHandlers)
        await this.transitionState(ConnectionState.CONNECTING);
    }

    /**
     * Create a new RTCPeerConnection
     * @returns {RTCPeerConnection}
     */
    createPeerConnection() {
        const iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        return new RTCPeerConnection(iceServers);
    }

    /**
     * Setup event handlers for peer connection
     */
    setupPeerConnectionHandlers() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.pendingIceCandidates.push({
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            switch (this.peerConnection.connectionState) {
                case 'connected':
                case 'completed':
                    this.tryTransitionToConnected();
                    break;
                case 'failed':
                    this.transitionState(ConnectionState.FAILED);
                    errorHandler.handleWebRTCError(
                        new Error('Peer connection failed'),
                        { connId: this.connectionId, state: this.peerConnection.connectionState }
                    );
                    break;
                case 'closed':
                case 'disconnected':
                    this.transitionState(ConnectionState.CLOSED);
                    break;
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            if (this.peerConnection.iceConnectionState === 'failed') {
                this.transitionState(ConnectionState.FAILED);
                errorHandler.handleWebRTCError(
                    new Error('ICE connection failed'),
                    { connId: this.connectionId, iceState: this.peerConnection.iceConnectionState }
                );
            }
        };
    }

    /**
     * Setup control and data data channels
     * @param {boolean} isOfferer - Whether this side is the offerer (creates channels)
     * @returns {Promise<void>}
     */
    async setupDataChannels(isOfferer = true) {
        this.controlChannelOpen = false;
        this.dataChannelOpen = false;
        if (isOfferer) {
            this.controlChannel = this.peerConnection.createDataChannel('control', {
                ordered: true
            });

            this.dataChannel = this.peerConnection.createDataChannel('data', {
                ordered: true,
                // Wake the sender up when the SCTP send buffer drops below
                // this threshold. Without it, the default of 0 means
                // bufferedamountlow only fires when the buffer is fully
                // drained, which starves throughput. 1 MiB keeps a small
                // pipeline going while preventing overflow on slow links.
                bufferedAmountLowThreshold: 1024 * 1024
            });

            this.setupChannelHandlers(this.controlChannel, 'control');
            this.setupChannelHandlers(this.dataChannel, 'data');
        }

        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            if (channel.label === 'control') {
                this.controlChannel = channel;
                this.setupChannelHandlers(channel, 'control');
            } else if (channel.label === 'data') {
                this.dataChannel = channel;
                this.setupChannelHandlers(channel, 'data');
            } else {
                console.warn('Unknown data channel:', channel.label);
                channel.close();
            }
        };
    }

    /**
     * Setup handlers for a data channel
     * @param {RTCDataChannel} channel - The data channel
     * @param {string} channelName - Channel name ('control' or 'data')
     */
    setupChannelHandlers(channel, channelName) {
        channel.onopen = () => {
            console.log(`${channelName} channel opened`);
            if (channelName === 'control') {
                this.controlChannelOpen = true;
            } else if (channelName === 'data') {
                this.dataChannelOpen = true;
            }
            this.tryTransitionToConnected();
        };

        channel.onclose = () => {
            console.log(`${channelName} channel closed`);
            if (channelName === 'control') {
                this.controlChannel = null;
            } else if (channelName === 'data') {
                this.dataChannel = null;
            }
            if (this.state !== ConnectionState.FAILED && this.state !== ConnectionState.CLOSED) {
                this.transitionState(ConnectionState.CLOSED);
            }
        };

        channel.onerror = (error) => {
            console.error(`${channelName} channel error:`, error);
            if (this.state !== ConnectionState.CLOSED) {
                this.transitionState(ConnectionState.FAILED);
            }
        };

        channel.onmessage = (event) => {
            this.resetIdleTimer();
            if (channelName === 'control') {
                this.handleControlMessage(event.data);
            } else if (channelName === 'data') {
                this.handleDataMessage(event.data);
            }
        };
    }

    /**
     * Transition to CONNECTED once both data channels are open and the
     * peer connection is in 'connected' or 'completed' state.
     * Called from both channel `onopen` and `onconnectionstatechange`,
     * because the offerer may reach the channel-open state while still
     * in NEW (channels are created synchronously and open before the
     * answer QR is processed), and the answerer typically sees the peer
     * connection become 'connected' first.
     */
    tryTransitionToConnected() {
        if (this.state !== ConnectionState.NEW && this.state !== ConnectionState.CONNECTING) {
            return;
        }
        if (!this.controlChannelOpen || !this.dataChannelOpen) {
            return;
        }
        if (!this.peerConnection) {
            return;
        }
        const pcState = this.peerConnection.connectionState;
        if (pcState !== 'connected' && pcState !== 'completed') {
            return;
        }

        this.transitionState(ConnectionState.CONNECTED);
        this.startIdleTimer();
        this.emit('connected');
    }

    /**
     * Handle incoming control messages
     * @param {string|ArrayBuffer} data - Message data
     */
    handleControlMessage(data) {
        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data);
                console.log('Control message received:', message);
                this.emit('controlMessage', message);
            } catch (error) {
                console.error('Failed to parse control message:', error);
            }
        }
    }

    /**
     * Handle incoming data messages (file chunks)
     * @param {string|ArrayBuffer} data - Message data
     */
    handleDataMessage(data) {
        this.emit('dataMessage', data);
    }

    /**
     * Send a control message
     * @param {Object} message - Message object
     */
    sendControlMessage(message) {
        if (this.controlChannel && this.controlChannel.readyState === 'open') {
            this.controlChannel.send(JSON.stringify(message));
            this.resetIdleTimer();
        } else {
            console.warn('Control channel not open, cannot send message');
        }
    }

    /**
     * Send a data message (file chunk). Applies backpressure: if the SCTP
     * send buffer is above bufferedAmountLowThreshold, returns a Promise
     * that resolves when the buffer drains to the threshold. The sender
     * must await this to avoid overflowing the data channel (which closes
     * it on overflow — no error, just a silent close).
     * @param {ArrayBuffer} data - Binary data
     * @returns {Promise<void>} Resolves once the data is queued (and the
     *   buffer has drained past the threshold if it was over).
     */
    sendDataMessage(data) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn('Data channel not open, cannot send message');
            return Promise.resolve();
        }
        this.dataChannel.send(data);
        this.resetIdleTimer();
        return this.waitForDataChannelDrain();
    }

    /**
     * Wait until the data channel's bufferedAmount drops to or below
     * bufferedAmountLowThreshold. No-op if the channel is already drained,
     * missing, or closed. Resolves immediately on the next `bufferedamountlow`
     * event. Includes a safety timeout so a stalled channel can't hang the
     * sender forever.
     * @returns {Promise<void>}
     */
    waitForDataChannelDrain() {
        const channel = this.dataChannel;
        if (!channel || channel.readyState !== 'open') {
            return Promise.resolve();
        }
        const threshold = channel.bufferedAmountLowThreshold || 0;
        if (channel.bufferedAmount <= threshold) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            const onLow = () => {
                if (settled) return;
                settled = true;
                channel.removeEventListener('bufferedamountlow', onLow);
                clearTimeout(safety);
                resolve();
            };
            const safety = setTimeout(() => {
                if (settled) return;
                settled = true;
                channel.removeEventListener('bufferedamountlow', onLow);
                console.warn('Data channel drain timeout — proceeding with send');
                resolve();
            }, 60_000);
            channel.addEventListener('bufferedamountlow', onLow);
        });
    }

    /**
     * Wait for ICE candidates to be gathered
     * @returns {Promise<void>}
     */
    waitForIceCandidates() {
        return new Promise((resolve) => {
            const checkCandidates = () => {
                if (this.peerConnection && 
                    this.peerConnection.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    setTimeout(checkCandidates, 100);
                }
            };
            checkCandidates();
        });
    }

    /**
     * Get all ICE candidates from local description
     * @returns {Array} Array of ICE candidate objects
     */
    getAllIceCandidates() {
        const candidates = [];
        const localDesc = this.peerConnection.localDescription;

        if (localDesc && localDesc.sdp) {
            const lines = localDesc.sdp.split('\n');
            let currentMid = null;
            let currentMLineIndex = -1;

            for (const line of lines) {
                if (line.startsWith('m=')) {
                    currentMLineIndex++;
                } else if (line.startsWith('a=mid:')) {
                    currentMid = line.split(':')[1].trim();
                } else if (line.startsWith('a=candidate:')) {
                    candidates.push({
                        candidate: line.substring(2),
                        sdpMid: currentMid,
                        sdpMLineIndex: currentMLineIndex
                    });
                }
            }
        }

        candidates.push(...this.pendingIceCandidates);
        this.pendingIceCandidates = [];

        return candidates;
    }

    /**
     * Transition to a new connection state
     * @param {string} newState - New state
     */
    async transitionState(newState) {
        const validTransitions = {
            [ConnectionState.NEW]: [ConnectionState.CONNECTING, ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.CONNECTING]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.CONNECTED]: [ConnectionState.TRANSFERRING, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.TRANSFERRING]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.FAILED]: [ConnectionState.CLOSED],
            [ConnectionState.CLOSED]: [ConnectionState.NEW, ConnectionState.CONNECTING]
        };
        
        const allowedTransitions = validTransitions[this.state] || [];
        if (allowedTransitions.includes(newState)) {
            const oldState = this.state;
            this.state = newState;
            console.log(`State transition: ${oldState} -> ${newState}`);
            
            // Persist connection state
            try {
                if (this.connectionId) {
                    await storageManager.updateConnectionState(this.connectionId, newState);
                }
            } catch (error) {
                console.error('Failed to persist connection state:', error);
                errorHandler.handleStorageError(error, { operation: 'transitionState' });
            }
            
            this.emit('stateChange', newState, oldState);
        } else {
            console.warn(`Invalid state transition: ${this.state} -> ${newState}`);
        }
    }

    /**
     * Start the idle timer
     * Timer only counts when in CONNECTED state (ADR-0010)
     */
    startIdleTimer() {
        this.clearIdleTimer();
        this.idleTimer = setTimeout(() => {
            if (this.state === ConnectionState.CONNECTED) {
                console.log('Idle timeout reached, closing connection');
                this.transitionState(ConnectionState.CLOSED);
                this.emit('idleTimeout');
            }
        }, this.idleTimeout);
    }

    /**
     * Reset the idle timer
     */
    resetIdleTimer() {
        if (this.state === ConnectionState.CONNECTED) {
            this.startIdleTimer();
        }
    }

    /**
     * Clear the idle timer
     */
    clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    /**
     * Close the connection
     */
    async close() {
        this.clearIdleTimer();
        await this.transitionState(ConnectionState.CLOSED);
        
        if (this.controlChannel) {
            try {
                this.controlChannel.close();
            } catch (e) {
                // Already closed
            }
            this.controlChannel = null;
        }
        
        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            } catch (e) {
                // Already closed
            }
            this.dataChannel = null;
        }
        
        if (this.peerConnection) {
            try {
                this.peerConnection.close();
            } catch (e) {
                // Already closed
            }
            this.peerConnection = null;
        }
        
        // Clean up connection data from storage
        try {
            if (this.connectionId) {
                await storageManager.deleteConnection(this.connectionId);
            }
        } catch (error) {
            console.error('Failed to clean up connection storage:', error);
            errorHandler.handleStorageError(error, { operation: 'closeConnection' });
        }
        
        // Clear file transfer manager for this connection
        try {
            if (fileTransferManager) {
                await fileTransferManager.clear();
            }
        } catch (error) {
            console.error('Failed to clear file transfer manager:', error);
        }
        
        this.connectionId = null;
        this.secret = null;
        this.emit('closed');
    }

    /**
     * Check if connection is active
     * @returns {boolean}
     */
    isConnected() {
        return this.state === ConnectionState.CONNECTED || 
               this.state === ConnectionState.TRANSFERRING;
    }

    /**
     * Check if connection is in progress
     * @returns {boolean}
     */
    isConnecting() {
        return this.state === ConnectionState.NEW || 
               this.state === ConnectionState.CONNECTING;
    }

    /**
     * Get current connection info
     * @returns {Object}
     */
    getConnectionInfo() {
        return {
            connId: this.connectionId,
            secret: this.secret,
            state: this.state
        };
    }
}

// Singleton instance
export const webrtcManager = new WebRTCManager();
