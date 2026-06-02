/**
 * Main Application Entry Point
 * Orchestrates the QR code connection handshake and WebRTC management
 */

import {
  webrtcManager,
  ConnectionState,
  setFileTransferManager,
} from '@modules/webrtcManager.js';
import { qrHandler } from '@modules/qrHandler.js';
import { fileTransferManager, FileState } from '@modules/fileTransfer.js';
import { chunkHandler } from '@utils/chunkHandler.js';
import { errorHandler } from '@utils/errorHandler.js';
import { storageManager } from '@utils/storage.js';

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const offerQRCanvas = document.getElementById('offerQRCanvas');
const answerQRCanvas = document.getElementById('answerQRCanvas');
const scannerVideo = document.getElementById('scannerVideo');
const answerScannerVideo = document.getElementById('answerScannerVideo');
const connectionAlert = document.getElementById('connectionAlert');
const myDeviceType = document.getElementById('myDeviceType');
const stepDots = document.querySelectorAll('.step-dot');
const stepLines = document.querySelectorAll('.step-line');
const stepPanes = {
  1: document.getElementById('step1Pane'),
  2: document.getElementById('step2Pane'),
  3: document.getElementById('step3Pane'),
};
const step1Idle = document.getElementById('step1Idle');
const step1Initiator = document.getElementById('step1Initiator');
const step1Joiner = document.getElementById('step1Joiner');
const step2Initiator = document.getElementById('step2Initiator');
const step2Joiner = document.getElementById('step2Joiner');

// File UI Elements
const fileInput = document.getElementById('fileInput');
const sendFilesBtn = document.getElementById('sendFilesBtn');
const filesAlert = document.getElementById('filesAlert');
const fileList = document.getElementById('fileList');

// State management
let currentScanMode = null; // 'OFFER' or 'ANSWER'
let offerQRData = null;
let connectionRole = 'idle'; // 'idle' | 'initiator' | 'joiner'
let currentStep = 1; // 1 | 2 | 3
let answerScannerActive = false; // tracks the step-2-initiator camera

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
 * Update UI based on connection state and connectionRole/currentStep.
 * Drives both the 3-dot progress bar and the per-step content panes.
 * @param {string} [oldState] - Previous connection state (only used to
 *   detect genuine CLOSED transitions; defaults to the current state).
 */
function updateUI(oldState = webrtcManager.state) {
  // Sync our step/role state to the underlying WebRTC state.
  const state = webrtcManager.state;
  const isConnected = webrtcManager.isConnected();

  if (
    state === ConnectionState.CONNECTED ||
    state === ConnectionState.TRANSFERRING
  ) {
    currentStep = 3;
  } else if (
    state === ConnectionState.CLOSED &&
    oldState !== ConnectionState.CLOSED
  ) {
    // Genuine transition into CLOSED (user clicked Disconnect, peer
    // left, or we closed a live connection). Reset to step 1 / idle.
    // Skipping the reset when we were already CLOSED avoids
    // clobbering the role we just set in createConnection /
    // scanOfferQR before calling close() to clean up.
    connectionRole = 'idle';
    currentStep = 1;
    offerQRData = null;
    currentScanMode = null;
  } else if (state === ConnectionState.FAILED) {
    // Stay on whichever step we were on, but surface the error.
  }

  renderStepProgress();
  renderStepContent();
  renderDeviceInfo();

  // Auto-start/stop the step-2-initiator scanner based on which view
  // is currently visible. The scanner's video element lives inside
  // #step2Initiator and the user never has to tap a button to open
  // it — the camera just comes on when they reach this view and goes
  // off again when they leave it.
  const wantAnswerScanner = currentStep === 2 && connectionRole === 'initiator';
  if (wantAnswerScanner && !answerScannerActive) {
    scanAnswerQR();
  } else if (!wantAnswerScanner && answerScannerActive) {
    stopAnswerScanner();
  }

  // Files header `+` button: visible only while the connection is
  // CONNECTED. The button is hidden — not disabled — so a missing
  // button signals "nothing to do" cleanly.
  sendFilesBtn.hidden = !isConnected;

  renderFileList();
}

/**
 * Highlight the active/completed steps in the dot progress bar.
 */
function renderStepProgress() {
  stepDots.forEach((dot) => {
    const n = Number(dot.dataset.step);
    dot.classList.toggle('active', n === currentStep);
    dot.classList.toggle('completed', n < currentStep);
  });
  stepLines.forEach((line) => {
    const n = Number(line.dataset.line);
    line.classList.toggle('active', n < currentStep);
  });
}

/**
 * Show only the active step pane and, within it, the role-appropriate
 * sub-section (idle / initiator / joiner).
 */
function renderStepContent() {
  for (const n of [1, 2, 3]) {
    stepPanes[n].hidden = currentStep !== n;
  }

  if (currentStep === 1) {
    step1Idle.hidden = connectionRole !== 'idle';
    step1Initiator.hidden = connectionRole !== 'initiator';
    step1Joiner.hidden = connectionRole !== 'joiner';
  } else if (currentStep === 2) {
    step2Initiator.hidden = connectionRole !== 'initiator';
    step2Joiner.hidden = connectionRole !== 'joiner';
  }
}

/**
 * Populate the local device info on the step 3 device card.
 * Peer card stays a generic placeholder — device-type is not exchanged
 * over the control channel by design (per "no functionality changes").
 */
function renderDeviceInfo() {
  if (currentStep !== 3) return;
  myDeviceType.textContent = getDeviceType();
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
    buttons.push(
      `<button class="btn btn-primary" onclick="acceptFileOffer('${file.fileId}')">Accept</button>`,
    );
    buttons.push(
      `<button class="btn btn-danger" onclick="rejectFileOffer('${file.fileId}')">Reject</button>`,
    );
  } else if (file.state === FileState.QUEUED && isSend) {
    buttons.push(
      `<button class="btn btn-danger" onclick="cancelQueuedFile('${file.fileId}')">Remove</button>`,
    );
  } else if (file.state === FileState.PENDING && isSend) {
    buttons.push(
      `<button class="btn btn-danger" onclick="cancelFileOffer('${file.fileId}')">Cancel</button>`,
    );
  } else if (file.state === FileState.FAILED && isSend) {
    buttons.push(
      `<button class="btn btn-primary" onclick="retryFile('${file.fileId}')">Retry</button>`,
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
 * Initiator path: create a new connection and render the offer QR.
 * Sets connectionRole='initiator' and currentStep=1 (offer QR shown
 * until the user clicks "Proceed to scan Answer QR"
 * to advance to step 2).
 */
async function createConnection() {
  try {
    // Close any existing connection first (ADR-0017: 1:1 connections only)
    if (webrtcManager.state !== ConnectionState.CLOSED) {
      await webrtcManager.close();
    }

    const result = await webrtcManager.generateOfferQR();
    offerQRData = result.qrData;
    currentScanMode = null;
    connectionRole = 'initiator';
    currentStep = 1;

    await qrHandler.renderQRCodeToCanvas(offerQRData, offerQRCanvas);
    updateUI();
  } catch (error) {
    console.error('Failed to create connection:', error);
    showAlert('Failed to create connection: ' + error.message);
  }
}

/**
 * Joiner path: open the camera and scan an offer QR.
 * Sets connectionRole='joiner' and currentStep=1 (scanner view).
 * On successful scan, advances to step 2 (show answer QR).
 */
async function scanOfferQR() {
  try {
    if (qrHandler.isScanning()) {
      qrHandler.stopScanning();
    }

    // Close any existing connection first (ADR-0017)
    if (webrtcManager.state !== ConnectionState.CLOSED) {
      await webrtcManager.close();
      offerQRData = null;
    }

    currentScanMode = 'OFFER';
    connectionRole = 'joiner';
    currentStep = 1;
    updateUI();

    await qrHandler.startScanning(
      scannerVideo,
      (qrData) => {
        qrHandler.stopScanning();
        handleQRScanResult(qrData, 'OFFER');
      },
      (error) => {
        console.error('Scan error:', error);
        showAlert('Scan error: ' + error.message);
        qrHandler.stopScanning();
        // Roll back to idle so the user can try again.
        connectionRole = 'idle';
        currentStep = 1;
        updateUI();
      },
    );
  } catch (error) {
    console.error('Failed to start scanning:', error);
    showAlert('Failed to access camera: ' + error.message);
    qrHandler.stopScanning();
    connectionRole = 'idle';
    currentStep = 1;
    updateUI();
  }
}

/**
 * Initiator at step 2: open the camera and scan the answer QR.
 * Called automatically by updateUI() when the step-2-initiator view
 * becomes visible — no button click required.
 */
async function scanAnswerQR() {
  if (answerScannerActive) return;
  answerScannerActive = true;
  currentScanMode = 'ANSWER';

  try {
    await qrHandler.startScanning(
      answerScannerVideo,
      (qrData) => {
        qrHandler.stopScanning();
        // On success, the WebRTC state listener will set
        // currentStep = 3 and the wantAnswerScanner check in
        // updateUI() will call stopAnswerScanner().
        handleQRScanResult(qrData, 'ANSWER');
      },
      (error) => {
        console.error('Scan error:', error);
        showAlert('Scan error: ' + error.message);
        qrHandler.stopScanning();
        stopAnswerScanner();
      },
    );
  } catch (error) {
    console.error('Failed to start scanning:', error);
    showAlert('Failed to access camera: ' + error.message);
    qrHandler.stopScanning();
    stopAnswerScanner();
  }
}

/**
 * Stop the step-2-initiator camera and clear the video source. Safe to
 * call even if the scanner isn't running.
 */
function stopAnswerScanner() {
  answerScannerActive = false;
  if (answerScannerVideo && answerScannerVideo.srcObject) {
    answerScannerVideo.srcObject.getTracks().forEach((t) => t.stop());
    answerScannerVideo.srcObject = null;
  }
}

/**
 * Stop every scanner/camera the Connection tab might have running
 * (offer scan via qrHandler, answer scan via stopAnswerScanner). Safe
 * to call when nothing is active.
 */
function stopAllScanners() {
  qrHandler.stopScanning();
  stopAnswerScanner();
}

/**
 * Close the underlying WebRTC connection. WebRTC-specific concern:
 * tears down the peer connection and data channels. Does NOT touch
 * any UI state — callers compose this with `resetToIdle()` if they
 * also want the panel to drop back to step 1.
 */
async function teardownConnection() {
  await webrtcManager.close();
}

/**
 * Reset the Connection tab's local state to step 1 / idle: clear
 * the handshake variables, stop any in-progress scans, and re-render.
 * Does NOT touch the WebRTC connection itself — for a full teardown
 * use `disconnect()` (which composes this with `teardownConnection()`).
 */
function resetToIdle() {
  offerQRData = null;
  currentScanMode = null;
  stopAllScanners();
  connectionRole = 'idle';
  currentStep = 1;
  updateUI();
}

/**
 * Full "end the session" path. The in-app equivalent of reloading
 * the page: closes the WebRTC connection AND resets the UI to
 * step 1 / idle. The user-facing UX deliberately doesn't expose this
 * (per the step-3 "Reload the page to disconnect" hint), but the
 * function exists as a composition root and is exported for tests
 * and any future programmatic use.
 */
async function disconnect() {
  await teardownConnection();
  resetToIdle();
}

/**
 * Cancel an in-progress offer scan (joiner wants to back out of step 1).
 * Just resets the local UI — any in-flight WebRTC state is left alone
 * and will be torn down on the next createConnection / scanOfferQR.
 */
function cancelScanOffer() {
  resetToIdle();
}

/**
 * Cancel an in-flight offer creation. Discards the offer QR (the user
 * is no longer showing it) and returns to the step 1 choice screen.
 * Just resets the local UI — the WebRTC state stays at NEW and will
 * be torn down on the next createConnection / scanOfferQR.
 */
function cancelOfferCreation() {
  resetToIdle();
}

/**
 * Cancel an in-progress answer scan and abandon the in-flight offer.
 * Just resets the local UI — the WebRTC state is left as-is.
 */
function cancelAnswerScan() {
  resetToIdle();
}

/**
 * Initiator confirms they have shown the offer QR; advance to step 2
 * (scan answer). Per design decision: this is a manual advance so the
 * joiner has a guaranteed window to scan the offer.
 */
function goToStep2FromInitiator() {
  if (connectionRole !== 'initiator' || currentStep !== 1) return;
  currentStep = 2;
  updateUI();
}

/**
 * Handle the result of a QR code scan.
 * @param {Object} qrData - Parsed QR data
 * @param {string} mode - Expected mode ('OFFER' or 'ANSWER')
 */
async function handleQRScanResult(qrData, mode) {
  try {
    if (qrData.type === 'OFFER' && mode === 'OFFER') {
      const result = await webrtcManager.processOfferQR(qrData);
      currentScanMode = 'OFFER';
      connectionRole = 'joiner';
      currentStep = 2;
      await qrHandler.renderQRCodeToCanvas(result.qrData, answerQRCanvas);
      // Intentionally no "Offer received!" success alert here — the
      // step 1 -> step 2 transition with the answer QR appearing is
      // the signal. A green dialog here would be redundant with the
      // prompt "Show this QR to the other device" already shown on
      // step 2.
      updateUI();
    } else if (qrData.type === 'ANSWER' && mode === 'ANSWER') {
      await webrtcManager.processAnswerQR(qrData);
      // Step transition happens via the WebRTC state listener (CONNECTED → step 3).
      // Intentionally no "Connecting…" alert here — only the initiator
      // would see it, which creates a brief UI asymmetry with the
      // joiner. The dot progress bar moving to step 3 is the signal.
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
    // Peer-disconnect lifecycle event. Reset the UI right away so it
    // matches what the other device sees (a clean reload). No
    // showAlert: the dot progress bar jumping back to step 1 is the
    // signal, and a delayed "Connection failed" / "ICE negotiation
    // failed" dialog would be asymmetric across the two devices and
    // not actionable for the user.
    resetToIdle();
    return;
  }

  // Stop any in-progress scan if the underlying connection went away.
  if (newState === ConnectionState.CLOSED) {
    qrHandler.stopScanning();
    stopAnswerScanner();
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
  const validFiles = files.filter((f) => f.size <= MAX);
  if (validFiles.length === 0) {
    showFilesAlert(
      'No valid files selected (check file size - max 500MB)',
      'error',
    );
    event.target.value = '';
    return;
  }
  if (validFiles.length < files.length) {
    showFilesAlert(
      `${files.length - validFiles.length} file(s) skipped (too large)`,
      'error',
    );
  }

  try {
    const transfers = await fileTransferManager.selectFiles(validFiles, {
      sendImmediately: true,
    });
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
    showFilesAlert(
      `File offer received: ${file.name} (${formatFileSize(file.size)})`,
      'success',
    );
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
    showFilesAlert(
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
  chunkHandler
    .getFileData(fileId)
    .then((data) => {
      if (data) {
        createDownloadLink(file, data);
        showFilesAlert(`Downloaded: ${file.name}`, 'success');
      } else {
        showFilesAlert(
          'File data not available. File may have been cleaned up.',
          'error',
        );
      }
    })
    .catch((error) => {
      showFilesAlert('Failed to download: ' + error.message, 'error');
    });
}

// Start the application
init();

// Expose handlers to window for inline onclick="..." in index.html (module scope is not global)
window.createConnection = createConnection;
window.scanOfferQR = scanOfferQR;
window.scanAnswerQR = scanAnswerQR;
window.goToStep2FromInitiator = goToStep2FromInitiator;
window.cancelScanOffer = cancelScanOffer;
window.cancelOfferCreation = cancelOfferCreation;
window.cancelAnswerScan = cancelAnswerScan;
window.acceptFileOffer = acceptFileOffer;
window.rejectFileOffer = rejectFileOffer;
window.downloadFile = downloadFile;
window.cancelFileOffer = cancelFileOffer;
window.cancelQueuedFile = cancelQueuedFile;
window.retryFile = retryFile;

// Wire the Files header `+` button to the hidden file input. The
// button is `hidden` (not `disabled`) when the connection is not
// CONNECTED, so we don't need a disabled check here — a hidden
// element cannot receive clicks.
sendFilesBtn.addEventListener('click', () => {
  fileInput.click();
});

// Export for testing
export {
  createConnection,
  scanOfferQR,
  scanAnswerQR,
  goToStep2FromInitiator,
  cancelScanOffer,
  cancelOfferCreation,
  cancelAnswerScan,
  disconnect,
  teardownConnection,
  resetToIdle,
  updateUI,
  showAlert,
  formatFileSize,
};
