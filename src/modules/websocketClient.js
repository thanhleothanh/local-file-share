/**
 * WebSocket Client
 * Manages WebSocket connection to signaling server
 * Handles device registration, message relaying, and auto-reconnect
 * (ADR-0031, ADR-0036, ADR-0039)
 */

import { v4 as uuidv4 } from 'uuid';
import { generate as generateRandomWords } from 'random-words';

// Configuration
const WS_PATH = '/ws';
const DEVICE_NAME_FORMAT = '{adjective} {animal}';
const LOCALSTORAGE_DEVICE_ID_KEY = 'deviceId';
const LOCALSTORAGE_DEVICE_NAME_KEY = 'deviceName';

// Exponential backoff configuration (ADR-0039)
const RECONNECT_DELAYS = [0, 1000, 2000, 4000, 8000, 16000, 32000]; // 0, 1s, 2s, 4s, 8s, 16s, 32s
const MAX_RECONNECT_DELAY = 32000; // 32 seconds cap

/**
 * WebSocket Client class
 * Manages connection to signaling server and message handling
 */
export class WebSocketClient {
  constructor() {
    this.ws = null;
    this.deviceId = null;
    this.deviceName = null;
    this.isConnected = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.messageQueue = [];
    this.eventListeners = {};
    
    // Load persisted device info
    this.loadDeviceInfo();
  }

  /**
   * Load device ID and name from localStorage
   */
  loadDeviceInfo() {
    this.deviceId = localStorage.getItem(LOCALSTORAGE_DEVICE_ID_KEY);
    this.deviceName = localStorage.getItem(LOCALSTORAGE_DEVICE_NAME_KEY);

    // Generate new device info if not present
    if (!this.deviceId) {
      this.deviceId = uuidv4();
      localStorage.setItem(LOCALSTORAGE_DEVICE_ID_KEY, this.deviceId);
    }

    if (!this.deviceName) {
      this.deviceName = this.generateDeviceName();
      localStorage.setItem(LOCALSTORAGE_DEVICE_NAME_KEY, this.deviceName);
    }

    console.log('Loaded device info:', { deviceId: this.deviceId, deviceName: this.deviceName });
  }

  /**
   * Generate a descriptive device name using random-words
   * Format: {adjective} {animal}
   * @returns {string} Generated device name
   */
  generateDeviceName() {
    try {
      // Generate adjective + animal combination
      // random-words generates random words from English dictionary
      const words = generateRandomWords({ exactly: 2, wordsPerString: 1 });
      
      // Capitalize both words
      const adjective = words[0].charAt(0).toUpperCase() + words[0].slice(1);
      const animal = words[1].charAt(0).toUpperCase() + words[1].slice(1);
      
      return `${adjective} ${animal}`;
    } catch (error) {
      console.error('Error generating random device name:', error);
      // Fallback to UUID-based name
      return `Device-${this.deviceId.slice(0, 8)}`;
    }
  }

  /**
   * Get WebSocket URL based on current host
   * @returns {string} WebSocket URL
   */
  getWebSocketUrl() {
    // In development, Vite proxies /ws to localhost:3001
    // In production, Express serves both HTTP and WS on same port
    const host = window.location.host;
    return `ws://${host}${WS_PATH}`;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.isConnected) {
      console.log('Already connected to WebSocket');
      return;
    }

    const wsUrl = this.getWebSocketUrl();
    console.log(`Connecting to WebSocket server at ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.ws.onopen = () => {
      console.log('WebSocket connection opened');
      this.isConnected = true;
      this.reconnectAttempt = 0;

      // Send registration message
      this.sendRegister();

      // Flush message queue
      this.flushMessageQueue();

      // Emit connected event
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received WebSocket message:', message.type, message);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`WebSocket connection closed: code=${event.code}, reason=${event.reason}`);
      this.isConnected = false;
      this.emit('disconnected', { code: event.code, reason: event.reason });
      
      // Schedule reconnect with exponential backoff
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };
  }

  /**
   * Send registration message to server
   */
  sendRegister() {
    if (!this.isConnected || !this.ws) {
      console.warn('Cannot send register: not connected');
      return;
    }

    const message = {
      type: 'register',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
    };

    try {
      this.ws.send(JSON.stringify(message));
      console.log('Sent register message:', message);
    } catch (error) {
      console.error('Error sending register message:', error);
    }
  }

  /**
   * Handle incoming messages
   * @param {Object} message - Parsed WebSocket message
   */
  handleMessage(message) {
    switch (message.type) {
      case 'device-list':
        this.emit('device-list', message.devices);
        break;

      case 'device-disconnected':
        this.emit('device-disconnected', message.deviceId);
        break;

      case 'connect-request':
        this.emit('connect-request', {
          fromDeviceId: message.fromDeviceId,
          fromDeviceName: message.fromDeviceName,
        });
        break;

      case 'connect-accepted':
        this.emit('connect-accepted', {
          fromDeviceId: message.fromDeviceId,
          fromDeviceName: message.fromDeviceName,
        });
        break;

      case 'connect-rejected':
        this.emit('connect-rejected', {
          fromDeviceId: message.fromDeviceId,
          fromDeviceName: message.fromDeviceName,
          reason: message.reason,
        });
        break;

      case 'offer':
        this.emit('offer', {
          from: message.from,
          to: message.to,
          sdp: message.sdp,
        });
        break;

      case 'answer':
        this.emit('answer', {
          from: message.from,
          to: message.to,
          sdp: message.sdp,
        });
        break;

      case 'ice-candidate':
        this.emit('ice-candidate', {
          from: message.from,
          to: message.to,
          candidate: message.candidate,
          sdpMid: message.sdpMid,
          sdpMLineIndex: message.sdpMLineIndex,
        });
        break;

      case 'pong':
        // Response to ping, no action needed
        break;

      default:
        console.warn('Unknown message type:', message.type);
        this.emit('unknown-message', message);
    }
  }

  /**
   * Send a message via WebSocket
   * @param {Object} message - Message to send
   */
  send(message) {
    if (!this.isConnected || !this.ws) {
      console.log('Queueing message (not connected):', message.type);
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Send a targeted message to a specific device
   * @param {string} toDeviceId - Target device ID
   * @param {string} type - Message type
   * @param {Object} data - Message data
   */
  sendToDevice(toDeviceId, type, data = {}) {
    return this.send({
      type,
      to: toDeviceId,
      ...data,
    });
  }

  /**
   * Flush message queue when connection is established
   */
  flushMessageQueue() {
    if (!this.isConnected) return;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      try {
        this.ws.send(JSON.stringify(message));
        console.log('Flushed queued message:', message.type);
      } catch (error) {
        console.error('Error flushing message:', error);
        // Put it back at the front of the queue
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    // Cancel any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Calculate delay with exponential backoff
    let delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    
    // Cap at 32 seconds
    delay = Math.min(delay, MAX_RECONNECT_DELAY);

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempt + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (!this.ws) return;

    // Cancel reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close connection
    try {
      this.ws.close(1000, 'Normal closure');
    } catch (error) {
      console.error('Error closing WebSocket:', error);
    }

    this.isConnected = false;
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
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   * @param {...any} args - Arguments to pass to listeners
   */
  emit(event, ...args) {
    if (this.eventListeners[event]) {
      for (const listener of this.eventListeners[event]) {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Get current connection status
   * @returns {boolean}
   */
  getConnected() {
    return this.isConnected;
  }

  /**
   * Get device ID
   * @returns {string}
   */
  getDeviceId() {
    return this.deviceId;
  }

  /**
   * Get device name
   * @returns {string}
   */
  getDeviceName() {
    return this.deviceName;
  }

  /**
   * Ping the server to check connection
   */
  ping() {
    if (this.isConnected && this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch (error) {
        console.error('Error sending ping:', error);
      }
    }
  }
}

// Export singleton instance
export const websocketClient = new WebSocketClient();
