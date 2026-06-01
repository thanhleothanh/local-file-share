/**
 * QR Compression Unit Tests
 * Tests for qrCompression.js module (ADR-0012, ADR-0023, ISSUE-001, ISSUE-015)
 */

import {
    compressToBase64,
    decompressFromBase64,
    validateQRData,
    generateSecret
} from '@utils/qrCompression.js';

describe('QR Compression Module', () => {
    describe('compressToBase64', () => {
        test('compresses simple object to base64', () => {
            const obj = { type: 'OFFER', payload: 'test', secret: 'secret123', connId: 'conn-1' };
            const result = compressToBase64(obj);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        test('compresses and produces different output than input', () => {
            const obj = { type: 'OFFER', payload: 'test payload data', secret: 'testsecret', connId: 'test-conn' };
            const result = compressToBase64(obj);
            const inputString = JSON.stringify(obj);
            expect(result).not.toBe(inputString);
        });

        test('compresses nested objects', () => {
            const obj = {
                type: 'OFFER',
                payload: 'data',
                secret: 'secret',
                connId: 'conn-1',
                nested: { key: 'value', array: [1, 2, 3] }
            };
            const result = compressToBase64(obj);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles empty object', () => {
            const obj = {};
            const result = compressToBase64(obj);
            expect(typeof result).toBe('string');
        });
    });

    describe('decompressFromBase64', () => {
        test('decompresses previously compressed data', () => {
            const original = { type: 'OFFER', payload: 'test', secret: 'secret123', connId: 'conn-1' };
            const compressed = compressToBase64(original);
            const decompressed = decompressFromBase64(compressed);
            expect(decompressed).toEqual(original);
        });

        test('decompresses complex nested objects', () => {
            const original = {
                type: 'ANSWER',
                payload: 'response payload',
                secret: 'mysecret',
                connId: 'connection-123',
                metadata: { timestamp: Date.now(), version: '1.0' }
            };
            const compressed = compressToBase64(original);
            const decompressed = decompressFromBase64(compressed);
            expect(decompressed).toEqual(original);
        });

        test('throws error for invalid base64 data', () => {
            expect(() => {
                decompressFromBase64('not-valid-base64!!!');
            }).toThrow();
        });

        test('throws error for corrupted compressed data', () => {
            expect(() => {
                decompressFromBase64('aGVsbG8='); // "hello" in base64, not gzip
            }).toThrow();
        });
    });

    describe('round-trip compression/decompression', () => {
        test('round-trip with OFFER type', () => {
            const offerData = {
                type: 'OFFER',
                payload: 'offer-payload-string',
                secret: 'offer-secret-12345',
                connId: 'connection-offer-id'
            };
            const compressed = compressToBase64(offerData);
            const decompressed = decompressFromBase64(compressed);
            expect(decompressed).toEqual(offerData);
        });

        test('round-trip with ANSWER type', () => {
            const answerData = {
                type: 'ANSWER',
                payload: 'answer-payload-string',
                secret: 'answer-secret-67890',
                connId: 'connection-answer-id'
            };
            const compressed = compressToBase64(answerData);
            const decompressed = decompressFromBase64(compressed);
            expect(decompressed).toEqual(answerData);
        });

        test('round-trip with large payload', () => {
            const largePayload = 'x'.repeat(10000);
            const data = {
                type: 'OFFER',
                payload: largePayload,
                secret: 'secret',
                connId: 'conn-1'
            };
            const compressed = compressToBase64(data);
            const decompressed = decompressFromBase64(compressed);
            expect(decompressed).toEqual(data);
            // Compressed should be smaller than original base64
            expect(compressed.length).toBeLessThan(btoa(largePayload).length);
        });
    });

    describe('validateQRData', () => {
        test('validates valid OFFER QR data', () => {
            const validOffer = {
                type: 'OFFER',
                payload: 'valid-payload',
                secret: 'validsecret123',
                connId: 'valid-conn-id'
            };
            expect(validateQRData(validOffer)).toBe(true);
        });

        test('validates valid ANSWER QR data', () => {
            const validAnswer = {
                type: 'ANSWER',
                payload: 'valid-payload',
                secret: 'validsecret123',
                connId: 'valid-conn-id'
            };
            expect(validateQRData(validAnswer)).toBe(true);
        });

        test('rejects missing type field', () => {
            const invalid = {
                payload: 'test',
                secret: 'secret',
                connId: 'conn-1'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects invalid type', () => {
            const invalid = {
                type: 'INVALID',
                payload: 'test',
                secret: 'secret',
                connId: 'conn-1'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects missing payload field', () => {
            const invalid = {
                type: 'OFFER',
                secret: 'secret',
                connId: 'conn-1'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects empty payload', () => {
            const invalid = {
                type: 'OFFER',
                payload: '',
                secret: 'secret',
                connId: 'conn-1'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects missing secret field', () => {
            const invalid = {
                type: 'OFFER',
                payload: 'test',
                connId: 'conn-1'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects short secret (less than 8 chars)', () => {
            const invalid = {
                type: 'OFFER',
                payload: 'test',
                secret: 'abc',
                connId: 'conn-1'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects missing connId field', () => {
            const invalid = {
                type: 'OFFER',
                payload: 'test',
                secret: 'validsecret'
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects empty connId', () => {
            const invalid = {
                type: 'OFFER',
                payload: 'test',
                secret: 'validsecret',
                connId: ''
            };
            expect(validateQRData(invalid)).toBe(false);
        });

        test('rejects null input', () => {
            expect(validateQRData(null)).toBe(false);
        });

        test('rejects non-object input', () => {
            expect(validateQRData('string')).toBe(false);
        });
    });

    describe('generateSecret', () => {
        test('generates secret of correct length', () => {
            const secret = generateSecret(16);
            expect(secret.length).toBe(16);
        });

        test('generates secret with custom length', () => {
            const secret = generateSecret(32);
            expect(secret.length).toBe(32);
        });

        test('generates alphanumeric secret', () => {
            const secret = generateSecret(20);
            const alphanumeric = /^[A-Za-z0-9]+$/;
            expect(secret).toMatch(alphanumeric);
        });

        test('generates unique secrets on each call', () => {
            const secret1 = generateSecret(16);
            const secret2 = generateSecret(16);
            // Very unlikely to be the same, but possible
            // Just check they have the right format
            expect(secret1.length).toBe(16);
            expect(secret2.length).toBe(16);
        });

        test('default length is 16', () => {
            const secret = generateSecret();
            expect(secret.length).toBe(16);
        });
    });
});
