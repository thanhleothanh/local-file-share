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
const selectFilesBtn = document.getElementById('selectFilesBtn');
const filesAlert = document.getElementById('filesAlert');
const fileSendProgress = document.getElementById('fileSendProgress');
const sendingFileName = document.getElementById('sendingFileName');
const sendProgressBar = document.getElementById('sendProgressBar');
const sendProgressText = document.getElementById('sendProgressText');
const filePreview = document.getElementById('filePreview');
const previewFileList = document.getElementById('previewFileList');
const confirmSendBtn = document.getElementById('confirmSendBtn');
const cancelPreviewBtn = document.getElementById('cancelPreviewBtn');
const pendingOffers = document.getElementById('pendingOffers');
const pendingOffersList = document.getElementById('pendingOffersList');
const fileQueue = document.getElementById('fileQueue');
const queueStatus = document.getElementById('queueStatus');
const noConnectionFilesMsg = document.getElementById('noConnectionFilesMsg');

// State management
let currentScanMode = null; // 'OFFER' or 'ANSWER'
let offerQRData = null;
let currentSendingFile = null;
let pendingFiles = []; // Files selected but not yet sent (for preview)

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
        
        // Show device type (ISSUE-006)
        const deviceType = getDeviceType();
        const deviceTypeDisplay = document.getElementById('connDeviceTypeDisplay');
        if (deviceTypeDisplay) {
            deviceTypeDisplay.textContent = deviceType;
        }
        
        connectionInfo.style.display = 'block';
    } else {
        connectionInfo.style.display = 'none';
    }
    
    // Update connection-dependent UI
    noConnectionFilesMsg.style.display = isConnected ? 'none' : 'block';
    
    // Update button states
    const isFailed = state === ConnectionState.FAILED;
    createConnectionBtn.disabled = isConnecting || isConnected;
    scanOfferBtn.disabled = isConnecting || isConnected || qrHandler.isScanning();
    scanAnswerBtn.disabled = !offerQRData || isConnected || qrHandler.isScanning();
    closeConnectionBtn.disabled = !isConnected && !isFailed;
    retryConnectionBtn.disabled = !isFailed;
    selectFilesBtn.disabled = !isConnected;
    
    // Show/hide QR containers
    offerQRContainer.style.display = (offerQRData && !isConnected) ? 'block' : 'none';
    answerQRContainer.style.display = 
        (state === ConnectionState.CONNECTING && currentScanMode === 'OFFER') ? 'block' : 'none';
    
    // Update file queue display
    updateFileQueueUI();
}

/**
 * Update file queue UI
 */
function updateFileQueueUI() {
    const files = fileTransferManager.getAllFiles();
    const pending = fileTransferManager.getFilesByState(FileState.PENDING);
    const queueInfo = fileTransferManager.getQueueInfo();
    
    // Update queue status
    if (files.length > 0) {
        queueStatus.textContent = `${queueInfo.fileCount} file(s), ${formatFileSize(queueInfo.totalBytes)} queued`;
        queueStatus.style.display = 'block';
    } else {
        queueStatus.style.display = 'none';
    }
    
    // Update pending offers display (ISSUE-008: multiple offers)
    const receivedPending = pending.filter(f => f.direction === 'receive');
    if (receivedPending.length > 0) {
        let html = '';
        for (const file of receivedPending) {
            html += `
                <div style="padding: 0.5rem; border-bottom: 1px solid var(--bg-secondary); margin-bottom: 0.5rem;" data-file-id="${file.fileId}">
                    <p style="margin: 0; font-size: 0.9rem;">
                        <strong>← ${file.name}</strong> (${formatFileSize(file.size)})
                    </p>
                    <div class="qr-actions" style="margin-top: 0.5rem;">
                        <button class="btn btn-primary" onclick="acceptFileOffer('${file.fileId}')" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;">
                            Accept
                        </button>
                        <button class="btn btn-danger" onclick="rejectFileOffer('${file.fileId}')" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;">
                            Reject
                        </button>
                    </div>
                </div>
            `;
        }
        pendingOffersList.innerHTML = html;
        pendingOffers.style.display = 'block';
    } else {
        pendingOffers.style.display = 'none';
    }
    
    // Update file queue list
    if (files.length === 0) {
        fileQueue.innerHTML = '<p style="color: var(--text-secondary);">No files in queue</p>';
    } else {
        let html = '';
        for (const file of files) {
            const progress = file.getProgress ? file.getProgress() : 0;
            const state = file.state || 'UNKNOWN';
            const direction = file.direction === 'send' ? '→' : '←';
            const directionText = file.direction === 'send' ? 'Sending' : 'Receiving';
            
            // Show download button for completed received files
            const isCompletedReceive = file.state === 'COMPLETED' && file.direction === 'receive';
            
            const isCompleted = file.state === 'COMPLETED';
            const isFailed = file.state === 'FAILED';
            const isRejected = file.state === 'REJECTED';
            const isPending = file.state === 'PENDING';
            const isSender = file.direction === 'send';
            
            html += `
                <div style="padding: 0.5rem; border-bottom: 1px solid var(--bg-secondary);" data-file-id="${file.fileId}">
                    <p style="margin: 0; font-size: 0.9rem;">
                        <span style="color: var(--accent); margin-right: 0.5rem;">${direction}</span>
                        <strong>${file.name}</strong> (${formatFileSize(file.size)})
                        <span style="color: var(--text-secondary); float: right;">${directionText} - ${state}</span>
                    </p>
                    ${progress > 0 && progress < 100 ? `
                        <div class="custom-progress-container" style="margin-top: 0.25rem;">
                            <div class="custom-progress-bar" style="width: ${progress}%;">
                                <span class="custom-progress-text">${progress}%</span>
                            </div>
                        </div>
                    ` : ''}
                    ${isCompleted ? `
                        <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: var(--success); font-size: 1.2rem;">✓</span>
                            <span style="color: var(--success); font-size: 0.85rem;">Downloaded</span>
                            ${isCompletedReceive ? `
                                <button class="btn btn-primary" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" onclick="downloadFile('${file.fileId}')">
                                    Download
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                    ${isPending && isSender ? `
                        <div style="margin-top: 0.5rem;">
                            <button class="btn btn-danger" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" onclick="cancelFileOffer('${file.fileId}')">
                                Cancel
                            </button>
                        </div>
                    ` : ''}
                    ${isFailed || isRejected ? `
                        <div style="margin-top: 0.5rem;">
                            <span style="color: var(--error); font-size: 1.2rem;">✗</span>
                            <span style="color: var(--error); font-size: 0.85rem;">${state}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        fileQueue.innerHTML = html;
    }
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
 * Handle file selection
 */
async function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    // Validate files first
    const validFiles = files.filter(f => f.size <= 500 * 1024 * 1024);
    
    if (validFiles.length === 0) {
        showFilesAlert('No valid files selected (check file size - max 500MB)', 'error');
        event.target.value = '';
        return;
    }
    
    if (validFiles.length < files.length) {
        showFilesAlert(`${files.length - validFiles.length} file(s) skipped (too large)`, 'error');
    }
    
    // Store pending files for preview
    pendingFiles = validFiles;
    
    // Show preview
    showFilePreview();
    
    // Reset file input
    event.target.value = '';
}

/**
 * Show file preview UI
 */
function showFilePreview() {
    if (pendingFiles.length === 0) {
        filePreview.style.display = 'none';
        return;
    }
    
    // Build preview HTML
    let html = '';
    for (const file of pendingFiles) {
        html += `
            <div style="padding: 0.25rem; border-bottom: 1px solid var(--bg-secondary); font-size: 0.85rem;">
                <span style="color: var(--accent);">📄</span>
                <strong>${file.name}</strong> (${formatFileSize(file.size)})
            </div>
        `;
    }
    previewFileList.innerHTML = html;
    
    // Show preview section
    filePreview.style.display = 'block';
    confirmSendBtn.style.display = 'inline-flex';
    cancelPreviewBtn.style.display = 'inline-flex';
    selectFilesBtn.disabled = true;
}

/**
 * Confirm and send previewed files
 */
async function confirmSendFiles() {
    if (pendingFiles.length === 0) return;
    
    try {
        // Select files without sending immediately (for preview)
        const fileTransfers = await fileTransferManager.selectFiles(pendingFiles, { sendImmediately: false });
        
        if (fileTransfers.length > 0) {
            // Now send the offers
            fileTransferManager.sendFileOffers(fileTransfers);
            showFilesAlert(`${fileTransfers.length} file(s) sent for transfer`, 'success');
            
            // Start sending first file
            const firstFile = fileTransfers[0];
            await startSendingFile(firstFile);
        } else {
            showFilesAlert('No valid files to send', 'error');
        }
        
        // Clear preview
        cancelFilePreview();
        updateUI();
    } catch (error) {
        console.error('Failed to send files:', error);
        showFilesAlert('Failed to send files: ' + error.message, 'error');
    }
}

/**
 * Cancel file preview
 */
async function cancelFilePreview() {
    // Clear any files that were created but not sent
    // Note: Since we haven't called selectFiles yet in this flow, 
    // pendingFiles are just File objects, not FileTransfer objects
    pendingFiles = [];
    filePreview.style.display = 'none';
    confirmSendBtn.style.display = 'none';
    cancelPreviewBtn.style.display = 'none';
    selectFilesBtn.disabled = false;
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
 * Start sending a file
 * @param {FileTransfer} fileTransfer - File to send
 */
async function startSendingFile(fileTransfer) {
    try {
        currentSendingFile = fileTransfer;
        
        // Show progress UI
        sendingFileName.textContent = fileTransfer.name;
        fileSendProgress.style.display = 'block';
        
        // Get the actual File object from the input
        // For now, we'll just show progress but the actual chunk sending
        // will be handled when the receiver accepts
        
        // Update state
        fileTransfer.transitionState(FileState.PENDING);
        
        updateUI();
        
    } catch (error) {
        console.error('Failed to start sending file:', error);
        showFilesAlert('Failed to start transfer: ' + error.message, 'error');
    }
}

/**
 * Update send progress UI
 * @param {number} progress - Progress percentage (0-100)
 */
function updateSendProgress(progress) {
    if (sendProgressBar) {
        sendProgressBar.style.width = progress + '%';
    }
    if (sendProgressText) {
        sendProgressText.textContent = progress + '%';
    }
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
    
    fileTransferManager.on('fileProgress', (file) => {
        // Update UI to show progress
        updateUI();
        
        // If this is the currently sending file, update the send progress bar
        if (currentSendingFile && currentSendingFile.fileId === file.fileId) {
            const progress = file.getProgress ? file.getProgress() : 0;
            updateSendProgress(progress);
        }
    });
    
    fileTransferManager.on('fileTransferFailed', (file) => {
        showFilesAlert(`Transfer failed: ${file.name}`, 'error');
        updateUI();
    });
    
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
window.confirmSendFiles = confirmSendFiles;
window.cancelFilePreview = cancelFilePreview;
window.acceptFileOffer = acceptFileOffer;
window.rejectFileOffer = rejectFileOffer;
window.downloadFile = downloadFile;
window.cancelFileOffer = cancelFileOffer;

// Export for testing
export { createConnection, scanQRCode, closeConnection, updateUI, showAlert, formatFileSize };
