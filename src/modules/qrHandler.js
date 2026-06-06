/**
 * QR Handler Module
 * Handles QR code generation and scanning using zxing-js/browser
 * (ADR-0016, ADR-0022)
 */

import { BrowserQRCodeReader, BrowserQRCodeSvgWriter } from '@zxing/browser';
import { EncodeHintType } from '@zxing/library';
import { compressToBase64, decompressFromBase64, validateQRData, generateSecret } from '@utils/qrCompression.js';
import { errorHandler } from '@utils/errorHandler.js';

/**
 * QR Handler class
 * Manages QR code generation and scanning
 */
export class QRHandler {
    constructor() {
        this.qrCodeReader = null;
        this.qrCodeWriter = new BrowserQRCodeSvgWriter();
        this.scanning = false;
        this.scannerVideoElement = null;
        this.scannerStream = null;
        this.scannerControls = null;
    }

    /**
     * Initialize the QR code reader
     * @returns {Promise<BrowserQRCodeReader>}
     */
    async initReader() {
        if (!this.qrCodeReader) {
            this.qrCodeReader = new BrowserQRCodeReader();
        }
        return this.qrCodeReader;
    }

    /**
     * Generate a QR code as an SVG string
     * @param {Object} qrData - Data to encode
     * @param {number} width - SVG width in pixels (default: 400)
     * @param {number} height - SVG height in pixels (default: 400)
     * @returns {Promise<string>} SVG string
     */
    async generateQRCode(qrData, width = 400, height = 400) {
        try {
            const dataString = JSON.stringify(qrData);

            // The zxing default quiet zone is 4 modules on every side. That
            // eats a lot of the visible canvas as white padding. 2 modules
            // is still within the QR spec's tolerance for scanning while
            // letting the modules fill more of the available space.
            const hints = new Map();
            hints.set(EncodeHintType.MARGIN, 2);

            const svgElement = this.qrCodeWriter.write(dataString, width, height, hints);

            const svg = new XMLSerializer().serializeToString(svgElement);

            return svg;
        } catch (error) {
            console.error('Failed to generate QR code:', error);
            throw new Error('Failed to generate QR code: ' + error.message);
        }
    }

    /**
     * Generate QR code and render to canvas
     * @param {Object} qrData - QR code data object
     * @param {HTMLCanvasElement} canvas - Canvas element to render to
     * @param {number} width - Canvas width (default: 400)
     * @param {number} height - Canvas height (default: 400)
     * @returns {Promise<void>}
     */
    async renderQRCodeToCanvas(qrData, canvas, width = 400, height = 400) {
        try {
            const svg = await this.generateQRCode(qrData, width, height);

            const ctx = canvas.getContext('2d');
            const img = new Image();
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            await new Promise((resolve, reject) => {
                img.onload = () => {
                    canvas.width = width;
                    canvas.height = height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = (err) => {
                    URL.revokeObjectURL(url);
                    reject(err);
                };
                img.src = url;
            });
        } catch (error) {
            console.error('Failed to render QR code to canvas:', error);
            throw error;
        }
    }

    /**
     * Start scanning QR codes from camera
     * @param {HTMLVideoElement} videoElement - Video element for camera preview
     * @param {Function} onResult - Callback when QR code is scanned
     * @param {Function} onError - Callback on error
     * @returns {Promise<void>}
     */
    async startScanning(videoElement, onResult, onError) {
        if (this.scanning) {
            console.warn('Already scanning');
            return;
        }

        try {
            this.scanning = true;
            this.scannerVideoElement = videoElement;
            
            // Get camera stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Prefer rear camera on mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.scannerStream = stream;
            videoElement.srcObject = stream;
            await videoElement.play().catch(e => console.warn('Video play error:', e));
            
            // Initialize reader
            await this.initReader();
            
            // Use continuous decoding from video device
            const reader = this.qrCodeReader;
            
            // decodeFromVideoDevice runs continuously until controls.stop() is called
            await reader.decodeFromVideoDevice(
                undefined,
                videoElement,
                (result, error, controls) => {
                    // Store controls on first callback so we can stop later
                    if (!this.scannerControls) {
                        this.scannerControls = controls;
                    }
                    if (result && this.scanning) {
                        this.scanning = false;
                        this.handleScanResult(result, onResult, onError);
                    }
                    // On error, continue scanning (do nothing)
                }
            );

        } catch (error) {
            console.error('Failed to start scanning:', error);
            this.scanning = false;
            // Re-throw so the caller can react to camera failures
            // (e.g. permission denied) without relying on the
            // onError callback, which is reserved for decode-time
            // errors from handleScanResult.
            throw error;
        }
    }

    /**
     * Decode a QR code from a user-supplied image file.
     * Available at every scan point as an alternative to the
     * camera path (ADR-0031). The file is processed entirely
     * in the browser via the existing reader; no network
     * round-trip. The result is routed through the same
     * validation pipeline as a camera scan, so the two paths
     * can never diverge in what counts as a "valid" QR.
     *
     * @param {File} file - Image file picked by the user
     * @param {Function} onResult - Callback when a valid QR is decoded
     * @param {Function} onError - Callback on decode/validation error
     * @returns {Promise<void>}
     */
    async scanFromImageFile(file, onResult, onError) {
        const url = URL.createObjectURL(file);
        try {
            await this.initReader();
            const result = await this.qrCodeReader.decodeFromImageUrl(url);
            this.handleScanResult(result, onResult, onError);
        } catch (error) {
            if (onError) {
                onError(error);
            }
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Handle a scanned QR code result
     * @param {Object} result - Scan result from zxing
     * @param {Function} onResult - Callback for valid results
     * @param {Function} onError - Callback for errors
     */
    handleScanResult(result, onResult, onError) {
        try {
            // Parse the QR data
            const text = result.getText();
            let qrData;
            
            try {
                qrData = JSON.parse(text);
            } catch (parseError) {
                errorHandler.handleQRError(parseError);
                throw new Error('Invalid QR code: not valid JSON');
            }
            
            // Validate QR data structure
            if (!validateQRData(qrData)) {
                errorHandler.handleQRError(
                    new Error('Invalid QR code: missing required fields or invalid structure')
                );
                throw new Error('Invalid QR code: missing required fields or invalid structure');
            }
            
            // Stop scanning on successful result
            this.stopScanning();
            
            // Notify caller
            if (onResult) {
                onResult(qrData);
            }
            
        } catch (error) {
            console.error('Scan result error:', error);
            this.scanning = false;
            errorHandler.handleQRError(error);
            if (onError) {
                onError(error);
            }
        }
    }

    /**
     * Stop scanning QR codes
     */
    stopScanning() {
        if (!this.scanning && !this.scannerControls) {
            return;
        }

        this.scanning = false;

        if (this.scannerControls) {
            try {
                this.scannerControls.stop();
            } catch (e) {
                // Controls may already be stopped
            }
            this.scannerControls = null;
        }

        if (this.scannerStream) {
            this.scannerStream.getTracks().forEach(track => {
                try {
                    track.stop();
                } catch (e) {
                    // Track may already be stopped
                }
            });
            this.scannerStream = null;
        }

        if (this.scannerVideoElement) {
            this.scannerVideoElement.srcObject = null;
            this.scannerVideoElement = null;
        }
    }

    /**
     * Check if currently scanning
     * @returns {boolean}
     */
    isScanning() {
        return this.scanning;
    }

    /**
     * Create an offer QR code (convenience method)
     * @param {string} connId - Connection ID
     * @param {string} secret - Connection secret
     * @param {string} sdp - SDP offer
     * @param {Array} iceCandidates - ICE candidates
     * @returns {Object} QR code data
     */
    createOfferQR(connId, secret, sdp, iceCandidates) {
        const payload = compressToBase64({
            sdp,
            ice: iceCandidates
        });
        
        return {
            type: 'OFFER',
            payload,
            secret,
            connId
        };
    }

    /**
     * Create an answer QR code (convenience method)
     * @param {string} connId - Connection ID
     * @param {string} secret - Connection secret
     * @param {string} sdp - SDP answer
     * @param {Array} iceCandidates - ICE candidates
     * @returns {Object} QR code data
     */
    createAnswerQR(connId, secret, sdp, iceCandidates) {
        const payload = compressToBase64({
            sdp,
            ice: iceCandidates
        });
        
        return {
            type: 'ANSWER',
            payload,
            secret,
            connId
        };
    }

    /**
     * Decode and validate a scanned QR code
     * @param {string} text - Raw QR code text
     * @returns {Object} Parsed and validated QR data
     * @throws {Error} If QR code is invalid
     */
    decodeQRCode(text) {
        try {
            const qrData = JSON.parse(text);
            
            if (!validateQRData(qrData)) {
                throw new Error('Invalid QR code structure');
            }
            
            return qrData;
        } catch (error) {
            throw new Error('Invalid QR code: ' + error.message);
        }
    }
}

// Singleton instance
export const qrHandler = new QRHandler();
