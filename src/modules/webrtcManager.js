/**
 * WebRTC Manager
 * Manages WebRTC peer connection lifecycle and data channels
 * Handles offer/answer exchange and ICE candidate gathering
 * (ADR-0002, ADR-0007, ADR-0010, ADR-0031, ADR-0037)
 */

import { v4 as uuidv4 } from 'uuid';
import { errorHandler } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';


// Generate a simple secret for connection verification
function generateSecret(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Will be set by main.js to avoid circular dependency
let fileTransferManager = null;

// WebSocket client reference - will be set by main.js
let websocketClient = null;

export const setFileTransferManager = (manager) => {
    fileTransferManager = manager;
};

/**
 * Set WebSocket client reference for WebRTC signaling
 * @param {WebSocketClient} client - WebSocket client instance
 */
export const setWebSocketClient = (client) => {
    websocketClient = client;
};

// Connection state constants (ADR-0010)
export const ConnectionState = {
    NEW: 'NEW',           // Initial state after device discovery
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
    CHUNK_ACK: 'CHUNK_ACK',
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
        this.websocketHandlers = {
            offer: null,
            answer: null,
            iceCandidate: null
        };
        this.currentTargetDeviceId = null;
        this.processingOffer = false; // Flag to prevent re-entrancy
        this.processingAnswer = false; // Flag to prevent re-entrancy
    }

    /**
     * Generate a deterministic connection ID from device IDs
     * Both devices in a connection will generate the same ID
     * @param {string} deviceId1 - First device ID
     * @param {string} deviceId2 - Second device ID
     * @returns {string} Deterministic connection ID
     */
    generateConnectionId(deviceId1, deviceId2) {
        // Sort device IDs to ensure both devices generate the same connId
        const sorted = [deviceId1, deviceId2].sort();
        return sorted.join('-');
    }

    /**
     * Generate a random connection ID (fallback)
     * @returns {string} UUID v4
     */
    generateRandomConnectionId() {
        return uuidv4();
    }

    /**
     * Generate a new secret for connection verification
     * @param {number} length - Secret length (default: 16)
     * @returns {string}
     */
    generateSecret(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
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
    
    
    // ============================================

    // ============================================
    // WebSocket Signaling Methods (ADR-0031, ADR-0037)
    // ============================================

    /**
     * Start WebRTC connection with a specific device using WebSocket signaling
     * This is the initiator path for WebSocket-based connection
     * @param {string} targetDeviceId - Device ID to connect to
     * @param {string} connId - Optional pre-generated connection ID (from answerer)
     * @param {string} secret - Optional pre-generated secret (from answerer)
     * @returns {Promise<void>}
     */
    async startWebSocketConnection(targetDeviceId, connId = null, secret = null) {
        if (!websocketClient) {
            throw new Error('WebSocket client not initialized');
        }

        if (this.state !== ConnectionState.CLOSED) {
            // Close existing connection first (ADR-0017: 1:1 connections only)
            await this.close();
        }

        console.log('Starting WebSocket connection to:', targetDeviceId, 'with connId:', connId || 'deterministic');
        
        // Use provided connId/secret if available, otherwise generate deterministic from device IDs
        if (connId) {
            this.connectionId = connId;
            this.secret = secret || this.generateSecret(16);
        } else {
            const myDeviceId = this.getDeviceId();
            this.connectionId = this.generateConnectionId(myDeviceId, targetDeviceId);
            this.secret = this.generateSecret(16);
        }

        // Create peer connection
        this.peerConnection = this.createPeerConnection();
        
        // Setup event handlers for WebSocket signaling (trickle ICE per ADR-0037)
        this.setupPeerConnectionHandlers();
        this.setupWebSocketIceCandidateHandler(targetDeviceId);
        this.setupWebSocketSignalingHandlers(targetDeviceId);

        // Create data channels (offerer creates channels)
        await this.setupDataChannels(true);

        // Create offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // Send offer via WebSocket immediately (trickle ICE will send candidates later)
        await this.sendOfferViaWebSocket(targetDeviceId, offer.sdp);

        // Save connection to storage FIRST (before transitioning state)
        try {
            await storageManager.saveConnection({
                connId: this.connectionId,
                secret: this.secret,
                state: ConnectionState.CONNECTING
            });
        } catch (error) {
            console.error('Failed to save connection:', error);
            errorHandler.handleStorageError(error, { operation: 'startWebSocketConnection' });
        }

        // Transition to CONNECTING state
        await this.transitionState(ConnectionState.CONNECTING);
    }

    /**
     * Cleanup WebSocket signaling event handlers
     */
    cleanupWebSocketSignalingHandlers() {
        if (!websocketClient) return;
        
        // Remove offer handler
        if (this.websocketHandlers.offer) {
            websocketClient.off('offer', this.websocketHandlers.offer);
            this.websocketHandlers.offer = null;
        }
        
        // Remove answer handler
        if (this.websocketHandlers.answer) {
            websocketClient.off('answer', this.websocketHandlers.answer);
            this.websocketHandlers.answer = null;
        }
        
        // Remove ICE candidate handler
        if (this.websocketHandlers.iceCandidate) {
            websocketClient.off('ice-candidate', this.websocketHandlers.iceCandidate);
            this.websocketHandlers.iceCandidate = null;
        }
        
        this.currentTargetDeviceId = null;
    }

    /**
     * Get the current device ID from websocketClient
     * @returns {string|null} Device ID or null
     */
    getDeviceId() {
        return websocketClient ? websocketClient.getDeviceId() : null;
    }

    /**
     * Setup WebSocket signaling event handlers
     * @param {string} targetDeviceId - Device ID we're connecting to
     */
    setupWebSocketSignalingHandlers(targetDeviceId) {
        if (!websocketClient) return;

        // Cleanup any existing handlers first
        this.cleanupWebSocketSignalingHandlers();
        
        this.currentTargetDeviceId = targetDeviceId;
        const myDeviceId = this.getDeviceId();

        // Handle incoming offer
        this.websocketHandlers.offer = async (data) => {
            // Check both from and to fields to ensure message is for this connection
            if (data.from !== targetDeviceId || (data.to && data.to !== myDeviceId)) {
                console.log('Ignoring offer - not for current connection:', data.from, '->', data.to, 'expected:', targetDeviceId, '->', myDeviceId);
                return;
            }
            
            console.log('Received offer via WebSocket from:', data.from, 'with connId:', data.connId);
            await this.handleIncomingOffer(data.from, data.sdp, data.connId, data.secret);
        };
        websocketClient.on('offer', this.websocketHandlers.offer);

        // Handle incoming answer
        this.websocketHandlers.answer = async (data) => {
            // Check both from and to fields
            if (data.from !== targetDeviceId || (data.to && data.to !== myDeviceId)) {
                console.log('Ignoring answer - not for current connection:', data.from, '->', data.to);
                return;
            }
            
            console.log('Received answer via WebSocket from:', data.from);
            await this.handleIncomingAnswer(data.from, data.sdp);
        };
        websocketClient.on('answer', this.websocketHandlers.answer);

        // Handle incoming ICE candidate (trickle ICE)
        this.websocketHandlers.iceCandidate = async (data) => {
            // Check both from and to fields
            if (data.from !== targetDeviceId || (data.to && data.to !== myDeviceId)) {
                console.log('Ignoring ICE candidate - not for current connection:', data.from, '->', data.to);
                return;
            }
            
            console.log('Received ICE candidate via WebSocket from:', data.from);
            await this.handleIncomingIceCandidate(data);
        };
        websocketClient.on('ice-candidate', this.websocketHandlers.iceCandidate);
    }

    /**
     * Send SDP offer via WebSocket
     * @param {string} targetDeviceId - Target device ID
     * @param {string} sdp - SDP offer string
     */
    async sendOfferViaWebSocket(targetDeviceId, sdp) {
        if (!websocketClient) {
            throw new Error('WebSocket client not initialized');
        }

        const message = {
            type: 'offer',
            from: this.getDeviceId(),
            to: targetDeviceId,
            sdp: sdp,
            connId: this.connectionId,
            secret: this.secret
        };

        const success = websocketClient.send(message);
        if (!success) {
            console.warn('Failed to send offer via WebSocket (not connected)');
            throw new Error('WebSocket not connected');
        }
        
        console.log('Sent SDP offer via WebSocket to:', targetDeviceId);
    }

    /**
     * Send SDP answer via WebSocket
     * @param {string} targetDeviceId - Target device ID
     * @param {string} sdp - SDP answer string
     */
    async sendAnswerViaWebSocket(targetDeviceId, sdp) {
        if (!websocketClient) {
            throw new Error('WebSocket client not initialized');
        }

        const message = {
            type: 'answer',
            from: this.getDeviceId(),
            to: targetDeviceId,
            sdp: sdp,
            connId: this.connectionId,
            secret: this.secret
        };

        const success = websocketClient.send(message);
        if (!success) {
            console.warn('Failed to send answer via WebSocket (not connected)');
            throw new Error('WebSocket not connected');
        }
        
        console.log('Sent SDP answer via WebSocket to:', targetDeviceId);
    }

    /**
     * Send ICE candidate via WebSocket (trickle ICE per ADR-0037)
     * @param {string} targetDeviceId - Target device ID
     * @param {Object} candidate - ICE candidate object
     */
    async sendIceCandidateViaWebSocket(targetDeviceId, candidate) {
        if (!websocketClient) {
            console.warn('WebSocket client not initialized, cannot send ICE candidate');
            return;
        }

        const message = {
            type: 'ice-candidate',
            from: this.getDeviceId(),
            to: targetDeviceId,
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            connId: this.connectionId
        };

        const success = websocketClient.send(message);
        if (!success) {
            console.warn('Failed to send ICE candidate via WebSocket (not connected)');
            // Queue candidate for later
            this.pendingIceCandidates.push(candidate);
        } else {
            console.log('Sent ICE candidate via WebSocket to:', targetDeviceId);
        }
    }

    /**
     * Handle incoming SDP offer via WebSocket
     * This is the answerer path for WebSocket-based connection
     * @param {string} fromDeviceId - Device ID that sent the offer
     * @param {string} sdp - SDP offer string
     * @param {string} connId - Connection ID from offerer (optional, falls back to generating new one)
     * @param {string} secret - Connection secret from offerer (optional, falls back to generating new one)
     */
    async handleIncomingOffer(fromDeviceId, sdp, connId = null, secret = null) {
        console.log('Handling incoming offer from:', fromDeviceId);

        // Guard: prevent re-entrancy (duplicate offer messages)
        if (this.processingOffer) {
            console.warn('Ignoring incoming offer - already processing an offer');
            return;
        }
        this.processingOffer = true;

        try {
            // Guard: prevent handling multiple offers simultaneously
            // Only allow if we're in CLOSED state (not already connecting/connected)
            if (this.state !== ConnectionState.CLOSED && this.state !== ConnectionState.NEW) {
                console.warn('Ignoring incoming offer - already in connection state:', this.state);
                return;
            }

            // Guard: prevent creating multiple peer connections
            if (this.peerConnection) {
                console.warn('Ignoring incoming offer - peer connection already exists');
                return;
            }

            // Generate deterministic connId from device IDs - both devices will compute the same ID
            const myDeviceId = this.getDeviceId();
            this.connectionId = this.generateConnectionId(myDeviceId, fromDeviceId);
            this.secret = secret || this.generateSecret(16);
            
            console.log('Generated deterministic connection ID from offer:', this.connectionId, 'devices:', myDeviceId, '<->', fromDeviceId);

            // Create peer connection
            this.peerConnection = this.createPeerConnection();
            this.setupPeerConnectionHandlers();
            this.setupWebSocketIceCandidateHandler(fromDeviceId);

            // Set remote description
            await this.peerConnection.setRemoteDescription({
                type: 'offer',
                sdp: sdp
            });

            // Answerer only listens for incoming data channels
            await this.setupDataChannels(false);

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer via WebSocket immediately
            await this.sendAnswerViaWebSocket(fromDeviceId, answer.sdp);

            // Save connection to storage FIRST (before transitioning state)
            try {
                await storageManager.saveConnection({
                    connId: this.connectionId,
                    secret: this.secret,
                    state: ConnectionState.CONNECTING
                });
            } catch (error) {
                console.error('Failed to save connection:', error);
                errorHandler.handleStorageError(error, { operation: 'handleIncomingOffer' });
            }

            // Transition to CONNECTING state
            await this.transitionState(ConnectionState.CONNECTING);
        } finally {
            this.processingOffer = false;
        }
    }

    /**
     * Handle incoming SDP answer via WebSocket
     * @param {string} fromDeviceId - Device ID that sent the answer
     * @param {string} sdp - SDP answer string
     */
    async handleIncomingAnswer(fromDeviceId, sdp) {
        console.log('Handling incoming answer from:', fromDeviceId);

        // Guard: prevent re-entrancy (duplicate answer messages)
        if (this.processingAnswer) {
            console.warn('Ignoring incoming answer - already processing an answer');
            return;
        }
        this.processingAnswer = true;

        try {
            // Guard: prevent processing answer without a peer connection
            if (!this.peerConnection) {
                console.warn('Ignoring incoming answer - no peer connection exists');
                return;
            }

            // Guard: prevent processing answer in wrong state
            // Should be in CONNECTING state (offer sent, waiting for answer)
            if (this.state !== ConnectionState.CONNECTING) {
                console.warn('Ignoring incoming answer - not in CONNECTING state:', this.state);
                return;
            }

            // Set remote description
            try {
                await this.peerConnection.setRemoteDescription({
                    type: 'answer',
                    sdp: sdp
                });
                console.log('Successfully set remote description (answer) from:', fromDeviceId);
            } catch (error) {
                console.error('Failed to set remote description:', error);
                errorHandler.handleWebRTCError(error, { operation: 'handleIncomingAnswer' });
                throw error;
            }

            // Connection is already in CONNECTING state from startWebSocketConnection
            // The connection will transition to CONNECTED when data channels open
        } finally {
            this.processingAnswer = false;
        }
    }

    /**
     * Handle incoming ICE candidate via WebSocket
     * @param {Object} data - ICE candidate data
     */
    async handleIncomingIceCandidate(data) {
        if (!this.peerConnection) {
            console.warn('Peer connection not initialized, cannot add ICE candidate');
            return;
        }

        try {
            await this.peerConnection.addIceCandidate({
                candidate: data.candidate,
                sdpMid: data.sdpMid,
                sdpMLineIndex: data.sdpMLineIndex
            });
            console.log('Added ICE candidate from:', data.from);
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    /**
     * Modified ICE candidate handler for WebSocket signaling (trickle ICE per ADR-0037)
     * Sends ICE candidates as they are gathered instead of waiting for completion
     */
    setupWebSocketIceCandidateHandler(targetDeviceId) {
        if (!this.peerConnection) return;

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Send ICE candidate immediately via WebSocket (trickle ICE)
                this.sendIceCandidateViaWebSocket(targetDeviceId, {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };
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
                    // Peer-disconnect lifecycle event. The state transition
                    // to FAILED is the signal the rest of the app uses; we
                    // intentionally do not raise a user-facing error here,
                    // because the other device's UI is the same (it just
                    // reloaded) and there is nothing the user can do but
                    // start a new connection.
                    this.transitionState(ConnectionState.FAILED);
                    break;
                case 'closed':
                case 'disconnected':
                    this.transitionState(ConnectionState.CLOSED);
                    break;
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            if (this.peerConnection.iceConnectionState === 'failed') {
                // See the onconnectionstatechange 'failed' case above for
                // why we don't escalate this to a user-facing error.
                this.transitionState(ConnectionState.FAILED);
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
     * answer is processed), and the answerer typically sees the peer
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
        
        // Reset processing flags
        this.processingOffer = false;
        this.processingAnswer = false;
        
        // Clean up WebSocket signaling handlers
        this.cleanupWebSocketSignalingHandlers();
        
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
