/**
 * File State Machine Unit Tests
 * Tests for fileState.js module (ADR-0011, ISSUE-002)
 */

import { FileState, FileTransfer } from '../../src/utils/fileState.js';

describe('FileState Module', () => {
    test('FileState constants are defined', () => {
        expect(FileState.PENDING).toBe('PENDING');
        expect(FileState.QUEUED).toBe('QUEUED');
        expect(FileState.TRANSFERRING).toBe('TRANSFERRING');
        expect(FileState.COMPLETED).toBe('COMPLETED');
        expect(FileState.REJECTED).toBe('REJECTED');
        expect(FileState.FAILED).toBe('FAILED');
        expect(FileState.CANCELLED).toBe('CANCELLED');
    });

    describe('FileTransfer class', () => {
        const testInfo = {
            connId: 'conn-123',
            fileId: 'file-456',
            name: 'test.txt',
            size: 1024,
            mime: 'text/plain',
            direction: 'send'
        };

        test('creates file with PENDING state by default', () => {
            const file = new FileTransfer(testInfo);
            expect(file.state).toBe(FileState.PENDING);
            expect(file.connId).toBe(testInfo.connId);
            expect(file.fileId).toBe(testInfo.fileId);
            expect(file.name).toBe(testInfo.name);
            expect(file.size).toBe(testInfo.size);
        });

        test('calculates progress correctly', () => {
            const file = new FileTransfer({ ...testInfo, size: 1000 });
            file.updateProgress(500);
            expect(file.getProgress()).toBe(50);
        });

        test('handles zero-byte files', () => {
            const file = new FileTransfer({ ...testInfo, size: 0 });
            expect(file.getProgress()).toBe(100);
        });

        test('tracks chunk count', () => {
            const file = new FileTransfer(testInfo);
            file.updateChunks(5);
            expect(file.chunksReceived).toBe(5);
        });

        test('allows valid state transitions', () => {
            const file = new FileTransfer(testInfo);
            expect(file.transitionState(FileState.TRANSFERRING)).toBe(true);
            expect(file.transitionState(FileState.COMPLETED)).toBe(true);
            expect(file.state).toBe(FileState.COMPLETED);
        });

        test('rejects invalid state transitions', () => {
            const file = new FileTransfer(testInfo);
            expect(file.transitionState(FileState.COMPLETED)).toBe(false);
            expect(file.state).toBe(FileState.PENDING);
        });

        test('identifies terminal states', () => {
            const file = new FileTransfer(testInfo);
            expect(file.isTerminal()).toBe(false);
            // Valid path: PENDING -> TRANSFERRING -> COMPLETED
            file.transitionState(FileState.TRANSFERRING);
            file.transitionState(FileState.COMPLETED);
            expect(file.isTerminal()).toBe(true);
        });
    });
});
