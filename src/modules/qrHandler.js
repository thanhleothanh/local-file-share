/**
 * QR Handler Module
 * Handles QR code generation and scanning using zxing-js/browser
 * (ADR-0016, ADR-0022)
 */

import { BrowserQRCodeReader, BrowserQRCodeSvgWriter } from '@zxing/browser';
import { compressToBase64, decompressFromBase64, validateQRData, generateSecret } from '../utils/qrCompression.js';

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
     * Generate a QR code SVG from data
     * @param {Object} qrData - QR code data object
     * @param {number} width - Canvas width (default: 300)
     * @param {number} height - Canvas height (default: 300)
     * @returns {Promise<string>} SVG string
     */
    async generateQRCode(qrData, width = 300, height = 300) {
        try {
            // Convert data to JSON string
            const dataString = JSON.stringify(qrData);
            
            // Create SVG
            const svg = this.qrCodeWriter.write(dataString, width, height);
            
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
     * @param {number} width - Canvas width (default: 300)
     * @param {number} height - Canvas height (default: 300)
     * @returns {Promise<void>}
     */
    async renderQRCodeToCanvas(qrData, canvas, width = 300, height = 300) {
        try {
            const svg = await this.generateQRCode(qrData, width, height);
            
            // Parse SVG and draw to canvas
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    canvas.width = width;
                    canvas.height = height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve();
                };
                img.onerror = reject;
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
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
            
            const decodeContinuously = async (reader, videoElement, onResult, onError) => {
                try {
                    const result = await reader.decodeFromVideoDevice(
                        undefined,
                        videoElement,
                        (result, error, stats) => {
                            if (result) {
                                this.scanning = false;
                                this.handleScanResult(result, onResult, onError);
                            }
                            if (error) {
                                // Continue scanning on error
                            }
                        }
                    );
                    
                    if (result) {
                        this.scanning = false;
                        this.handleScanResult(result, onResult, onError);
                    }
                } catch (error) {
                    // Continue scanning on error
                }
                
                if (this.scanning) {
                    setTimeout(() => decodeContinuously(reader, videoElement, onResult, onError), 100);
                }
            };
            
            decodeContinuously(reader, videoElement, onResult, onError);
            
        } catch (error) {
            console.error('Failed to start scanning:', error);
            this.scanning = false;
            if (onError) {
                onError(error);
            }
            throw error;
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
                throw new Error('Invalid QR code: not valid JSON');
            }
            
            // Validate QR data structure
            if (!validateQRData(qrData)) {
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
            if (onError) {
                onError(error);
            }
        }
    }

    /**
     * Stop scanning QR codes
     */
    stopScanning() {
        if (!this.scanning) {
            return;
        }
        
        this.scanning = false;
        
        // Stop all video tracks
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
        
        // Clear video element
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
