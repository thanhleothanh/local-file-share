/**
 * Main Application Entry Point
 * Orchestrates the QR code connection handshake and WebRTC management
 */

import { webrtcManager, ConnectionState } from './modules/webrtcManager.js';
import { qrHandler } from './modules/qrHandler.js';

// DOM Elements
const createConnectionBtn = document.getElementById('createConnectionBtn');
const scanOfferBtn = document.getElementById('scanOfferBtn');
const scanAnswerBtn = document.getElementById('scanAnswerBtn');
const closeConnectionBtn = document.getElementById('closeConnectionBtn');
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

// State management
let currentScanMode = null; // 'OFFER' or 'ANSWER'
let offerQRData = null;

/**
 * Update UI based on connection state
 */
function updateUI() {
    const state = webrtcManager.state;
    const info = webrtcManager.getConnectionInfo();
    
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
        connectionInfo.style.display = 'block';
    } else {
        connectionInfo.style.display = 'none';
    }
    
    // Update button states
    const isConnecting = webrtcManager.isConnecting();
    const isConnected = webrtcManager.isConnected();
    
    createConnectionBtn.disabled = isConnecting || isConnected;
    scanOfferBtn.disabled = isConnecting || isConnected || qrHandler.isScanning();
    scanAnswerBtn.disabled = !offerQRData || isConnected || qrHandler.isScanning();
    closeConnectionBtn.disabled = !isConnected;
    
    // Show/hide QR containers
    offerQRContainer.style.display = offerQRData ? 'block' : 'none';
    answerQRContainer.style.display = 
        (state === ConnectionState.CONNECTING && currentScanMode === 'OFFER') ? 'block' : 'none';
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
            
            // Store the offer data for reference
            offerQRData = result.qrData;
            currentScanMode = 'OFFER';
            
            // Render answer QR code
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
function closeConnection() {
    webrtcManager.close();
    offerQRData = null;
    currentScanMode = null;
    scannerView.style.display = 'none';
    qrHandler.stopScanning();
    answerQRContainer.style.display = 'none';
    updateUI();
    showAlert('Connection closed', 'success');
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

// Initialize UI
function init() {
    updateUI();
    
    // Setup button event listeners (already in HTML, but also here for reference)
    // Buttons use onclick in HTML for simplicity
}

// Start the application
init();

// Export for testing
export { createConnection, scanQRCode, closeConnection, updateUI, showAlert };
