/**
 * WebSocket Signaling Server
 * Serves static files and relays WebRTC signaling messages between devices
 * (ADR-0031, ADR-0033)
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomInt } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In development mode, server runs on 3001 while Vite runs on 3000
// In production, server runs on 3000 and serves static files
const isDev = process.argv.includes('--dev');
const PORT = isDev ? 3001 : (process.env.PORT || 3000);

// Device list and their WebSocket connections
const devices = new Map(); // deviceId -> { ws, deviceName, registeredAt }

// Create Express app
const app = express();

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', deviceCount: devices.size });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

console.log(`WebSocket server listening on ws://localhost:${PORT}/ws`);

/**
 * Broadcast device list to all connected clients
 */
function broadcastDeviceList() {
  const deviceList = Array.from(devices.entries()).map(([deviceId, info]) => ({
    deviceId,
    deviceName: info.deviceName,
  }));

  const message = {
    type: 'device-list',
    devices: deviceList,
  };

  devices.forEach((info) => {
    if (info.ws.readyState === 1) { // OPEN
      try {
        info.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error broadcasting device list:', error);
      }
    }
  });
}

/**
 * Broadcast device disconnection to all connected clients
 * @param {string} deviceId - The device that disconnected
 */
function broadcastDeviceDisconnected(deviceId) {
  const message = {
    type: 'device-disconnected',
    deviceId,
  };

  devices.forEach((info, id) => {
    if (id !== deviceId && info.ws.readyState === 1) {
      try {
        info.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error broadcasting device disconnect:', error);
      }
    }
  });
}

/**
 * Send a message to a specific device
 * @param {string} targetDeviceId - Target device ID
 * @param {Object} message - Message to send
 */
function sendToDevice(targetDeviceId, message) {
  const targetInfo = devices.get(targetDeviceId);
  if (targetInfo && targetInfo.ws.readyState === 1) {
    try {
      targetInfo.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending to device:', targetDeviceId, error);
      return false;
    }
  }
  return false;
}

/**
 * Relay a message to a target device
 * @param {WebSocket} ws - Sender's WebSocket
 * @param {string} fromDeviceId - Sender's device ID
 * @param {string} toDeviceId - Target device ID
 * @param {Object} message - Message to relay
 */
function relayMessage(ws, fromDeviceId, toDeviceId, message) {
  if (!devices.has(toDeviceId)) {
    console.warn(`Target device ${toDeviceId} not found`);
    return;
  }

  const relayedMessage = {
    ...message,
    from: fromDeviceId,
    to: toDeviceId,
  };

  if (!sendToDevice(toDeviceId, relayedMessage)) {
    console.warn(`Failed to send message to ${toDeviceId}`);
  }
}

/**
 * Broadcast a message to all devices except the sender
 * @param {WebSocket} ws - Sender's WebSocket
 * @param {string} fromDeviceId - Sender's device ID
 * @param {Object} message - Message to broadcast
 */
function broadcastMessage(ws, fromDeviceId, message) {
  const broadcastedMessage = {
    ...message,
    from: fromDeviceId,
  };

  devices.forEach((info, deviceId) => {
    if (deviceId !== fromDeviceId && info.ws.readyState === 1) {
      try {
        info.ws.send(JSON.stringify(broadcastedMessage));
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`New WebSocket connection from ${ip}`);

  let deviceId = null;
  let deviceName = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message.type, 'from', deviceId || ip);

      switch (message.type) {
        case 'register': {
          deviceId = message.deviceId;
          deviceName = message.deviceName;

          // Store device info
          devices.set(deviceId, { ws, deviceName, registeredAt: Date.now() });

          console.log(`Device registered: ${deviceName} (${deviceId})`);

          // Send device list to the new device
          const deviceList = Array.from(devices.entries()).map(([id, info]) => ({
            deviceId: id,
            deviceName: info.deviceName,
          }));
          ws.send(JSON.stringify({
            type: 'device-list',
            devices: deviceList,
          }));

          // Broadcast updated device list to all clients
          broadcastDeviceList();
          break;
        }

        case 'request-connect': {
          // Forward connection request to target device
          relayMessage(ws, deviceId, message.to, {
            type: 'connect-request',
            fromDeviceId: deviceId,
            fromDeviceName: deviceName,
          });
          break;
        }

        case 'accept-connect': {
          // Forward acceptance to requester
          relayMessage(ws, deviceId, message.to, {
            type: 'connect-accepted',
            fromDeviceId: deviceId,
            fromDeviceName: deviceName,
          });
          break;
        }

        case 'reject-connect': {
          // Forward rejection to requester
          relayMessage(ws, deviceId, message.to, {
            type: 'connect-rejected',
            fromDeviceId: deviceId,
            fromDeviceName: deviceName,
            reason: message.reason,
          });
          break;
        }

        case 'offer': {
          // Relay SDP offer
          relayMessage(ws, deviceId, message.to, {
            type: 'offer',
            sdp: message.sdp,
          });
          break;
        }

        case 'answer': {
          // Relay SDP answer
          relayMessage(ws, deviceId, message.to, {
            type: 'answer',
            sdp: message.sdp,
          });
          break;
        }

        case 'ice-candidate': {
          // Relay ICE candidate (trickle ICE per ADR-0037)
          relayMessage(ws, deviceId, message.to, {
            type: 'ice-candidate',
            candidate: message.candidate,
            sdpMid: message.sdpMid,
            sdpMLineIndex: message.sdpMLineIndex,
          });
          break;
        }

        case 'disconnect': {
          // Handle device disconnect
          console.log(`Device disconnected: ${deviceId || ip}`);
          if (deviceId && devices.has(deviceId)) {
            broadcastDeviceDisconnected(deviceId);
            devices.delete(deviceId);
            broadcastDeviceList();
          }
          ws.close();
          break;
        }

        case 'ping': {
          // Respond to ping
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket connection closed from ${ip}`);
    if (deviceId && devices.has(deviceId)) {
      broadcastDeviceDisconnected(deviceId);
      devices.delete(deviceId);
      broadcastDeviceList();
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error from ${ip}:`, error);
    if (deviceId && devices.has(deviceId)) {
      devices.delete(deviceId);
      broadcastDeviceList();
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Close all WebSocket connections
  devices.forEach((info) => {
    if (info.ws.readyState === 1) {
      info.ws.close(1001, 'Server shutting down');
    }
  });
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.emit('SIGTERM');
});

export { app, wss, devices };
