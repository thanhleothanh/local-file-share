import { DefaultChunkCache, createChunkCache, type ChunkCache } from '@lfs/shared';
import { describe, expect, it, beforeEach } from 'vitest';

describe('ChunkCache', () => {
  let cache: ChunkCache;

  beforeEach(() => {
    cache = createChunkCache();
  });

  describe('add and get', () => {
    it('adds a chunk and retrieves it by fileId and index', () => {
      const fileId = 'file-1';
      const index = 0;
      const data = new TextEncoder().encode('hello').buffer;

      cache.add(fileId, index, data);
      const retrieved = cache.get(fileId, index);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.byteLength).toBe(data.byteLength);
      expect(new TextDecoder().decode(retrieved!)).toBe('hello');
    });

    it('returns null for non-existent chunk', () => {
      expect(cache.get('nonexistent', 0)).toBeNull();
    });

    it('adds multiple chunks for the same file', () => {
      const fileId = 'file-1';
      const data1 = new TextEncoder().encode('chunk1').buffer;
      const data2 = new TextEncoder().encode('chunk2').buffer;

      cache.add(fileId, 0, data1);
      cache.add(fileId, 1, data2);

      expect(cache.get(fileId, 0)).not.toBeNull();
      expect(cache.get(fileId, 1)).not.toBeNull();
      expect(new TextDecoder().decode(cache.get(fileId, 0)!)).toBe('chunk1');
      expect(new TextDecoder().decode(cache.get(fileId, 1)!)).toBe('chunk2');
    });
  });

  describe('delete', () => {
    it('deletes a chunk and returns true', () => {
      const fileId = 'file-1';
      const data = new TextEncoder().encode('test').buffer;

      cache.add(fileId, 0, data);
      const result = cache.delete(fileId, 0);

      expect(result).toBe(true);
      expect(cache.get(fileId, 0)).toBeNull();
    });

    it('returns false when deleting non-existent chunk', () => {
      const result = cache.delete('nonexistent', 0);
      expect(result).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('deletes all chunks for a file', () => {
      const fileId = 'file-1';

      cache.add(fileId, 0, new ArrayBuffer(100));
      cache.add(fileId, 1, new ArrayBuffer(100));
      cache.add(fileId, 2, new ArrayBuffer(100));

      cache.deleteFile(fileId);

      expect(cache.get(fileId, 0)).toBeNull();
      expect(cache.get(fileId, 1)).toBeNull();
      expect(cache.get(fileId, 2)).toBeNull();
    });

    it('does not affect chunks from other files', () => {
      cache.add('file-1', 0, new TextEncoder().encode('file1').buffer);
      cache.add('file-2', 0, new TextEncoder().encode('file2').buffer);

      cache.deleteFile('file-1');

      expect(cache.get('file-1', 0)).toBeNull();
      expect(cache.get('file-2', 0)).not.toBeNull();
    });
  });

  describe('getChunkCount', () => {
    it('returns 0 for non-existent file', () => {
      expect(cache.getChunkCount('nonexistent')).toBe(0);
    });

    it('returns correct count for a file', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      cache.add('file-1', 1, new ArrayBuffer(100));
      cache.add('file-1', 2, new ArrayBuffer(100));

      expect(cache.getChunkCount('file-1')).toBe(3);
    });
  });

  describe('getTotalChunkCount', () => {
    it('returns 0 for empty cache', () => {
      expect(cache.getTotalChunkCount()).toBe(0);
    });

    it('returns sum of chunks across all files', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      cache.add('file-1', 1, new ArrayBuffer(100));
      cache.add('file-2', 0, new ArrayBuffer(100));

      expect(cache.getTotalChunkCount()).toBe(3);
    });
  });

  describe('getByteSize', () => {
    it('returns 0 for non-existent file', () => {
      expect(cache.getByteSize('nonexistent')).toBe(0);
    });

    it('returns correct byte size for a file', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      cache.add('file-1', 1, new ArrayBuffer(200));

      expect(cache.getByteSize('file-1')).toBe(300);
    });
  });

  describe('getTotalByteSize', () => {
    it('returns 0 for empty cache', () => {
      expect(cache.getTotalByteSize()).toBe(0);
    });

    it('returns sum of bytes across all files', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      cache.add('file-1', 1, new ArrayBuffer(200));
      cache.add('file-2', 0, new ArrayBuffer(50));

      expect(cache.getTotalByteSize()).toBe(350);
    });
  });

  describe('has', () => {
    it('returns false for non-existent chunk', () => {
      expect(cache.has('nonexistent', 0)).toBe(false);
    });

    it('returns true for existing chunk', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      expect(cache.has('file-1', 0)).toBe(true);
    });

    it('returns false for existing file but non-existent index', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      expect(cache.has('file-1', 1)).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all chunks from all files', () => {
      cache.add('file-1', 0, new ArrayBuffer(100));
      cache.add('file-1', 1, new ArrayBuffer(100));
      cache.add('file-2', 0, new ArrayBuffer(100));

      cache.clear();

      expect(cache.getTotalChunkCount()).toBe(0);
      expect(cache.getTotalByteSize()).toBe(0);
    });
  });

  describe('1000 adds and 1000 deletes ends empty', () => {
    it('handles large number of operations correctly', () => {
      const fileId = 'large-file';

      // Add 1000 chunks
      for (let i = 0; i < 1000; i++) {
        cache.add(fileId, i, new ArrayBuffer(16 * 1024)); // 16 KB each
      }

      expect(cache.getChunkCount(fileId)).toBe(1000);

      // Delete all 1000 chunks
      for (let i = 0; i < 1000; i++) {
        cache.delete(fileId, i);
      }

      expect(cache.getChunkCount(fileId)).toBe(0);
    });
  });

  describe('deleteFile removes the whole file', () => {
    it('completely removes a file and all its chunks', () => {
      const fileId = 'file-to-delete';

      for (let i = 0; i < 100; i++) {
        cache.add(fileId, i, new ArrayBuffer(100));
      }

      expect(cache.getChunkCount(fileId)).toBe(100);

      cache.deleteFile(fileId);

      expect(cache.getChunkCount(fileId)).toBe(0);
      expect(cache.getByteSize(fileId)).toBe(0);
    });
  });
});
