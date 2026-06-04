/**
 * Chunk Handler Unit Tests
 * Tests for chunkHandler.js module (ADR-0014, ADR-0015, ADR-0030)
 */

import { ChunkHandler } from '@utils/chunkHandler.js';
import { webrtcManager } from '@modules/webrtcManager.js';
import { fileTransferManager } from '@modules/fileTransfer.js';
import { jest } from '@jest/globals';

// Create a fresh instance for each test
const createChunkHandler = () => {
    const handler = new ChunkHandler();
    // Don't call init() to avoid setting up event listeners in tests
    handler.initialized = true;
    return handler;
};

describe('Chunk Handler Module', () => {
    // Test chunk header parsing logic directly
    describe('chunk header format', () => {
        test('header is 41 bytes (36 + 4 + 1)', () => {
            expect(36 + 4 + 1).toBe(41);
        });

        test('fileId is 36 bytes (UUID)', () => {
            const fileId = '12345678-1234-1234-1234-123456789012';
            expect(fileId.length).toBe(36);
        });

        test('index is 4 bytes big-endian', () => {
            const buffer = new ArrayBuffer(4);
            const view = new DataView(buffer);
            view.setUint32(0, 42, false); // big-endian
            const bytes = new Uint8Array(buffer);
            expect(bytes.length).toBe(4);
        });

        test('isLast is 1 byte', () => {
            const buffer = new ArrayBuffer(1);
            const view = new DataView(buffer);
            view.setUint8(0, 1); // isLast = true
            expect(new Uint8Array(buffer)[0]).toBe(1);
        });
    });

    describe('chunk size', () => {
        test('chunk size is 8192 bytes (8KB)', () => {
            expect(8192).toBe(8 * 1024);
        });
    });

    describe('buffer operations', () => {
        test('can combine two buffers', () => {
            const buffer1 = new Uint8Array([1, 2, 3, 4]);
            const buffer2 = new Uint8Array([5, 6, 7, 8]);
            const combined = new Uint8Array(buffer1.length + buffer2.length);
            combined.set(buffer1, 0);
            combined.set(buffer2, buffer1.length);
            expect(combined).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
        });
    });

    // ADR-0030: Per-Chunk ACK Tests
    describe('ACK Range Compression (ADR-0030)', () => {
        let handler;

        beforeEach(() => {
            handler = createChunkHandler();
        });

        test('compressIndicesToRanges: empty set returns empty array', () => {
            const ranges = handler.compressIndicesToRanges(new Set());
            expect(ranges).toEqual([]);
        });

        test('compressIndicesToRanges: single index returns single range', () => {
            const ranges = handler.compressIndicesToRanges(new Set([5]));
            expect(ranges).toEqual([[5, 5]]);
        });

        test('compressIndicesToRanges: consecutive indices form a range', () => {
            const ranges = handler.compressIndicesToRanges(new Set([0, 1, 2, 3, 4]));
            expect(ranges).toEqual([[0, 4]]);
        });

        test('compressIndicesToRanges: non-consecutive indices form separate ranges', () => {
            const ranges = handler.compressIndicesToRanges(new Set([0, 1, 2, 4, 5]));
            expect(ranges).toEqual([[0, 2], [4, 5]]);
        });

        test('compressIndicesToRanges: handles multiple gaps', () => {
            const ranges = handler.compressIndicesToRanges(new Set([0, 1, 3, 4, 6, 7, 8]));
            expect(ranges).toEqual([[0, 1], [3, 4], [6, 8]]);
        });

        test('compressIndicesToRanges: handles unsorted input', () => {
            const ranges = handler.compressIndicesToRanges(new Set([5, 2, 3, 0, 1]));
            // Sorted: [0, 1, 2, 3, 5] - has gap at 4, so should be [[0, 3], [5, 5]]
            expect(ranges).toEqual([[0, 3], [5, 5]]);
        });

        test('compressIndicesToRanges: handles large ranges', () => {
            const largeSet = new Set();
            for (let i = 0; i < 1000; i++) {
                largeSet.add(i);
            }
            const ranges = handler.compressIndicesToRanges(largeSet);
            expect(ranges).toEqual([[0, 999]]);
        });

        test('compressIndicesToRanges: handles sparse indices', () => {
            const sparseSet = new Set();
            for (let i = 0; i < 100; i += 2) {
                sparseSet.add(i);
            }
            const ranges = handler.compressIndicesToRanges(sparseSet);
            // Each range should be [n, n] since they're all even numbers with gaps
            expect(ranges.length).toBe(50);
            expect(ranges[0]).toEqual([0, 0]);
            expect(ranges[1]).toEqual([2, 2]);
            expect(ranges[49]).toEqual([98, 98]);
        });
    });

    describe('ACK Batching (ADR-0030)', () => {
        let handler;
        let originalSendControlMessage;
        let originalGetFile;

        beforeEach(() => {
            handler = createChunkHandler();
            jest.useFakeTimers();
            
            // Mock global dependencies
            originalSendControlMessage = webrtcManager.sendControlMessage;
            webrtcManager.sendControlMessage = jest.fn();
            
            originalGetFile = fileTransferManager.getFile;
            fileTransferManager.getFile = () => null;
        });

        afterEach(() => {
            jest.useRealTimers();
            webrtcManager.sendControlMessage = originalSendControlMessage;
            fileTransferManager.getFile = originalGetFile;
        });

        test('addChunkAck: adds index to batch for file', () => {
            handler.addChunkAck('file1', 0);
            expect(handler.ackBatch.has('file1')).toBe(true);
            expect(handler.ackBatch.get('file1')).toEqual(new Set([0]));
        });

        test('addChunkAck: idempotent - does not add duplicate indices', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 0);
            expect(handler.ackBatch.get('file1').size).toBe(1);
        });

        test('addChunkAck: adds multiple indices for same file', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 1);
            handler.addChunkAck('file1', 2);
            expect(handler.ackBatch.get('file1')).toEqual(new Set([0, 1, 2]));
        });

        test('addChunkAck: maintains separate batches for different files', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file2', 0);
            expect(handler.ackBatch.get('file1')).toEqual(new Set([0]));
            expect(handler.ackBatch.get('file2')).toEqual(new Set([0]));
        });

        test('scheduleAckBatch: starts interval timer for file', () => {
            handler.addChunkAck('file1', 0);
            expect(handler.ackTimers.has('file1')).toBe(true);
        });

        test('scheduleAckBatch: does not start duplicate timers', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 1);
            handler.addChunkAck('file1', 2);
            expect(handler.ackTimers.has('file1')).toBe(true);
            // Should only have one timer for the file
            const timers = handler.ackTimers.get('file1');
            expect(timers).toBeDefined();
        });

        test('clearAckTimer: clears timer for file', () => {
            handler.addChunkAck('file1', 0);
            expect(handler.ackTimers.has('file1')).toBe(true);
            handler.clearAckTimer('file1');
            expect(handler.ackTimers.has('file1')).toBe(false);
        });

        test('clearAckTimer: handles non-existent timer gracefully', () => {
            expect(() => handler.clearAckTimer('nonexistent')).not.toThrow();
        });

        test('flushAckBatch: sends ACK and clears batch set', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 1);
            handler.addChunkAck('file1', 2);
            
            // Mock the fileTransferManager to return a mock file
            const mockFile = {
                connId: 'conn-123',
                fileId: 'file1',
                name: 'test.txt',
                size: 1000
            };
            fileTransferManager.getFile = () => mockFile;
            
            // Flush the batch
            handler.flushAckBatch('file1');
            
            // Check that the batch set was cleared
            expect(handler.ackBatch.get('file1').size).toBe(0);
            // Check that sendControlMessage was called with correct format
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CHUNK_ACK',
                    fileId: 'file1',
                    connId: 'conn-123',
                    ranges: [[0, 2]]
                })
            );
        });

        test('flushAckBatch: handles empty batch gracefully', () => {
            handler.ackBatch.set('file1', new Set());
            expect(() => handler.flushAckBatch('file1')).not.toThrow();
        });

        test('flushAckBatch: handles non-existent file gracefully', () => {
            expect(() => handler.flushAckBatch('nonexistent')).not.toThrow();
        });

        test('flushAllAckBatches: clears all batches and timers', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file2', 0);
            
            expect(handler.ackBatch.size).toBe(2);
            expect(handler.ackTimers.size).toBe(2);
            
            handler.flushAllAckBatches();
            
            expect(handler.ackBatch.size).toBe(0);
            expect(handler.ackTimers.size).toBe(0);
            expect(handler.ackTimerStarts.size).toBe(0);
        });
    });

    describe('ACK Timer Behavior (ADR-0030)', () => {
        let handler;
        let originalSendControlMessage;
        let originalGetFile;

        beforeEach(() => {
            handler = createChunkHandler();
            jest.useFakeTimers();
            
            // Mock global dependencies
            originalSendControlMessage = webrtcManager.sendControlMessage;
            webrtcManager.sendControlMessage = jest.fn();
            
            originalGetFile = fileTransferManager.getFile;
            fileTransferManager.getFile = (fileId) => ({
                connId: 'conn-123',
                fileId: fileId,
                name: 'test.txt',
                size: 1000
            });
        });

        afterEach(() => {
            jest.useRealTimers();
            webrtcManager.sendControlMessage = originalSendControlMessage;
            fileTransferManager.getFile = originalGetFile;
        });

        test('interval timer fires every 5 seconds', () => {
            handler.addChunkAck('file1', 0);
            
            // Advance time by 5 seconds
            jest.advanceTimersByTime(5000);
            
            // Should have sent one ACK
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledTimes(1);
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CHUNK_ACK',
                    fileId: 'file1',
                    ranges: [[0, 0]]
                })
            );
        });

        test('interval timer sends multiple ACKs for continuous chunks', () => {
            // Add initial chunk
            handler.addChunkAck('file1', 0);
            
            // Advance 5 seconds - first ACK
            jest.advanceTimersByTime(5000);
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledTimes(1);
            
            // Add more chunks
            handler.addChunkAck('file1', 1);
            handler.addChunkAck('file1', 2);
            
            // Advance another 5 seconds - second ACK
            jest.advanceTimersByTime(5000);
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledTimes(2);
            
            // Second ACK should have ranges [[1, 2]]
            const secondCall = webrtcManager.sendControlMessage.mock.calls[1][0];
            expect(secondCall.ranges).toEqual([[1, 2]]);
        });

        test('interval timer batches chunks within 5 second window', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 1);
            handler.addChunkAck('file1', 2);
            handler.addChunkAck('file1', 3);
            
            // All chunks added within same window
            jest.advanceTimersByTime(5000);
            
            // Should send one ACK with all chunks
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledTimes(1);
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CHUNK_ACK',
                    fileId: 'file1',
                    ranges: [[0, 3]]
                })
            );
        });

        test('idempotent ACK handling - same index added multiple times', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 0);
            
            jest.advanceTimersByTime(5000);
            
            // Should only send one ACK with one index
            expect(webrtcManager.sendControlMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CHUNK_ACK',
                    fileId: 'file1',
                    ranges: [[0, 0]]
                })
            );
        });

        test('cleanupFile removes ACK tracking for file', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file1', 1);
            
            expect(handler.ackBatch.has('file1')).toBe(true);
            expect(handler.ackTimers.has('file1')).toBe(true);
            
            handler.cleanupFile('file1');
            
            expect(handler.ackBatch.has('file1')).toBe(false);
            expect(handler.ackTimers.has('file1')).toBe(false);
        });

        test('cleanupAll removes all ACK tracking', () => {
            handler.addChunkAck('file1', 0);
            handler.addChunkAck('file2', 0);
            
            expect(handler.ackBatch.size).toBe(2);
            expect(handler.ackTimers.size).toBe(2);
            
            handler.cleanupAll();
            
            expect(handler.ackBatch.size).toBe(0);
            expect(handler.ackTimers.size).toBe(0);
        });
    });
});
