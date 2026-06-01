/**
 * Main Application Entry Point
 * Orchestrates the QR code connection handshake and WebRTC management
 */

import { webrtcManager, ConnectionState, setFileTransferManager } from '@modules/webrtcManager.js';
import { qrHandler } from '@modules/qrHandler.js';
import { fileTransferManager, FileState } from '@modules/fileTransfer.js';
import { chunkHandler } from '@utils/chunkHandler.js';
import { errorHandler } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const createConnectionBtn = document.getElementById('createConnectionBtn');
const scanOfferBtn = document.getElementById('scanOfferBtn');
const scanAnswerBtn = document.getElementById('scanAnswerBtn');
const closeConnectionBtn = document.getElementById('closeConnectionBtn');
const retryConnectionBtn = document.getElementById('retryConnectionBtn');
const offerQRContainer = document.getElementById('offerQRContainer');
const offerQRCanvas = document.getElementById('offerQRCanvas');
const answerQRContainer = document.getElementById('answerQRContainer');
const answerQRCanvas = document.getElementById('answerQRCanvas');
const scannerView = document.getElementById('scannerView');
const scannerVideo = document.getElementById('scannerVideo');
const connStatusIndicator = document.getElementById('connStatusIndicator');
const connStatusText = document.getElementById('connStatusText');
const connectionAlert = document.getElementById('connectionAlert');
const connectionInfo = document.getElementById('connectionInfo');
const connIdDisplay = document.getElementById('connIdDisplay');
const connSecretDisplay = document.getElementById('connSecretDisplay');
const connStateDisplay = document.getElementById('connStateDisplay');

// File UI Elements
const fileInput = document.getElementById('fileInput');
const sendFilesFab = document.getElementById('sendFilesFab');
const filesAlert = document.getElementById('filesAlert');
const fileList = document.getElementById('fileList');
const filterChips = document.querySelectorAll('.filter-chips .chip');

// State management
let currentScanMode = null; // 'OFFER' or 'ANSWER'
let offerQRData = null;
let currentFilter = 'all'; // 'all' | 'active' | 'done'

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Detect device type from user agent
 * @returns {string} Device type description
 */
function detectDeviceType() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent)) {
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
 * Update UI based on connection state
 */
function updateUI() {
    const state = webrtcManager.state;
    const info = webrtcManager.getConnectionInfo();
    const isConnected = webrtcManager.isConnected();
    const isConnecting = webrtcManager.isConnecting();
    
    // Update status indicator and text
    connStatusIndicator.className = 'status-indicator';
    switch (state) {
        case ConnectionState.NEW:
            connStatusIndicator.classList.add('connecting');
            connStatusText.textContent = 'Waiting for answer';
            break;
        case ConnectionState.CONNECTING:
            connStatusIndicator.classList.add('connecting');
            connStatusText.textContent = 'Connecting...';
            break;
        case ConnectionState.CONNECTED:
            connStatusIndicator.classList.add('connected');
            connStatusText.textContent = 'Connected';
            break;
        case ConnectionState.TRANSFERRING:
            connStatusIndicator.classList.add('connected');
            connStatusText.textContent = 'Transferring';
            break;
        case ConnectionState.FAILED:
            connStatusIndicator.classList.add('failed');
            connStatusText.textContent = 'Connection failed';
            break;
        case ConnectionState.CLOSED:
        default:
            connStatusText.textContent = 'Not connected';
            break;
    }
    
    // Update connection info display
    if (info.connId) {
        connIdDisplay.textContent = info.connId;
        connSecretDisplay.textContent = info.secret || 'N/A';
        connStateDisplay.textContent = state;
        
        // Show device type
        const deviceType = getDeviceType();
        const deviceTypeDisplay = document.getElementById('connDeviceTypeDisplay');
        if (deviceTypeDisplay) {
            deviceTypeDisplay.textContent = deviceType;
        }
        
        connectionInfo.style.display = 'block';
    } else {
        connectionInfo.style.display = 'none';
    }

    // Update button states
    const isFailed = state === ConnectionState.FAILED;
    createConnectionBtn.disabled = isConnecting || isConnected;
    scanOfferBtn.disabled = isConnecting || isConnected || qrHandler.isScanning();
    scanAnswerBtn.disabled = !offerQRData || isConnected || qrHandler.isScanning();
    closeConnectionBtn.disabled = !isConnected && !isFailed;
    retryConnectionBtn.disabled = !isFailed;
    sendFilesFab.disabled = !isConnected;

    // Show/hide QR containers
    offerQRContainer.style.display = (offerQRData && !isConnected) ? 'block' : 'none';
    answerQRContainer.style.display =
        (state === ConnectionState.CONNECTING && currentScanMode === 'OFFER') ? 'block' : 'none';

    renderFileList();
}

/**
 * Render the unified file list filtered by the active chip.
 *  - All: chronological (most-recent event first)
 *  - Active: PENDING, QUEUED, TRANSFERRING
 *  - Done: COMPLETED, FAILED, REJECTED, CANCELLED
 * Sender rows never show a progress bar (sender has no real-time
 * progress signal — the receiver's `bytesTransferred` doesn't reach
 * the sender's UI in a meaningful way). Receiver rows do.
 */
function renderFileList() {
    const all = fileTransferManager.getAllFiles();

    // Update chip counts.
    const counts = { all: all.length, active: 0, done: 0 };
    for (const f of all) {
        if (f.getStateGroup() === 'active') counts.active++;
        else counts.done++;
    }
    for (const chip of filterChips) {
        const key = chip.dataset.filter;
        const countEl = chip.querySelector('[data-count]');
        if (countEl) countEl.textContent = String(counts[key] ?? 0);
    }

    // Filter.
    const filtered = all.filter((f) => {
        if (currentFilter === 'all') return true;
        return f.getStateGroup() === currentFilter;
    });

    // Sort: All/Done by getLastEventTime desc; Active by event-time desc
    // with TRANSFERRING first, then PENDING (offers needing action), then QUEUED.
    filtered.sort((a, b) => {
        if (currentFilter !== 'all') {
            const order = { TRANSFERRING: 0, PENDING: 1, QUEUED: 2 };
            const ao = order[a.state] ?? 3;
            const bo = order[b.state] ?? 3;
            if (ao !== bo) return ao - bo;
        }
        return b.getLastEventTime() - a.getLastEventTime();
    });

    if (filtered.length === 0) {
        const emptyMsg = currentFilter === 'active'
            ? 'Nothing in progress'
            : currentFilter === 'done'
                ? 'No completed transfers yet'
                : 'No files yet';
        const emptyHint = currentFilter === 'all'
            ? 'Tap + to send your first file'
            : '';
        fileList.innerHTML = `
            <div class="file-list-empty">
                <div class="empty-icon" aria-hidden="true">📁</div>
                <div>${emptyMsg}</div>
                ${emptyHint ? `<div class="empty-hint">${emptyHint}</div>` : ''}
            </div>
        `;
        return;
    }

    const rows = filtered.map(renderFileRow).join('');
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
    const rowClass = file.state === FileState.TRANSFERRING ? ' is-active-transfer' : '';
    const time = formatEventTime(file);

    // Progress bar: ONLY for receiver while actively receiving.
    const showProgress = !isSend && file.state === FileState.TRANSFERRING;
    const progress = showProgress ? (file.getProgress ? file.getProgress() : 0) : 0;

    const actionsHtml = renderFileActions(file);

    // Escape user-controlled strings (filename etc.) since this is rendered
    // as innerHTML.
    const safeName = escapeHtml(file.name);

    return `
        <div class="file-row${rowClass}" data-file-id="${file.fileId}" role="listitem">
            <div class="file-row-top">
                <span class="file-arrow ${arrowClass}" aria-hidden="true">${arrow}</span>
                <span class="file-name" title="${safeName}">${safeName}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <div class="file-status">
                <span class="dot ${dotClass}" aria-hidden="true"></span>
                <span>${label}</span>
                ${time ? `<span style="opacity: 0.6;">· ${time}</span>` : ''}
            </div>
            ${showProgress ? `
                <div class="file-progress">
                    <div class="file-progress-bar">
                        <div class="file-progress-fill" style="width: ${progress}%;"></div>
                    </div>
                    <div class="file-progress-text">
                        <span>Receiving</span>
                        <span>${progress}%</span>
                    </div>
                </div>
            ` : ''}
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
 * Per-row action buttons. We only show what's actually actionable on
 * the user's side. Accept/Reject only on offers the user can decide on,
 * Remove only on files the user is the sender of, Retry only on failed
 * sends, Download/Open on completed receives.
 * @param {Object} file
 * @returns {string} HTML
 */
function renderFileActions(file) {
    const isSend = file.direction === 'send';
    const buttons = [];

    if (file.state === FileState.PENDING && !isSend) {
        buttons.push(`<button class="btn btn-primary" onclick="acceptFileOffer('${file.fileId}')">Accept</button>`);
        buttons.push(`<button class="btn btn-danger" onclick="rejectFileOffer('${file.fileId}')">Reject</button>`);
    } else if (file.state === FileState.QUEUED && isSend) {
        buttons.push(`<button class="btn btn-danger" onclick="cancelQueuedFile('${file.fileId}')">Remove</button>`);
    } else if (file.state === FileState.PENDING && isSend) {
        buttons.push(`<button class="btn btn-danger" onclick="cancelFileOffer('${file.fileId}')">Cancel</button>`);
    } else if (file.state === FileState.FAILED && isSend) {
        buttons.push(`<button class="btn btn-primary" onclick="retryFile('${file.fileId}')">Retry</button>`);
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
 * Show an alert message
 * @param {string} message - Message to display
 * @param {string} type - 'error' or 'success'
 */
function showAlert(message, type = 'error') {
    connectionAlert.textContent = message;
    connectionAlert.className = 'alert alert-' + type;
    connectionAlert.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        connectionAlert.style.display = 'none';
    }, 5000);
}

/**
 * Create a new connection and generate offer QR code
 */
async function createConnection() {
    try {
        showAlert('Creating offer...', 'success');
        
        // Close any existing connection first (ADR-0017: 1:1 connections only)
        if (webrtcManager.state !== ConnectionState.CLOSED) {
            webrtcManager.close();
        }
        
        // Generate offer QR
        const result = await webrtcManager.generateOfferQR();
        offerQRData = result.qrData;
        currentScanMode = null;
        
        // Render QR code to canvas
        await qrHandler.renderQRCodeToCanvas(offerQRData, offerQRCanvas);
        
        // Enable answer scanning
        scanAnswerBtn.disabled = false;
        
        showAlert('Offer QR generated! Show this to the other device.', 'success');
        updateUI();
        
    } catch (error) {
        console.error('Failed to create connection:', error);
        showAlert('Failed to create connection: ' + error.message);
    }
}

/**
 * Start scanning for a QR code
 * @param {string} mode - 'OFFER' or 'ANSWER'
 */
async function scanQRCode(mode) {
    try {
        if (qrHandler.isScanning()) {
            qrHandler.stopScanning();
        }
        
        currentScanMode = mode;
        scannerView.style.display = 'block';
        
        // Stop any existing connection if scanning an offer (ADR-0017)
        if (mode === 'OFFER' && webrtcManager.state !== ConnectionState.CLOSED) {
            webrtcManager.close();
            offerQRData = null;
        }
        
        await qrHandler.startScanning(
            scannerVideo,
            (qrData) => {
                // Successfully scanned a QR code
                scannerView.style.display = 'none';
                handleQRScanResult(qrData, mode);
            },
            (error) => {
                console.error('Scan error:', error);
                showAlert('Scan error: ' + error.message);
                scannerView.style.display = 'none';
            }
        );
        
        updateUI();
        
    } catch (error) {
        console.error('Failed to start scanning:', error);
        showAlert('Failed to access camera: ' + error.message);
        scannerView.style.display = 'none';
        qrHandler.stopScanning();
    }
}

/**
 * Handle the result of a QR code scan
 * @param {Object} qrData - Parsed QR data
 * @param {string} mode - Expected mode ('OFFER' or 'ANSWER')
 */
async function handleQRScanResult(qrData, mode) {
    try {
        // Make sure scanning is stopped
        qrHandler.stopScanning();
        
        if (qrData.type === 'OFFER' && mode === 'OFFER') {
            // Scanned an offer, need to generate answer
            const result = await webrtcManager.processOfferQR(qrData);

            currentScanMode = 'OFFER';

            await qrHandler.renderQRCodeToCanvas(result.qrData, answerQRCanvas);
            answerQRContainer.style.display = 'block';
            
            showAlert('Offer received! Show the answer QR to the initiator.', 'success');
            updateUI();
            
        } else if (qrData.type === 'ANSWER' && mode === 'ANSWER') {
            // Scanned an answer, complete the connection
            await webrtcManager.processAnswerQR(qrData);
            
            showAlert('Connection established! Waiting for data channels to open...', 'success');
            updateUI();
            
        } else {
            throw new Error(`Expected ${mode} QR code but got ${qrData.type}`);
        }
        
    } catch (error) {
        console.error('Failed to process QR code:', error);
        qrHandler.stopScanning();
        showAlert('Failed to process QR code: ' + error.message);
        updateUI();
    }
}

/**
 * Close the current connection
 */
async function closeConnection() {
    await webrtcManager.close();
    offerQRData = null;
    currentScanMode = null;
    scannerView.style.display = 'none';
    qrHandler.stopScanning();
    answerQRContainer.style.display = 'none';
    updateUI();
    showAlert('Connection closed', 'success');
}

/**
 * Retry connection after failure
 */
async function retryConnection() {
    // Clear the failed state
    await webrtcManager.close();
    offerQRData = null;
    currentScanMode = null;
    scannerView.style.display = 'none';
    qrHandler.stopScanning();
    answerQRContainer.style.display = 'none';
    
    // Enable create connection button
    updateUI();
    showAlert('Ready to retry. Click "Create Connection" to start again.', 'success');
}

// Setup WebRTC event listeners
webrtcManager.on('stateChange', (newState, oldState) => {
    console.log(`Connection state changed: ${oldState} -> ${newState}`);
    updateUI();
    
    if (newState === ConnectionState.FAILED) {
        showAlert('Connection failed', 'error');
    }
    
    if (newState === ConnectionState.CLOSED && oldState !== ConnectionState.FAILED) {
        // Connection closed normally (not due to failure)
        offerQRData = null;
        currentScanMode = null;
        scannerView.style.display = 'none';
        qrHandler.stopScanning();
        updateUI();
    }
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
    showAlert('Connection timed out due to inactivity', 'error');
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
    const validFiles = files.filter(f => f.size <= MAX);
    if (validFiles.length === 0) {
        showFilesAlert('No valid files selected (check file size - max 500MB)', 'error');
        event.target.value = '';
        return;
    }
    if (validFiles.length < files.length) {
        showFilesAlert(`${files.length - validFiles.length} file(s) skipped (too large)`, 'error');
    }

    try {
        const transfers = await fileTransferManager.selectFiles(validFiles, { sendImmediately: true });
        if (transfers.length > 0) {
            showFilesAlert(`${transfers.length} file(s) sent to peer`, 'success');
        }
        updateUI();
    } catch (error) {
        console.error('Failed to send files:', error);
        showFilesAlert('Failed to send files: ' + error.message, 'error');
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
        showFilesAlert('File offer cancelled', 'success');
        updateUI();
    } catch (error) {
        console.error('Failed to cancel file offer:', error);
        showFilesAlert('Failed to cancel: ' + error.message, 'error');
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
        showFilesAlert('Failed to remove: ' + error.message, 'error');
    }
}

/**
 * Retry a failed send.
 * @param {string} fileId
 */
async function retryFile(fileId) {
    // The simplest retry is to re-offer the file from scratch. The original
    // fileObject is gone from memory, so the user re-selects it.
    showFilesAlert('Tap + to reselect the file', 'info');
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
                showFilesAlert(`Accepted: ${file.name}`, 'success');
            }
        } catch (error) {
            showFilesAlert(`Failed to accept: ${error.message}`, 'error');
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
                showFilesAlert(`Rejected: ${file.name}`, 'success');
            }
        } catch (error) {
            showFilesAlert(`Failed to reject: ${error.message}`, 'error');
        }
        updateUI();
    }
}

/**
 * Show files alert message
 * @param {string} message - Message to display
 * @param {string} type - 'error' or 'success'
 */
function showFilesAlert(message, type = 'error') {
    filesAlert.textContent = message;
    filesAlert.className = 'alert alert-' + type;
    filesAlert.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        filesAlert.style.display = 'none';
    }, 5000);
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
        
        // Setup error handler
        errorHandler.on('showError', ({ message, type }) => {
            showAlert(message, type);
        });
        
        // Setup file input handler
        fileInput.addEventListener('change', handleFileSelection);
        
        // Setup module event listeners
        setupModuleListeners();
        
        // Hide loading indicator
        hideLoading();
        
        // Update UI
        updateUI();
    } catch (error) {
        hideLoading();
        showAlert('Failed to initialize application: ' + error.message, 'error');
        console.error('Initialization error:', error);
    }
}

/**
 * Setup event listeners between modules
 */
function setupModuleListeners() {
    
    // Setup file transfer event listeners
    fileTransferManager.on('fileOfferSent', (file) => {
        showFilesAlert(`Offer sent: ${file.name}`, 'success');
        updateUI();
    });
    
    fileTransferManager.on('fileOfferReceived', (file) => {
        showFilesAlert(`File offer received: ${file.name} (${formatFileSize(file.size)})`, 'success');
        updateUI();
    });
    
    fileTransferManager.on('fileAccepted', (file) => {
        showFilesAlert(`File accepted: ${file.name}`, 'success');
        updateUI();
    });
    
    fileTransferManager.on('fileRejected', (file) => {
        showFilesAlert(`File rejected: ${file.name}`, 'error');
        updateUI();
    });
    
    fileTransferManager.on('fileCancelled', (file) => {
        showFilesAlert(`File cancelled: ${file.name}`, 'error');
        updateUI();
    });
    
    fileTransferManager.on('fileError', (error) => {
        showFilesAlert(`File error: ${error.error}`, 'error');
    });
    
    // Setup chunk handler events
    chunkHandler.on('fileDataComplete', ({ file, data }) => {
        showFilesAlert(`File received: ${file.name} (${formatFileSize(data.byteLength)})`, 'success');
        
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
        showFilesAlert(`Transfer failed: ${file.name}`, 'error');
        renderFileList();
    });

    fileTransferManager.on('fileTransferComplete', (file) => {
        if (file.direction === 'send') {
            showFilesAlert(`File sent: ${file.name}`, 'success');
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
        showFilesAlert('File not found', 'error');
        return;
    }
    
    // Check if we have the data cached in the chunk handler
    chunkHandler.getFileData(fileId).then((data) => {
        if (data) {
            createDownloadLink(file, data);
            showFilesAlert(`Downloaded: ${file.name}`, 'success');
        } else {
            showFilesAlert('File data not available. File may have been cleaned up.', 'error');
        }
    }).catch((error) => {
        showFilesAlert('Failed to download: ' + error.message, 'error');
    });
}

// Start the application
init();

// Expose handlers to window for inline onclick="..." in index.html (module scope is not global)
window.createConnection = createConnection;
window.scanQRCode = scanQRCode;
window.closeConnection = closeConnection;
window.retryConnection = retryConnection;
window.acceptFileOffer = acceptFileOffer;
window.rejectFileOffer = rejectFileOffer;
window.downloadFile = downloadFile;
window.cancelFileOffer = cancelFileOffer;
window.cancelQueuedFile = cancelQueuedFile;
window.retryFile = retryFile;

// Wire the FAB to the hidden file input, and the filter chips to renderFileList.
sendFilesFab.addEventListener('click', () => {
    if (sendFilesFab.disabled) return;
    fileInput.click();
});

for (const chip of filterChips) {
    chip.addEventListener('click', () => {
        const filter = chip.dataset.filter;
        if (filter === currentFilter) return;
        currentFilter = filter;
        for (const c of filterChips) {
            const isActive = c.dataset.filter === currentFilter;
            c.classList.toggle('active', isActive);
            c.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
        renderFileList();
    });
}

// Export for testing
export { createConnection, scanQRCode, closeConnection, updateUI, showAlert, formatFileSize };
