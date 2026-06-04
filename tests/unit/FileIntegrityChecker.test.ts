import { createChunkBuffer, FileIntegrityChecker } from '@lfs/shared';
import { describe, expect, it, beforeEach } from 'vitest';

describe('FileIntegrityChecker', () => {
  let checker: FileIntegrityChecker;

  beforeEach(() => {
    const buffer = createChunkBuffer();
    checker = new FileIntegrityChecker(buffer);
  });

  describe('check', () => {
    it('returns complete=true when all chunks are present', () => {
      const fileId = 'file-1';
      const totalChunks = 10;

      // Add all 10 chunks
      for (let i = 0; i < totalChunks; i++) {
        checker.getBuffer().add(fileId, i, new ArrayBuffer(100), i === totalChunks - 1);
      }

      const result = checker.check(fileId, totalChunks);
      expect(result.complete).toBe(true);
      expect(result.missingIndices).toEqual([]);
    });

    it('returns complete=false with missing indices when chunks are missing', () => {
      const fileId = 'file-1';
      const totalChunks = 10;

      // Add only chunks 0, 2, 3, 5, 9 (missing 1, 4, 6, 7, 8)
      for (const i of [0, 2, 3, 5, 9]) {
        checker.getBuffer().add(fileId, i, new ArrayBuffer(100), false);
      }

      const result = checker.check(fileId, totalChunks);
      expect(result.complete).toBe(false);
      expect(result.missingIndices.sort((a, b) => a - b)).toEqual([1, 4, 6, 7, 8]);
    });

    it('given total chunks = 100 and buffer with all 100 indices returns complete=true', () => {
      const fileId = 'file-1';
      const totalChunks = 100;

      for (let i = 0; i < totalChunks; i++) {
        checker.getBuffer().add(fileId, i, new ArrayBuffer(100), i === totalChunks - 1);
      }

      const result = checker.check(fileId, totalChunks);
      expect(result.complete).toBe(true);
      expect(result.missingIndices).toEqual([]);
    });

    it('given 95 indices returns complete=false with missingIndices', () => {
      const fileId = 'file-1';
      const totalChunks = 100;

      // Add all except 3, 7, 42
      for (let i = 0; i < totalChunks; i++) {
        if (i !== 3 && i !== 7 && i !== 42) {
          checker.getBuffer().add(fileId, i, new ArrayBuffer(100), false);
        }
      }

      const result = checker.check(fileId, totalChunks);
      expect(result.complete).toBe(false);
      expect(result.missingIndices.sort((a, b) => a - b)).toEqual([3, 7, 42]);
    });
  });

  describe('getBuffer', () => {
    it('returns the buffer instance', () => {
      const buffer = createChunkBuffer();
      const checker = new FileIntegrityChecker(buffer);
      expect(checker.getBuffer()).toBe(buffer);
    });
  });
});
