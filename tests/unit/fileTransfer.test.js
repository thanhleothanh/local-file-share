/**
 * File Transfer Unit Tests
 * Tests for fileTransfer.js module (ADR-0030)
 */

import { FileTransferManager } from '@modules/fileTransfer.js';
import { webrtcManager } from '@modules/webrtcManager.js';

describe('File Transfer Module - ACK Handling (ADR-0030)', () => {
    let manager;
    let originalGetConnectionInfo;

    beforeEach(() => {
        manager = new FileTransferManager();
        // Mock the global webrtcManager's getConnectionInfo
        originalGetConnectionInfo = webrtcManager.getConnectionInfo;
        webrtcManager.getConnectionInfo = () => ({ connId: 'conn-123' });
    });

    afterEach(() => {
        // Restore original method
        webrtcManager.getConnectionInfo = originalGetConnectionInfo;
    });

    describe('expandRangesToIndices', () => {
        test('expands empty ranges to empty array', () => {
            const indices = manager.expandRangesToIndices([]);
            expect(indices).toEqual([]);
        });

        test('expands single range to array of indices', () => {
            const indices = manager.expandRangesToIndices([[0, 2]]);
            expect(indices).toEqual([0, 1, 2]);
        });

        test('expands multiple ranges to array of indices', () => {
            const indices = manager.expandRangesToIndices([[0, 2], [5, 7]]);
            expect(indices).toEqual([0, 1, 2, 5, 6, 7]);
        });

        test('expands single-index ranges', () => {
            const indices = manager.expandRangesToIndices([[0, 0], [2, 2], [5, 5]]);
            expect(indices).toEqual([0, 2, 5]);
        });

        test('expands large range', () => {
            const indices = manager.expandRangesToIndices([[0, 999]]);
            expect(indices.length).toBe(1000);
            expect(indices[0]).toBe(0);
            expect(indices[999]).toBe(999);
        });

        test('handles null/undefined ranges gracefully', () => {
            expect(manager.expandRangesToIndices(null)).toEqual([]);
            expect(manager.expandRangesToIndices(undefined)).toEqual([]);
            expect(manager.expandRangesToIndices('not an array')).toEqual([]);
        });

        test('expands complex range pattern', () => {
            const indices = manager.expandRangesToIndices([[0, 5], [10, 12], [20, 20]]);
            expect(indices).toEqual([0, 1, 2, 3, 4, 5, 10, 11, 12, 20]);
        });
    });

    describe('handleChunkAck', () => {
        let mockFile;

        beforeEach(() => {
            manager = new FileTransferManager();
            
            mockFile = {
                connId: 'conn-123',
                fileId: 'file-123',
                name: 'test.txt',
                size: 1000
            };
            
            manager.files.set('file-123', mockFile);
        });

        test('handles valid CHUNK_ACK message with ranges', () => {
            // Add some chunks to the cache
            const cache = new Map();
            cache.set(0, new ArrayBuffer(8));
            cache.set(1, new ArrayBuffer(8));
            cache.set(2, new ArrayBuffer(8));
            manager.sentChunkCache.set('file-123', cache);
            
            // Handle ACK for chunks 0-2
            const message = {
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'file-123',
                ranges: [[0, 2]]
            };
            
            manager.handleChunkAck(message);
            
            // Cache entry should be removed when empty
            expect(manager.sentChunkCache.has('file-123')).toBe(false);
        });

        test('handles ACK for non-existent file gracefully', () => {
            const message = {
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'nonexistent',
                ranges: [[0, 2]]
            };
            
            expect(() => manager.handleChunkAck(message)).not.toThrow();
        });

        test('handles ACK for file with no cache gracefully', () => {
            const message = {
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'file-123',
                ranges: [[0, 2]]
            };
            
            expect(() => manager.handleChunkAck(message)).not.toThrow();
        });

        test('handles ACK with invalid message format gracefully', () => {
            expect(() => manager.handleChunkAck({})).not.toThrow();
            expect(() => manager.handleChunkAck({ type: 'CHUNK_ACK' })).not.toThrow();
            expect(() => manager.handleChunkAck({ type: 'CHUNK_ACK', fileId: 'file-123' })).not.toThrow();
            expect(() => manager.handleChunkAck({ type: 'CHUNK_ACK', fileId: 'file-123', ranges: 'not array' })).not.toThrow();
        });

        test('handles ACK for wrong connection gracefully', () => {
            const cache = new Map();
            cache.set(0, new ArrayBuffer(8));
            manager.sentChunkCache.set('file-123', cache);
            
            // Temporarily change the connection ID to make it different
            webrtcManager.getConnectionInfo = () => ({ connId: 'different-conn' });
            
            const message = {
                type: 'CHUNK_ACK',
                connId: 'wrong-conn',
                fileId: 'file-123',
                ranges: [[0, 0]]
            };
            
            manager.handleChunkAck(message);
            // Cache should still be intact because connection doesn't match
            expect(manager.sentChunkCache.get('file-123').size).toBe(1);
            
            // Restore for other tests
            webrtcManager.getConnectionInfo = () => ({ connId: 'conn-123' });
        });

        test('idempotent: handles duplicate ACK gracefully', () => {
            const cache = new Map();
            cache.set(0, new ArrayBuffer(8));
            cache.set(1, new ArrayBuffer(8));
            manager.sentChunkCache.set('file-123', cache);
            
            // First ACK - removes all chunks
            manager.handleChunkAck({
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'file-123',
                ranges: [[0, 1]]
            });
            
            // Cache entry should be removed when empty
            expect(manager.sentChunkCache.has('file-123')).toBe(false);
            
            // Second ACK for same chunks (duplicate) - should handle gracefully
            expect(() => manager.handleChunkAck({
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'file-123',
                ranges: [[0, 1]]
            })).not.toThrow();
        });

        test('handles multiple ranges in single ACK', () => {
            const cache = new Map();
            for (let i = 0; i < 10; i++) {
                cache.set(i, new ArrayBuffer(8));
            }
            manager.sentChunkCache.set('file-123', cache);
            
            // ACK with multiple ranges
            manager.handleChunkAck({
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'file-123',
                ranges: [[0, 2], [5, 7]]
            });
            
            // Should have deleted chunks 0,1,2,5,6,7
            const remainingCache = manager.sentChunkCache.get('file-123');
            expect(remainingCache.size).toBe(4);
            expect(remainingCache.has(3)).toBe(true);
            expect(remainingCache.has(4)).toBe(true);
            expect(remainingCache.has(8)).toBe(true);
            expect(remainingCache.has(9)).toBe(true);
        });

        test('removes file cache entry when empty', () => {
            const cache = new Map();
            cache.set(0, new ArrayBuffer(8));
            cache.set(1, new ArrayBuffer(8));
            manager.sentChunkCache.set('file-123', cache);
            
            manager.handleChunkAck({
                type: 'CHUNK_ACK',
                connId: 'conn-123',
                fileId: 'file-123',
                ranges: [[0, 1]]
            });
            
            expect(manager.sentChunkCache.has('file-123')).toBe(false);
        });
    });

    describe('ACK Cache Management', () => {
        test('cacheChunk adds chunk to cache', () => {
            const chunk = new ArrayBuffer(8192);
            manager.cacheChunk('file-123', 0, chunk);
            
            expect(manager.sentChunkCache.has('file-123')).toBe(true);
            expect(manager.sentChunkCache.get('file-123').size).toBe(1);
            expect(manager.sentChunkCache.get('file-123').get(0)).toBe(chunk);
        });

        test('cacheChunk creates map for new file', () => {
            expect(manager.sentChunkCache.has('file-123')).toBe(false);
            
            manager.cacheChunk('file-123', 0, new ArrayBuffer(8));
            
            expect(manager.sentChunkCache.has('file-123')).toBe(true);
        });

        test('clearChunkCache removes file cache', () => {
            manager.cacheChunk('file-123', 0, new ArrayBuffer(8));
            expect(manager.sentChunkCache.has('file-123')).toBe(true);
            
            manager.clearChunkCache('file-123');
            
            expect(manager.sentChunkCache.has('file-123')).toBe(false);
        });

        test('clearChunkCache handles non-existent file gracefully', () => {
            expect(() => manager.clearChunkCache('nonexistent')).not.toThrow();
        });
    });
});
