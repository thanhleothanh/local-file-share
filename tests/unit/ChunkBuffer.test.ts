import { DefaultChunkBuffer, createChunkBuffer, type ChunkBuffer } from '@lfs/shared';
import { describe, expect, it, beforeEach } from 'vitest';

describe('ChunkBuffer', () => {
  let buffer: ChunkBuffer;

  beforeEach(() => {
    buffer = createChunkBuffer();
  });

  describe('add and get', () => {
    it('adds a chunk and retrieves it by fileId and index', () => {
      const fileId = 'file-1';
      const index = 0;
      const data = new TextEncoder().encode('hello').buffer;

      buffer.add(fileId, index, data, false);
      const retrieved = buffer.get(fileId, index);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.byteLength).toBe(data.byteLength);
      expect(new TextDecoder().decode(retrieved!)).toBe('hello');
    });

    it('returns null for non-existent chunk', () => {
      expect(buffer.get('nonexistent', 0)).toBeNull();
    });

    it('adds multiple chunks for the same file', () => {
      const fileId = 'file-1';
      const data1 = new TextEncoder().encode('chunk1').buffer;
      const data2 = new TextEncoder().encode('chunk2').buffer;

      buffer.add(fileId, 0, data1, false);
      buffer.add(fileId, 1, data2, false);

      expect(buffer.get(fileId, 0)).not.toBeNull();
      expect(buffer.get(fileId, 1)).not.toBeNull();
    });

    it('adds chunk with isLast flag', () => {
      const fileId = 'file-1';
      const data = new TextEncoder().encode('test').buffer;

      // isLast flag is accepted but the totalChunks parameter is used for checking
      buffer.add(fileId, 5, data, true);

      // We have chunk 5, but we need chunks 0-5 for hasAllIndices to be true
      expect(buffer.hasAllIndices(fileId, 6)).toBe(false);
      expect(buffer.has('file-1', 5)).toBe(true);
    });
  });

  describe('hasAllIndices', () => {
    it('returns false when chunks are missing', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 1, new ArrayBuffer(100), false);

      expect(buffer.hasAllIndices(fileId, 3)).toBe(false);
    });

    it('returns true when all chunks are present', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 1, new ArrayBuffer(100), false);
      buffer.add(fileId, 2, new ArrayBuffer(100), false);

      expect(buffer.hasAllIndices(fileId, 3)).toBe(true);
    });

    it('returns true when all chunks are present', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 1, new ArrayBuffer(100), false);
      buffer.add(fileId, 2, new ArrayBuffer(100), true);

      expect(buffer.hasAllIndices(fileId, 3)).toBe(true);
      // When checking for 100 chunks, we only have 3, so it's false
      expect(buffer.hasAllIndices(fileId, 100)).toBe(false);
    });
  });

  describe('missingIndices', () => {
    it('returns empty array when all chunks are present', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 1, new ArrayBuffer(100), false);
      buffer.add(fileId, 2, new ArrayBuffer(100), false);

      const missing = buffer.missingIndices(fileId, 3);
      expect(missing).toEqual([]);
    });

    it('returns correct missing indices', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 2, new ArrayBuffer(100), false);
      // Missing: 1

      const missing = buffer.missingIndices(fileId, 3);
      expect(missing).toEqual([1]);
    });

    it('returns multiple missing indices', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 3, new ArrayBuffer(100), false);
      // Missing: 1, 2

      const missing = buffer.missingIndices(fileId, 5);
      expect(missing).toEqual([1, 2, 4]);
    });

    it('returns all indices as missing for non-existent file', () => {
      const missing = buffer.missingIndices('nonexistent', 3);
      expect(missing).toEqual([0, 1, 2]);
    });
  });

  describe('assemble', () => {
    it('assembles chunks in order', () => {
      const fileId = 'file-1';
      const chunk1 = new TextEncoder().encode('chunk1').buffer;
      const chunk2 = new TextEncoder().encode('chunk2').buffer;
      const chunk3 = new TextEncoder().encode('chunk3').buffer;

      buffer.add(fileId, 0, chunk1, false);
      buffer.add(fileId, 1, chunk2, false);
      buffer.add(fileId, 2, chunk3, false);

      const assembled = buffer.assemble(fileId);
      expect(new TextDecoder().decode(assembled)).toBe('chunk1chunk2chunk3');
    });

    it('assembles chunks even if added out of order', () => {
      const fileId = 'file-1';
      const chunk1 = new TextEncoder().encode('chunk1').buffer;
      const chunk2 = new TextEncoder().encode('chunk2').buffer;
      const chunk3 = new TextEncoder().encode('chunk3').buffer;

      // Add out of order
      buffer.add(fileId, 2, chunk3, false);
      buffer.add(fileId, 0, chunk1, false);
      buffer.add(fileId, 1, chunk2, false);

      const assembled = buffer.assemble(fileId);
      expect(new TextDecoder().decode(assembled)).toBe('chunk1chunk2chunk3');
    });

    it('returns empty buffer for non-existent file', () => {
      const assembled = buffer.assemble('nonexistent');
      expect(assembled.byteLength).toBe(0);
    });
  });

  describe('deleteFile', () => {
    it('deletes all chunks for a file', () => {
      const fileId = 'file-1';
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 1, new ArrayBuffer(100), false);
      buffer.add(fileId, 2, new ArrayBuffer(100), true);

      buffer.deleteFile(fileId);

      expect(buffer.get(fileId, 0)).toBeNull();
      expect(buffer.get(fileId, 1)).toBeNull();
      expect(buffer.get(fileId, 2)).toBeNull();
      expect(buffer.getChunkCount(fileId)).toBe(0);
    });

    it('does not affect chunks from other files', () => {
      buffer.add('file-1', 0, new TextEncoder().encode('file1').buffer, false);
      buffer.add('file-2', 0, new TextEncoder().encode('file2').buffer, false);

      buffer.deleteFile('file-1');

      expect(buffer.get('file-1', 0)).toBeNull();
      expect(buffer.get('file-2', 0)).not.toBeNull();
    });
  });

  describe('getByteSize', () => {
    it('returns 0 for non-existent file', () => {
      expect(buffer.getByteSize('nonexistent')).toBe(0);
    });

    it('returns correct byte size for a file', () => {
      buffer.add('file-1', 0, new ArrayBuffer(100), false);
      buffer.add('file-1', 1, new ArrayBuffer(200), false);

      expect(buffer.getByteSize('file-1')).toBe(300);
    });
  });

  describe('getChunkCount', () => {
    it('returns 0 for non-existent file', () => {
      expect(buffer.getChunkCount('nonexistent')).toBe(0);
    });

    it('returns correct count for a file', () => {
      buffer.add('file-1', 0, new ArrayBuffer(100), false);
      buffer.add('file-1', 1, new ArrayBuffer(100), false);
      buffer.add('file-1', 2, new ArrayBuffer(100), false);

      expect(buffer.getChunkCount('file-1')).toBe(3);
    });
  });

  describe('has', () => {
    it('returns false for non-existent chunk', () => {
      expect(buffer.has('nonexistent', 0)).toBe(false);
    });

    it('returns true for existing chunk', () => {
      buffer.add('file-1', 0, new ArrayBuffer(100), false);
      expect(buffer.has('file-1', 0)).toBe(true);
    });

    it('returns false for existing file but non-existent index', () => {
      buffer.add('file-1', 0, new ArrayBuffer(100), false);
      expect(buffer.has('file-1', 1)).toBe(false);
    });
  });

  describe('hasAllIndices then missingIndices after partial writes', () => {
    it('correctly identifies gaps after partial writes', () => {
      const fileId = 'file-1';
      // Add chunks 0, 2, 3 (missing 1)
      buffer.add(fileId, 0, new ArrayBuffer(100), false);
      buffer.add(fileId, 2, new ArrayBuffer(100), false);
      buffer.add(fileId, 3, new ArrayBuffer(100), false);

      expect(buffer.hasAllIndices(fileId, 4)).toBe(false);
      expect(buffer.missingIndices(fileId, 4)).toEqual([1]);
    });

    it('hasAllIndices returns true when all 100 indices present', () => {
      const fileId = 'file-1';
      for (let i = 0; i < 100; i++) {
        buffer.add(fileId, i, new ArrayBuffer(100), i === 99);
      }

      expect(buffer.hasAllIndices(fileId, 100)).toBe(true);
      expect(buffer.missingIndices(fileId, 100)).toEqual([]);
    });
  });

  describe('assemble with 250 mock chunks', () => {
    it('assembles all chunks correctly', () => {
      const fileId = 'large-file';
      const chunkSize = 100;
      const chunkCount = 250;

      // Add 250 chunks out of order
      for (let i = chunkCount - 1; i >= 0; i--) {
        const chunkData = new Uint8Array(chunkSize);
        for (let j = 0; j < chunkSize; j++) {
          chunkData[j] = (i * chunkSize + j) % 256;
        }
        buffer.add(fileId, i, chunkData, i === chunkCount - 1);
      }

      const assembled = buffer.assemble(fileId);
      expect(assembled.byteLength).toBe(chunkCount * chunkSize);

      // Verify content
      const assembledBytes = new Uint8Array(assembled);
      for (let i = 0; i < chunkCount * chunkSize; i++) {
        expect(assembledBytes[i]).toBe(i % 256);
      }
    });
  });
});
