/**
 * QRHandler Unit Tests
 * Tests for src/modules/qrHandler.js (ADR-0022, ADR-0031)
 */

import { jest } from '@jest/globals';
import { QRHandler } from '@modules/qrHandler.js';

describe('QRHandler', () => {
    describe('scanFromImageFile (ADR-0031)', () => {
        let handler;
        let file;
        let onResult;
        let onError;
        let decodeSpy;
        let createMock;
        let revokeMock;
        let originalCreate;
        let originalRevoke;
        const validQr = {
            type: 'OFFER',
            payload: 'p',
            secret: 'abcdefgh',
            connId: 'conn-1',
        };
        const BLOB_URL = 'blob:fake-url-1234';

        beforeEach(async () => {
            handler = new QRHandler();
            file = new File(['fake image bytes'], 'qr.png', { type: 'image/png' });
            onResult = jest.fn();
            onError = jest.fn();

            await handler.initReader();
            decodeSpy = jest.spyOn(handler.qrCodeReader, 'decodeFromImageUrl')
                .mockResolvedValue({ getText: () => JSON.stringify(validQr) });

            originalCreate = URL.createObjectURL;
            originalRevoke = URL.revokeObjectURL;
            createMock = jest.fn().mockReturnValue(BLOB_URL);
            revokeMock = jest.fn();
            URL.createObjectURL = createMock;
            URL.revokeObjectURL = revokeMock;
        });

        afterEach(() => {
            decodeSpy.mockRestore();
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        });

        test('calls onResult with parsed QR data on successful decode', async () => {
            await handler.scanFromImageFile(file, onResult, onError);

            expect(onResult).toHaveBeenCalledWith(validQr);
            expect(onError).not.toHaveBeenCalled();
        });

        test('calls qrCodeReader.decodeFromImageUrl with the Blob URL of the file', async () => {
            await handler.scanFromImageFile(file, onResult, onError);

            expect(createMock).toHaveBeenCalledWith(file);
            expect(decodeSpy).toHaveBeenCalledWith(BLOB_URL);
        });

        test('revokes the Blob URL after a successful decode', async () => {
            await handler.scanFromImageFile(file, onResult, onError);

            expect(revokeMock).toHaveBeenCalledWith(BLOB_URL);
        });

        test('calls onError when zxing throws and still revokes the Blob URL', async () => {
            decodeSpy.mockRejectedValueOnce(new Error('No QR code found'));

            await handler.scanFromImageFile(file, onResult, onError);

            expect(onError).toHaveBeenCalledTimes(1);
            expect(onError.mock.calls[0][0].message).toBe('No QR code found');
            expect(onResult).not.toHaveBeenCalled();
            expect(revokeMock).toHaveBeenCalledWith(BLOB_URL);
        });
    });
});
