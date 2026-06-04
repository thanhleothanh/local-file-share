/**
 * Main Application Entry Point
 * Orchestrates WebSocket-based device discovery and WebRTC management
 * (ADR-0031: WebSocket Signaling Server)
 */

import {
  webrtcManager,
  ConnectionState,
  setFileTransferManager,
  setWebSocketClient,
} from '@modules/webrtcManager.js';
import { fileTransferManager, FileState } from '@modules/fileTransfer.js';
import { chunkHandler } from '@utils/chunkHandler.js';
import { errorHandler } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';
import { toastManager } from '@utils/toast.js';
import { websocketClient } from '@modules/websocketClient.js';

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const myDeviceType = document.getElementById('myDeviceType');

// Device List UI Elements
const deviceListContainer = document.getElementById('deviceListContainer');
const ownDeviceRow = document.getElementById('ownDeviceRow');
const ownDeviceName = document.getElementById('ownDeviceName');
const ownDeviceId = document.getElementById('ownDeviceId');
const connectionStatus = document.getElementById('connectionStatus');

// Modal Elements
const connectionModalOverlay = document.getElementById('connectionModalOverlay');
const connectionModalTitle = document.getElementById('connectionModalTitle');
const connectionModalMessage = document.getElementById('connectionModalMessage');
const connectionAcceptBtn = document.getElementById('connectionAcceptBtn');
const connectionRejectBtn = document.getElementById('connectionRejectBtn');

// File UI Elements
const fileInput = document.getElementById('fileInput');
const sendFilesBtn = document.getElementById('sendFilesBtn');
const fileList = document.getElementById('fileList');

// State management
// Device list state
let devices = []; // List of connected devices from WebSocket
let connectedDevice = null; // Currently connected device

// Connection request timeout tracking (ADR-0038)
let pendingConnectionRequests = {}; // deviceId -> { timestamp }
const CONNECTION_REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Detect device type from user agent
 * @returns {string} Device type description
 */
function detectDeviceType() {
  const userAgent = navigator.userAgent.toLowerCase();

  if (
    /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent)
  ) {
    if (/ipad|tablet|playbook|silk|kindle/i.test(userAgent)) {
      return 'Tablet';
    }
    return 'Mobile';
  }

  if (/macintosh|mac os x/i.test(userAgent)) {
    return 'Mac';
  }

  if (/windows/i.test(userAgent)) {
    return 'Windows';
  }

  if (/linux/i.test(userAgent)) {
    return 'Linux';
  }

  return 'Unknown';
}

/**
 * Get current device type
 * @returns {string}
 */
function getDeviceType() {
  // Check if we have cached device type
  if (!window.deviceTypeCache) {
    window.deviceTypeCache = detectDeviceType();
  }
  return window.deviceTypeCache;
}

/**
 * Show loading indicator
 */
function showLoading() {
  loadingIndicator.style.display = 'flex';
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  loadingIndicator.style.display = 'none';
}

/**
 * Update UI based on connection state.
 * @param {string} [oldState] - Previous connection state.
 */
function updateUI(oldState = webrtcManager.state) {
  const isConnected = webrtcManager.isConnected();

  // Clear the in-memory file list when disconnecting
  const state = webrtcManager.state;
  if (
    oldState === ConnectionState.CONNECTED &&
    (state === ConnectionState.CLOSED || state === ConnectionState.FAILED)
  ) {
    fileTransferManager.clear().catch((err) => {
      console.error('Failed to clear files on disconnect:', err);
    });
  }

  // Files header `+` button: visible only while the connection is
  // CONNECTED. The button is hidden — not disabled — so a missing
  // button signals "nothing to do" cleanly.
  sendFilesBtn.hidden = !connectedDevice;

  renderDeviceList();
  renderFileList();
}

/**
 * Render the unified file list.
 *  - Single list of all transfers, sorted by `createdAt` descending
 *    (newest first).
 *  - Empty state varies by connection state: "Tap + to send your
 *    first file" when CONNECTED, "Connect a device to start sharing
 *    files" otherwise.
 *  - Sender rows show no progress bar — the receiver's bytesTransferred
 *    does not reach the sender. Receiver rows show one while actively
 *    receiving.
 */
function renderFileList() {
  const all = fileTransferManager.getAllFiles();
  const isConnected = webrtcManager.isConnected();

  // Sort: newest first by createdAt. The list is a history, not a
  // work queue — rows keep their position as they transition through
  // states.
  all.sort((a, b) => b.createdAt - a.createdAt);

  if (all.length === 0) {
    const emptyMsg = isConnected
      ? 'No files yet'
      : 'Connect a device to start sharing files';
    const emptyHint = isConnected ? 'Tap + to send your first file' : '';
    fileList.innerHTML = `
            <div class="file-list-empty">
                <div class="empty-icon" aria-hidden="true">📁</div>
                <div>${emptyMsg}</div>
                ${emptyHint ? `<div class="empty-hint">${emptyHint}</div>` : ''}
            </div>
        `;
    return;
  }

  const rows = all.map(renderFileRow).join('');
  fileList.innerHTML = rows;
}

/**
 * Render a single file row.
 * @param {Object} file
 * @returns {string} HTML string
 */
function renderFileRow(file) {
  const isSend = file.direction === 'send';
  const arrow = isSend ? '⬆' : '⬇';
  const arrowClass = isSend ? 'send' : 'receive';

  const { label, dotClass } = statusLabel(file);
  const rowClass =
    file.state === FileState.TRANSFERRING ? ' is-active-transfer' : '';
  const time = formatEventTime(file);

  // Progress bar: ONLY for receiver while actively receiving.
  const showProgress = !isSend && file.state === FileState.TRANSFERRING;
  const progress = showProgress
    ? file.getProgress
      ? file.getProgress()
      : 0
    : 0;

  // Disable action buttons on other files when one is actively transferring
  const disableActions = hasActiveTransfer() && file.state !== FileState.TRANSFERRING;
  const actionsHtml = renderFileActions(file, disableActions);

  // Escape user-controlled strings (filename etc.) since this is rendered
  // as innerHTML.
  const safeName = escapeHtml(file.name);
  const displayName = file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name;
  const safeDisplayName = escapeHtml(displayName);

  return `
        <div class="file-row${rowClass}" data-file-id="${file.fileId}" role="listitem">
            <div class="file-row-top">
                <span class="file-arrow ${arrowClass}" aria-hidden="true">${arrow}</span>
                <span class="file-name" title="${safeName}">${safeDisplayName}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <div class="file-status">
                <span class="dot ${dotClass}" aria-hidden="true"></span>
                <span>${label}</span>
                ${time ? `<span style="opacity: 0.6;">· ${time}</span>` : ''}
            </div>
            ${
              showProgress
                ? `
                <div class="file-progress">
                    <div class="file-progress-bar">
                        <div class="file-progress-fill" style="width: ${progress}%;"></div>
                    </div>
                    <div class="file-progress-text">
                        <span>Receiving</span>
                        <span>${progress}%</span>
                    </div>
                </div>
            `
                : ''
            }
            ${actionsHtml}
        </div>
    `;
}

/**
 * Human label + CSS dot class for a file's current state.
 * @param {Object} file
 * @returns {{label: string, dotClass: string}}
 */
function statusLabel(file) {
  const isSend = file.direction === 'send';
  switch (file.state) {
    case FileState.PENDING:
      return isSend
        ? { label: 'Waiting for peer…', dotClass: 'pending' }
        : { label: 'Offered by peer', dotClass: 'pending' };
    case FileState.QUEUED:
      return { label: 'Queued', dotClass: 'queued' };
    case FileState.TRANSFERRING:
      return isSend
        ? { label: 'Sending…', dotClass: 'sending' }
        : { label: 'Receiving', dotClass: 'receiving' };
    case FileState.COMPLETED:
      return isSend
        ? { label: 'Sent', dotClass: 'done' }
        : { label: 'Received', dotClass: 'done' };
    case FileState.FAILED:
      return { label: 'Failed', dotClass: 'failed' };
    case FileState.REJECTED:
      return { label: 'Rejected by peer', dotClass: 'terminal' };
    case FileState.CANCELLED:
      return { label: 'Cancelled', dotClass: 'terminal' };
    default:
      return { label: file.state || 'Unknown', dotClass: 'terminal' };
  }
}

/**
 * Check if there is any file currently in TRANSFERRING state
 * @returns {boolean}
 */
function hasActiveTransfer() {
  const allFiles = fileTransferManager.getAllFiles();
  return allFiles.some(file => file.state === FileState.TRANSFERRING);
}

/**
 * Per-row action buttons. We only show what's actually actionable on
 * the user's side. Accept/Reject only on offers the user can decide on,
 * Remove only on files the user is the sender of, Retry only on failed
 * sends, Download/Open on completed receives.
 * @param {Object} file
 * @param {boolean} disableActions - Whether to disable action buttons (true when another file is actively transferring)
 * @returns {string} HTML
 */
function renderFileActions(file, disableActions = false) {
  const isSend = file.direction === 'send';
  const buttons = [];
  const disabled = disableActions ? ' disabled' : '';

  if (file.state === FileState.PENDING && !isSend) {
    buttons.push(
      `<button class="btn btn-success" onclick="acceptFileOffer('${file.fileId}')"${disabled}>Accept</button>`,
    );
    buttons.push(
      `<button class="btn btn-danger" onclick="rejectFileOffer('${file.fileId}')"${disabled}>Reject</button>`,
    );
  } else if (file.state === FileState.QUEUED && isSend) {
    buttons.push(
      `<button class="btn btn-danger" onclick="cancelQueuedFile('${file.fileId}')"${disabled}>Remove</button>`,
    );
  } else if (file.state === FileState.PENDING && isSend) {
    buttons.push(
      `<button class="btn btn-danger" onclick="cancelFileOffer('${file.fileId}')"${disabled}>Cancel</button>`,
    );
  } else if (file.state === FileState.FAILED && isSend) {
    buttons.push(
      `<button class="btn btn-primary" onclick="retryFile('${file.fileId}')"${disabled}>Retry</button>`,
    );
  }
  // No button for COMPLETED receives: the file is auto-downloaded on
  // completion and the chunk data is gone from IndexedDB, so a
  // re-download action would always fail.

  if (buttons.length === 0) return '';
  return `<div class="file-actions">${buttons.join('')}</div>`;
}

/**
 * Format the most-recent event time for display (e.g. "2:15pm", "Mon").
 * @param {Object} file
 * @returns {string}
 */
function formatEventTime(file) {
  const ts = file.completedAt || file.terminatedAt;
  if (!ts) return '';
  return formatTimeOfDay(ts);
}

/**
 * Format a timestamp as a short relative-ish time. Same-day → "h:mmam/pm";
 * earlier → "Mon", "Tue", etc.
 * @param {number} ts
 * @returns {string}
 */
function formatTimeOfDay(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  }
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * Minimal HTML-escape for user-controlled strings rendered via innerHTML.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Show a toast notification.
 * @param {string} message - Message text
 * @param {'error'|'success'|'info'|'warning'} [type='error']
 */
function showToast(message, type = 'error') {
  toastManager.show(message, type);
}

/**
 * Device List UI Functions (Issue 003)
 */

/**
 * Update connection status UI
 * @param {boolean} isConnected - Whether WebSocket is connected
 */
function updateConnectionStatus(isConnected) {
  if (isConnected) {
    connectionStatus.classList.remove('disconnected');
    connectionStatus.classList.add('connected');
    connectionStatus.innerHTML = '<span class="status-dot"></span><span>Connected to signaling server</span>';
  } else {
    connectionStatus.classList.remove('connected');
    connectionStatus.classList.add('disconnected');
    connectionStatus.innerHTML = '<span class="status-dot"></span><span>Disconnected from signaling server</span>';
  }
}

/**
 * Render device list UI
 */
function renderDeviceList() {
  // Update own device info
  ownDeviceName.textContent = websocketClient.getDeviceName();
  ownDeviceId.textContent = websocketClient.getDeviceId();
  ownDeviceRow.style.display = 'flex';

  // Filter out own device from list
  const otherDevices = devices.filter(d => d.deviceId !== websocketClient.getDeviceId());

  if (otherDevices.length === 0) {
    // Show empty state
    deviceListContainer.innerHTML = `
      <div class="device-list-empty">
        <div class="empty-icon" aria-hidden="true">🔍</div>
        <div>No other devices found</div>
        <div class="empty-hint">Connect another device on the same network</div>
      </div>
    `;
  } else {
    // Render device list
    const deviceRows = otherDevices.map(device => {
      const isConnected = connectedDevice && connectedDevice.deviceId === device.deviceId;
      const isPending = pendingConnectionRequests[device.deviceId];
      
      let statusText = escapeHtml(device.deviceId.slice(0, 8));
      if (isPending) {
        statusText = 'Pending connection...';
      } else if (isConnected) {
        statusText = 'Connected';
      }
      
      let actionButton = '';
      if (isConnected) {
        actionButton = `<button class="btn-disconnect" onclick="disconnectDevice('${device.deviceId}')">Disconnect</button>`;
      } else if (isPending) {
        actionButton = `<button class="btn-connect" disabled>Waiting...</button>`;
      } else {
        actionButton = `<button class="btn-connect" onclick="connectToDevice('${device.deviceId}')">Connect</button>`;
      }
      
      return `
        <div class="device-list-row" data-device-id="${device.deviceId}">
          <span class="status-indicator"></span>
          <div class="device-info">
            <div class="device-name">${escapeHtml(device.deviceName)}</div>
            <span class="device-status">${statusText}</span>
          </div>
          <div class="device-actions">
            ${actionButton}
          </div>
        </div>
      `;
    }).join('');

    deviceListContainer.innerHTML = deviceRows;
  }
}

/**
 * Update all device list related UI
 */
function updateDeviceListUI() {
  updateConnectionStatus(websocketClient.getConnected());
  renderDeviceList();
}

/**
 * Connect to a specific device
 * @param {string} deviceId - Device ID to connect to
 */
async function connectToDevice(deviceId) {
  console.log('Connecting to device:', deviceId);
  const device = devices.find(d => d.deviceId === deviceId);
  if (device) {
    // Check if already connected (1:1 only per ADR-0017)
    if (connectedDevice) {
      showToast('Already connected to another device', 'warning');
      return;
    }

    showToast(`Connecting to ${device.deviceName}...`, 'info');
    
    // Send connection request via WebSocket
    websocketClient.sendToDevice(deviceId, 'request-connect');
    
    // Set timeout for connection request (ADR-0038)
    const timeoutId = setTimeout(() => {
      handleConnectionRequestTimeout(deviceId, device.deviceName);
    }, CONNECTION_REQUEST_TIMEOUT);
    
    // Store pending request
    pendingConnectionRequests[deviceId] = { timeoutId, timestamp: Date.now() };
    
    // Update UI to show pending state
    updateDeviceListUI();
    
    // Wait for the other device to accept before starting WebRTC
    // The acceptance will be received via WebSocket
    // Once accepted, we'll start the WebRTC handshake
  }
}

/**
 * Handle connection request timeout
 * @param {string} deviceId - Device ID that timed out
 * @param {string} deviceName - Device name for display
 */
function handleConnectionRequestTimeout(deviceId, deviceName) {
  // Clear timeout
  if (pendingConnectionRequests[deviceId]) {
    clearTimeout(pendingConnectionRequests[deviceId].timeoutId);
    delete pendingConnectionRequests[deviceId];
  }
  
  // Update UI
  updateDeviceListUI();
  
  // Show timeout message
  showToast(`Connection request to ${deviceName} timed out`, 'error');
  console.log('Connection request timed out:', deviceId);
}

/**
 * Cancel pending connection request
 * @param {string} deviceId - Device ID to cancel request for
 */
function cancelPendingConnectionRequest(deviceId) {
  if (pendingConnectionRequests[deviceId]) {
    clearTimeout(pendingConnectionRequests[deviceId].timeoutId);
    delete pendingConnectionRequests[deviceId];
  }
}

/**
 * Disconnect from connected device
 * @param {string} deviceId - Device ID to disconnect from
 */
async function disconnectDevice(deviceId) {
  console.log('Disconnecting from device:', deviceId);
  
  try {
    // Close WebRTC connection
    if (webrtcManager.state !== ConnectionState.CLOSED) {
      await webrtcManager.close();
    }
    
    // Send disconnect message to server
    websocketClient.sendToDevice(deviceId, 'disconnect');
    
    // Clear connected device
    connectedDevice = null;
    
    // Clear any pending requests for this device
    cancelPendingConnectionRequest(deviceId);
    
    showToast(`Disconnected from ${devices.find(d => d.deviceId === deviceId)?.deviceName || deviceId}`, 'success');
    updateDeviceListUI();
  } catch (error) {
    console.error('Error disconnecting:', error);
    showToast(`Error disconnecting: ${error.message}`, 'error');
  }
}

/**
 * Show connection request modal
 * @param {string} deviceName - Name of device requesting connection
 * @param {string} deviceId - ID of device requesting connection
 */
let pendingConnectionRequest = null;

function showConnectionModal(deviceName, deviceId) {
  pendingConnectionRequest = { deviceId, deviceName };
  connectionModalTitle.textContent = 'Connection Request';
  connectionModalMessage.textContent = `${deviceName} wants to connect to you`;
  connectionModalOverlay.classList.remove('hidden');
}

function hideConnectionModal() {
  pendingConnectionRequest = null;
  connectionModalOverlay.classList.add('hidden');
}

function acceptConnectionRequest() {
  if (pendingConnectionRequest) {
    const { deviceId, deviceName } = pendingConnectionRequest;
    console.log('Accepting connection from:', deviceName);
    
    // Send acceptance via WebSocket
    websocketClient.sendToDevice(deviceId, 'accept-connect');
    
    hideConnectionModal();
    showToast(`Connection accepted with ${deviceName}`, 'success');
    
    // Mark as connected
    connectedDevice = { deviceId, deviceName };
    updateDeviceListUI();
    
    // Start WebRTC handshake as answerer (will receive offer from initiator)
    // The offerer (initiator) will start the connection and send the offer
    // So we just need to wait for the offer to arrive
    console.log('Waiting for WebRTC offer from:', deviceName);
  }
}

function rejectConnectionRequest() {
  if (pendingConnectionRequest) {
    const { deviceId, deviceName } = pendingConnectionRequest;
    console.log('Rejecting connection from:', deviceName);
    websocketClient.sendToDevice(deviceId, 'reject-connect', { reason: 'User rejected' });
    hideConnectionModal();
    showToast(`Connection rejected from ${deviceName}`, 'info');
  }
}





// Setup WebRTC event listeners
webrtcManager.on('stateChange', (newState, oldState) => {
  console.log(`Connection state changed: ${oldState} -> ${newState}`);

  // Clear the in-memory file list when leaving CONNECTED. The list is
  // wiped across all states (active, completed, failed) so the Files
  // tab re-renders to the empty state on the very next render.
  // `clear()` is fire-and-forget: the in-memory wipe runs synchronously
  // (so the re-render sees an empty list) and the IndexedDB cleanup
  // runs in the background.
  if (
    oldState === ConnectionState.CONNECTED &&
    (newState === ConnectionState.CLOSED || newState === ConnectionState.FAILED)
  ) {
    fileTransferManager.clear().catch((err) => {
      console.error('Failed to clear files on disconnect:', err);
    });
  }

  if (newState === ConnectionState.FAILED) {
    // Peer-disconnect lifecycle event. Update UI to reflect disconnected state.
    // No toast here as the UI change is the signal.
    connectedDevice = null;
    updateUI(oldState);
    return;
  }

  // Clear connected device when connection closes
  if (newState === ConnectionState.CLOSED) {
    connectedDevice = null;
  }

  updateUI(oldState);
});

webrtcManager.on('connected', () => {
  console.log('WebRTC connection established');
  updateUI();
});

webrtcManager.on('closed', () => {
  console.log('WebRTC connection closed');
  updateUI();
});

webrtcManager.on('idleTimeout', () => {
  showToast('Connection timed out due to inactivity', 'error');
  updateUI();
});

/**
 * Handle file selection from the picker. We skip the old preview step —
 * the selected files go straight into the manager, which sends offers
 * immediately. Rows appear in the unified list with "Waiting for peer…"
 * status until the peer accepts.
 */
async function handleFileSelection(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  const MAX = 500 * 1024 * 1024;
  const validFiles = files.filter((f) => f.size <= MAX);
  if (validFiles.length === 0) {
    showToast(
      'No valid files selected (check file size - max 500MB)',
      'error',
    );
    event.target.value = '';
    return;
  }
  if (validFiles.length < files.length) {
    showToast(
      `${files.length - validFiles.length} file(s) skipped (too large)`,
      'error',
    );
  }

  try {
    const transfers = await fileTransferManager.selectFiles(validFiles, {
      sendImmediately: true,
    });
    if (transfers.length > 0) {
      showToast(`${transfers.length} file(s) sent to peer`, 'success');
    }
    updateUI();
  } catch (error) {
    console.error('Failed to send files:', error);
    showToast('Failed to send files: ' + error.message, 'error');
  }

  event.target.value = '';
}

/**
 * Cancel a pending file offer (sender side)
 * @param {string} fileId - File ID to cancel
 */
async function cancelFileOffer(fileId) {
  try {
    await fileTransferManager.sendFileCancel(fileId);
    showToast('File offer cancelled', 'success');
    updateUI();
  } catch (error) {
    console.error('Failed to cancel file offer:', error);
    showToast('Failed to cancel: ' + error.message, 'error');
  }
}

/**
 * Remove a queued file from the send queue (sender side, post-accept).
 * @param {string} fileId
 */
async function cancelQueuedFile(fileId) {
  try {
    await fileTransferManager.sendFileCancel(fileId);
    updateUI();
  } catch (error) {
    console.error('Failed to remove queued file:', error);
    showToast('Failed to remove: ' + error.message, 'error');
  }
}

/**
 * Retry a failed send.
 * @param {string} fileId
 */
async function retryFile(fileId) {
  // The simplest retry is to re-offer the file from scratch. The original
  // fileObject is gone from memory, so the user re-selects it.
  showToast('Tap + to reselect the file', 'info');
}

/**
 * Accept a file offer
 * @param {string} fileId - File ID to accept
 */
async function acceptFileOffer(fileId) {
  if (fileId) {
    try {
      const file = fileTransferManager.getFile(fileId);
      if (file) {
        await fileTransferManager.sendFileAccept(fileId);
        showToast(`Accepted: ${file.name}`, 'success');
      }
    } catch (error) {
      showToast(`Failed to accept: ${error.message}`, 'error');
    }
    updateUI();
  }
}

/**
 * Reject a file offer
 * @param {string} fileId - File ID to reject
 */
async function rejectFileOffer(fileId) {
  if (fileId) {
    try {
      const file = fileTransferManager.getFile(fileId);
      if (file) {
        await fileTransferManager.sendFileReject(fileId, 'USER_REJECTED');
        showToast(`Rejected: ${file.name}`, 'success');
      }
    } catch (error) {
      showToast(`Failed to reject: ${error.message}`, 'error');
    }
    updateUI();
  }
}



// Initialize UI
async function init() {
  showLoading();

  // Initialize all modules
  try {
    // Initialize storage (may fail in some browsers)
    try {
      await storageManager.init();
      console.log('Storage initialized');
    } catch (error) {
      console.warn('Storage initialization failed:', error);
    }

    // Connect storage manager to error handler
    storageManager.setErrorHandler(errorHandler);

    // Set file transfer manager reference in webrtcManager (to avoid circular dependency)
    setFileTransferManager(fileTransferManager);
    
    // Set WebSocket client reference in webrtcManager for WebSocket signaling
    setWebSocketClient(websocketClient);

    // Initialize file transfer and chunk handlers (subscribes to webrtcManager events)
    fileTransferManager.init();
    chunkHandler.init();

    // Initialize WebRTC manager (loads persisted connections)
    try {
      await webrtcManager.init();
      console.log('WebRTC manager initialized');
    } catch (error) {
      console.warn('WebRTC manager initialization failed:', error);
    }

    // Initialize WebSocket client and connect to signaling server
    try {
      // Log device info
      console.log('Device ID:', websocketClient.getDeviceId());
      console.log('Device Name:', websocketClient.getDeviceName());
      
      // Connect to WebSocket server
      websocketClient.connect();
      
      // Setup WebSocket event listeners
      setupWebSocketListeners();
      
      console.log('WebSocket client initialized');
    } catch (error) {
      console.warn('WebSocket client initialization failed:', error);
    }

    // Setup error handler
    errorHandler.on('showError', ({ message, type }) => {
      showToast(message, type);
    });

    // Setup file input handler
    fileInput.addEventListener('change', handleFileSelection);

    // Setup modal event listeners
    connectionAcceptBtn.addEventListener('click', acceptConnectionRequest);
    connectionRejectBtn.addEventListener('click', rejectConnectionRequest);

    // Setup module event listeners
    setupModuleListeners();

    // Hide loading indicator
    hideLoading();

    // Update UI
    updateUI();
  } catch (error) {
    hideLoading();
    showToast('Failed to initialize application: ' + error.message, 'error');
    console.error('Initialization error:', error);
  }
}

/**
 * Setup WebSocket event listeners
 */
function setupWebSocketListeners() {
  // Device list updates
  websocketClient.on('device-list', (receivedDevices) => {
    console.log('Device list updated:', receivedDevices);
    devices = receivedDevices;
    updateDeviceListUI();
  });

  // Device disconnected
  websocketClient.on('device-disconnected', (deviceId) => {
    console.log('Device disconnected:', deviceId);
    // Remove from local list and clear if it was the connected device
    devices = devices.filter(d => d.deviceId !== deviceId);
    if (connectedDevice && connectedDevice.deviceId === deviceId) {
      connectedDevice = null;
    }
    updateDeviceListUI();
  });

  // Connection request received
  websocketClient.on('connect-request', ({ fromDeviceId, fromDeviceName }) => {
    console.log('Connection request from:', fromDeviceName, '(', fromDeviceId, ')');
    // Check if already connected (1:1 only per ADR-0017)
    if (connectedDevice) {
      // Auto-reject if already connected
      websocketClient.sendToDevice(fromDeviceId, 'reject-connect', { 
        reason: 'Already connected to another device' 
      });
      showToast(`Rejected ${fromDeviceName}: already connected`, 'warning');
      return;
    }
    showConnectionModal(fromDeviceName, fromDeviceId);
  });

  // Connection accepted
  websocketClient.on('connect-accepted', async ({ fromDeviceId, fromDeviceName }) => {
    console.log('Connection accepted by:', fromDeviceName);
    showToast(`Connection accepted by ${fromDeviceName}`, 'success');
    
    // Clear any pending timeout for this device
    cancelPendingConnectionRequest(fromDeviceId);
    
    // Mark as connected
    connectedDevice = { deviceId: fromDeviceId, deviceName: fromDeviceName };
    updateDeviceListUI();
    
    // Start WebRTC handshake as initiator
    try {
      await webrtcManager.startWebSocketConnection(fromDeviceId);
      console.log('WebRTC handshake started with:', fromDeviceName);
    } catch (error) {
      console.error('Failed to start WebRTC handshake:', error);
      showToast(`Failed to connect: ${error.message}`, 'error');
      // Clear connected device on failure
      connectedDevice = null;
      updateDeviceListUI();
    }
  });

  // Connection rejected
  websocketClient.on('connect-rejected', ({ fromDeviceId, fromDeviceName, reason }) => {
    console.log('Connection rejected by:', fromDeviceName, 'Reason:', reason);
    
    // Clear any pending timeout for this device
    cancelPendingConnectionRequest(fromDeviceId);
    
    showToast(`${fromDeviceName} rejected the connection` + (reason ? `: ${reason}` : ''), 'error');
    updateDeviceListUI();
  });

  // WebRTC signaling messages
  websocketClient.on('offer', async (data) => {
    console.log('Received WebRTC offer from:', data.from);
    // Check if this is for the currently connected device
    if (connectedDevice && connectedDevice.deviceId === data.from) {
      try {
        await webrtcManager.handleIncomingOffer(data.from, data.sdp);
      } catch (error) {
        console.error('Failed to handle incoming offer:', error);
        showToast(`Failed to handle offer from ${data.from}: ${error.message}`, 'error');
      }
    } else {
      console.log('Ignoring offer from non-connected device:', data.from);
    }
  });

  websocketClient.on('answer', async (data) => {
    console.log('Received WebRTC answer from:', data.from);
    // Check if this is for the currently connected device
    if (connectedDevice && connectedDevice.deviceId === data.from) {
      try {
        await webrtcManager.handleIncomingAnswer(data.from, data.sdp);
      } catch (error) {
        console.error('Failed to handle incoming answer:', error);
        showToast(`Failed to handle answer from ${data.from}: ${error.message}`, 'error');
      }
    } else {
      console.log('Ignoring answer from non-connected device:', data.from);
    }
  });

  websocketClient.on('ice-candidate', async (data) => {
    console.log('Received ICE candidate from:', data.from);
    // Check if this is for the currently connected device
    if (connectedDevice && connectedDevice.deviceId === data.from) {
      try {
        await webrtcManager.handleIncomingIceCandidate(data);
      } catch (error) {
        console.error('Failed to handle incoming ICE candidate:', error);
      }
    } else {
      console.log('Ignoring ICE candidate from non-connected device:', data.from);
    }
  });

  // Connection status
  websocketClient.on('connected', () => {
    console.log('WebSocket connected to signaling server');
    updateDeviceListUI();
  });

  websocketClient.on('disconnected', ({ code, reason }) => {
    console.log('WebSocket disconnected:', code, reason);
    updateDeviceListUI();
  });

  websocketClient.on('error', (error) => {
    console.error('WebSocket error:', error);
    showToast('WebSocket error: ' + error.message, 'error');
  });
}

/**
 * Setup event listeners between modules
 */
function setupModuleListeners() {
  // Setup file transfer event listeners
  fileTransferManager.on('fileOfferSent', (file) => {
    showToast(`Offer sent: ${file.name}`, 'success');
    updateUI();
  });

  fileTransferManager.on('fileOfferReceived', (file) => {
    showToast(
      `File offer received: ${file.name} (${formatFileSize(file.size)})`,
      'success',
    );
    updateUI();
  });

  fileTransferManager.on('fileAccepted', (file) => {
    showToast(`File accepted: ${file.name}`, 'success');
    updateUI();
  });

  fileTransferManager.on('fileRejected', (file) => {
    showToast(`File rejected: ${file.name}`, 'error');
    updateUI();
  });

  fileTransferManager.on('fileCancelled', (file) => {
    showToast(`File cancelled: ${file.name}`, 'error');
    updateUI();
  });

  fileTransferManager.on('fileError', (error) => {
    showToast(`File error: ${error.error}`, 'error');
  });

  // Setup chunk handler events
  chunkHandler.on('fileDataComplete', ({ file, data }) => {
    showToast(
      `File received: ${file.name} (${formatFileSize(data.byteLength)})`,
      'success',
    );

    // Create download link for received file
    createDownloadLink(file, data);
  });

  // Receiver's progress signal: this is the only place the progress
  // bar updates. The sender never gets a real-time progress signal
  // (it has no way to count bytes the receiver has acknowledged), so
  // the sender's row in the unified list just shows "Sending…" until
  // the receiver's FILE_RECEIVED ack arrives.
  fileTransferManager.on('fileProgress', (file) => {
    // Re-render the list; the progress bar is rendered only for
    // receiver rows that are TRANSFERRING, and renderFileList reads
    // getProgress() fresh each call.
    renderFileList();
  });

  fileTransferManager.on('fileTransferFailed', (file) => {
    showToast(`Transfer failed: ${file.name}`, 'error');
    renderFileList();
  });

  fileTransferManager.on('fileTransferComplete', (file) => {
    if (file.direction === 'send') {
      showToast(`File sent: ${file.name}`, 'success');
    }
    renderFileList();
  });

  // Other events that can change the list: offers, accepts, rejects.
  fileTransferManager.on('fileOfferSent', () => renderFileList());
  fileTransferManager.on('fileOfferReceived', () => renderFileList());
  fileTransferManager.on('fileAccepted', () => renderFileList());
  fileTransferManager.on('fileRejected', () => renderFileList());
  fileTransferManager.on('fileDataComplete', () => renderFileList());

  // Setup button event listeners (already in HTML, but also here for reference)
  // Buttons use onclick in HTML for simplicity
}

/**
 * Create a download link for a received file
 * @param {FileTransfer} file - File metadata
 * @param {ArrayBuffer} data - File data
 */
function createDownloadLink(file, data) {
  const blob = new Blob([data], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a completed file
 * @param {string} fileId - File ID to download
 */
function downloadFile(fileId) {
  // For now, we need to have the file data cached
  // In a full implementation, we would retrieve from IndexedDB
  const file = fileTransferManager.getFile(fileId);
  if (!file) {
    showToast('File not found', 'error');
    return;
  }

  // Check if we have the data cached in the chunk handler
  chunkHandler
    .getFileData(fileId)
    .then((data) => {
      if (data) {
        createDownloadLink(file, data);
        showToast(`Downloaded: ${file.name}`, 'success');
      } else {
        showToast(
          'File data not available. File may have been cleaned up.',
          'error',
        );
      }
    })
    .catch((error) => {
      showToast('Failed to download: ' + error.message, 'error');
    });
}

// Start the application
init();

// Expose handlers to window for inline onclick="..." in index.html (module scope is not global)
window.acceptFileOffer = acceptFileOffer;
window.rejectFileOffer = rejectFileOffer;
window.downloadFile = downloadFile;
window.cancelFileOffer = cancelFileOffer;
window.cancelQueuedFile = cancelQueuedFile;
window.retryFile = retryFile;
// WebSocket device list handlers
window.connectToDevice = connectToDevice;
window.disconnectDevice = disconnectDevice;
window.acceptConnectionRequest = acceptConnectionRequest;
window.rejectConnectionRequest = rejectConnectionRequest;

// Wire the Files header `+` button to the hidden file input. The
// button is `hidden` (not `disabled`) when the connection is not
// CONNECTED, so we don't need a disabled check here — a hidden
// element cannot receive clicks.
sendFilesBtn.addEventListener('click', () => {
  fileInput.click();
});

// Export for testing
export {
  // WebSocket device list functions
  connectToDevice,
  disconnectDevice,
  acceptConnectionRequest,
  rejectConnectionRequest,
  updateDeviceListUI,
  renderDeviceList,
  updateUI,
  showToast,
  formatFileSize,
};
