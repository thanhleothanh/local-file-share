/**
 * QR Code Compression Utilities
 * Handles gzip compression/decompression and base64 encoding for QR code payloads
 * Uses pako for gzip compression (ADR-0012, ADR-0023)
 */

import pako from 'pako';

/**
 * Compress an object to gzip + base64
 * @param {Object} obj - The object to compress
 * @returns {string} Base64 encoded compressed string
 */
export function compressToBase64(obj) {
    const jsonStr = JSON.stringify(obj);
    const rawData = new TextEncoder().encode(jsonStr);
    const compressed = pako.gzip(rawData, { to: 'string' });
    return btoa(String.fromCharCode(...new Uint8Array(compressed)));
}

/**
 * Decompress base64 gzip data to object
 * @param {string} base64Data - Base64 encoded compressed data
 * @returns {Object} The decompressed object
 * @throws {Error} If decompression fails
 */
export function decompressFromBase64(base64Data) {
    try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const decompressed = pako.ungzip(bytes, { to: 'string' });
        return JSON.parse(decompressed);
    } catch (error) {
        console.error('Decompression failed:', error);
        throw new Error('Failed to decompress QR payload: ' + error.message);
    }
}

/**
 * Validate QR data structure
 * @param {Object} qrData - Parsed QR code data
 * @returns {boolean} True if valid
 */
export function validateQRData(qrData) {
    if (!qrData || typeof qrData !== 'object') {
        return false;
    }
    
    const requiredFields = ['type', 'payload', 'secret', 'connId'];
    for (const field of requiredFields) {
        if (!(field in qrData)) {
            return false;
        }
    }
    
    if (!['OFFER', 'ANSWER'].includes(qrData.type)) {
        return false;
    }
    
    if (typeof qrData.payload !== 'string' || qrData.payload.length === 0) {
        return false;
    }
    
    if (typeof qrData.secret !== 'string' || qrData.secret.length < 8) {
        return false;
    }
    
    if (typeof qrData.connId !== 'string' || qrData.connId.length === 0) {
        return false;
    }
    
    return true;
}

/**
 * Generate a random secret for connection authentication
 * @param {number} length - Length of the secret (default: 16)
 * @returns {string} Random alphanumeric secret
 */
export function generateSecret(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const crypto = window.crypto || window.msCrypto;
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    
    return result;
}
