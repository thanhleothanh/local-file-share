import { decodeChunk, generateUuid, createChunkCache } from '@lfs/shared';
import { FileSender } from '../../../packages/client/src/files/FileSender.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('FileSender', () => {
  it('sends a file by splitting it into chunks', async () => {
    const chunks: ArrayBuffer[] = [];
    const sendChunk = vi.fn().mockImplementation(async (chunk: ArrayBuffer) => {
      chunks.push(chunk);
    });

    const sender = new FileSender({ sendChunk });
    const file = new File([new TextEncoder().encode('hello world')], 'test.txt', { type: 'text/plain' });

    await sender.sendFile(file, generateUuid());

    expect(sendChunk).toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('sends a 100 KB file producing the correct number of chunks', async () => {
    const chunks: ArrayBuffer[] = [];
    const sendChunk = vi.fn().mockImplementation(async (chunk: ArrayBuffer) => {
      chunks.push(chunk);
    });

    const sender = new FileSender({ sendChunk });
    // 100 KB = 102400 bytes
    const fileSize = 102400;
    const fileData = new Uint8Array(fileSize);
    for (let i = 0; i < fileSize; i++) {
      fileData[i] = i % 256;
    }
    const file = new File([fileData], 'test-100kb.bin', { type: 'application/octet-stream' });

    await sender.sendFile(file, generateUuid());

    // 16 KB chunks: 102400 / 16384 = 6.25, so 7 chunks
    expect(chunks.length).toBe(7);

    // Verify the last chunk has isLast=true
    const lastChunk = chunks[chunks.length - 1];
    const decodedLast = decodeChunk(lastChunk);
    expect(decodedLast.isLast).toBe(true);
    expect(decodedLast.index).toBe(6);
  });

  it('emits progress events with monotonically increasing bytesSent', async () => {
    const progressEvents: Array<{ fileId: string; bytesSent: number; totalBytes: number }> = [];
    const sendChunk = vi.fn().mockImplementation(async (chunk: ArrayBuffer) => {
      // Small delay to allow progress to be captured
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const sender = new FileSender({ sendChunk });
    sender.on('progress', (fileId, bytesSent, totalBytes) => {
      progressEvents.push({ fileId, bytesSent, totalBytes });
    });

    const fileData = new Uint8Array(50000);
    for (let i = 0; i < 50000; i++) {
      fileData[i] = i % 256;
    }
    const file = new File([fileData], 'test.bin', { type: 'application/octet-stream' });

    await sender.sendFile(file);

    expect(progressEvents.length).toBeGreaterThan(0);
    
    // Verify bytesSent is monotonically increasing
    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i].bytesSent).toBeGreaterThan(progressEvents[i - 1].bytesSent);
    }

    // Verify final bytesSent equals totalBytes
    const lastProgress = progressEvents[progressEvents.length - 1];
    expect(lastProgress.bytesSent).toBe(file.size);
    expect(lastProgress.totalBytes).toBe(file.size);
  });

  it('encode/decode round-trip works for all chunks', async () => {
    const sentChunks: ArrayBuffer[] = [];
    const sendChunk = vi.fn().mockImplementation(async (chunk: ArrayBuffer) => {
      sentChunks.push(chunk);
    });

    const sender = new FileSender({ sendChunk });
    const originalData = new TextEncoder().encode('Test data for round-trip verification');
    const file = new File([originalData], 'roundtrip.txt');

    await sender.sendFile(file, generateUuid());

    // Decode all chunks and reassemble
    const decodedChunks: Array<{ index: number; data: Uint8Array; isLast: boolean }> = [];
    for (const chunk of sentChunks) {
      const decoded = decodeChunk(chunk);
      decodedChunks.push({ index: decoded.index, data: new Uint8Array(decoded.data), isLast: decoded.isLast });
    }

    // Sort by index
    decodedChunks.sort((a, b) => a.index - b.index);

    // Reassemble
    const totalLength = decodedChunks.reduce((sum, c) => sum + c.data.length, 0);
    const reassembled = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decodedChunks) {
      reassembled.set(chunk.data, offset);
      offset += chunk.data.length;
    }

    expect(reassembled).toEqual(originalData);
  });

  it('throws when data channel is not open', async () => {
    const sendChunk = vi.fn().mockRejectedValue(new Error('Channel closed'));
    const sender = new FileSender({ sendChunk });
    const file = new File([new TextEncoder().encode('test')], 'test.txt');

    await expect(sender.sendFile(file)).rejects.toThrow();
  });

  describe('ChunkCache integration', () => {
    it('adds chunks to cache after sending', async () => {
      const chunks: ArrayBuffer[] = [];
      const sendChunk = vi.fn().mockImplementation(async (chunk: ArrayBuffer) => {
        chunks.push(chunk);
      });

      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      const fileData = new TextEncoder().encode('test data');
      const file = new File([fileData], 'test.txt');
      const fileId = generateUuid();

      await sender.sendFile(file, fileId);

      // Verify chunks were added to cache
      expect(cache.getChunkCount(fileId)).toBeGreaterThan(0);
      expect(cache.getTotalByteSize()).toBe(fileData.byteLength);
    });

    it('cache contains all chunks after sending 1 MB file', async () => {
      const chunks: ArrayBuffer[] = [];
      const sendChunk = vi.fn().mockImplementation(async (chunk: ArrayBuffer) => {
        chunks.push(chunk);
      });

      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      // Create 1 MB file
      const fileSize = 1024 * 1024;
      const fileData = new Uint8Array(fileSize);
      for (let i = 0; i < fileSize; i++) {
        fileData[i] = i % 256;
      }
      const file = new File([fileData], 'test-1mb.bin');
      const fileId = generateUuid();

      await sender.sendFile(file, fileId);

      // Should have all chunks in cache
      expect(cache.getChunkCount(fileId)).toBeGreaterThan(0);
      // Total bytes in cache should equal file size
      expect(cache.getByteSize(fileId)).toBe(fileSize);
    });

    it('handles chunk ACK by deleting from cache', async () => {
      const sendChunk = vi.fn().mockResolvedValue(undefined);
      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      const fileData = new TextEncoder().encode('test data');
      const file = new File([fileData], 'test.txt');
      const fileId = generateUuid();

      await sender.sendFile(file, fileId);

      // Get the chunk count before ACK
      const chunkCountBefore = cache.getChunkCount(fileId);
      expect(chunkCountBefore).toBeGreaterThan(0);

      // Handle ACK for chunk 0
      const result = sender.handleChunkAck(fileId, 0);
      expect(result).toBe(true);

      // Verify chunk was deleted
      expect(cache.getChunkCount(fileId)).toBe(chunkCountBefore - 1);
    });

    it('handleChunkAck returns false for unknown chunk', () => {
      const sendChunk = vi.fn().mockResolvedValue(undefined);
      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      const result = sender.handleChunkAck('unknown-file', 0);
      expect(result).toBe(false);
    });

    it('deleteFile removes all chunks for a file', async () => {
      const sendChunk = vi.fn().mockResolvedValue(undefined);
      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      const fileData = new TextEncoder().encode('test data');
      const file = new File([fileData], 'test.txt');
      const fileId = generateUuid();

      await sender.sendFile(file, fileId);

      // Verify chunks are in cache
      expect(cache.getChunkCount(fileId)).toBeGreaterThan(0);

      // Delete all chunks for the file
      sender.deleteFile(fileId);

      // Verify cache is empty for this file
      expect(cache.getChunkCount(fileId)).toBe(0);
    });

    it('getCache returns the cache instance', () => {
      const sendChunk = vi.fn().mockResolvedValue(undefined);
      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      expect(sender.getCache()).toBe(cache);
    });

    it('cache is empty after all ACKs received', async () => {
      const sendChunk = vi.fn().mockResolvedValue(undefined);
      const cache = createChunkCache();
      const sender = new FileSender({ sendChunk, cache });

      const fileSize = 16 * 1024; // 16 KB = exactly 1 chunk
      const fileData = new Uint8Array(fileSize);
      for (let i = 0; i < fileSize; i++) {
        fileData[i] = i % 256;
      }
      const file = new File([fileData], 'test-16kb.bin');
      const fileId = generateUuid();

      await sender.sendFile(file, fileId);

      // Should have 1 chunk in cache
      expect(cache.getChunkCount(fileId)).toBe(1);

      // Handle ACK for chunk 0
      sender.handleChunkAck(fileId, 0);

      // Cache should be empty
      expect(cache.getChunkCount(fileId)).toBe(0);
    });
  });
});
