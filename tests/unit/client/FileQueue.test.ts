/**
 * Unit tests for FileQueue.
 * Tests enqueue, dequeue, peek, remove, startNextFile, and terminal state skipping.
 */

import { FileQueue } from '../../../packages/client/src/files/FileQueue.js';
import { describe, expect, it, beforeEach } from 'vitest';
import type { FileEntry } from '../../../packages/client/src/files/FileStateMachine.js';

describe('FileQueue', () => {
  let queue: FileQueue;

  beforeEach(() => {
    queue = new FileQueue();
  });

  describe('enqueue', () => {
    it('adds a file to the end of the queue', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      queue.enqueue(entry);
      expect(queue.size()).toBe(1);
    });

    it('adds multiple files in order', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);
      expect(queue.size()).toBe(2);
    });
  });

  describe('dequeue', () => {
    it('removes and returns the first file', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const dequeued = queue.dequeue();
      expect(dequeued).toEqual(entry1);
      expect(queue.size()).toBe(1);
    });

    it('returns null when queue is empty', () => {
      expect(queue.dequeue()).toBeNull();
      expect(queue.size()).toBe(0);
    });
  });

  describe('peek', () => {
    it('returns the first file without removing it', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const peeked = queue.peek();
      expect(peeked).toEqual(entry1);
      expect(queue.size()).toBe(2); // Still 2 files
    });

    it('returns null when queue is empty', () => {
      expect(queue.peek()).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes a file by fileId', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      expect(queue.remove('file-1')).toBe(true);
      expect(queue.size()).toBe(1);
      expect(queue.peek()?.fileId).toBe('file-2');
    });

    it('returns false when file is not found', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      queue.enqueue(entry);
      expect(queue.remove('file-999')).toBe(false);
      expect(queue.size()).toBe(1);
    });
  });

  describe('size and isEmpty', () => {
    it('size returns the number of files', () => {
      expect(queue.size()).toBe(0);

      queue.enqueue({
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(queue.size()).toBe(1);
    });

    it('isEmpty returns true when queue is empty', () => {
      expect(queue.isEmpty()).toBe(true);

      queue.enqueue({
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(queue.isEmpty()).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all files from the queue', () => {
      queue.enqueue({
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      queue.enqueue({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      });

      expect(queue.size()).toBe(2);
      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns all files in the queue', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const all = queue.getAll();
      expect(all).toHaveLength(2);
      expect(all[0]).toEqual(entry1);
      expect(all[1]).toEqual(entry2);
    });

    it('returns a copy of the queue', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      queue.enqueue(entry);
      const all = queue.getAll();
      all.push({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Original queue should still have only 1 file
      expect(queue.size()).toBe(1);
    });
  });

  describe('startNextFile', () => {
    it('returns and removes the first non-terminal file', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const started = queue.startNextFile();
      expect(started).toEqual(entry1);
      expect(queue.size()).toBe(1); // entry1 was removed
      expect(queue.getCurrentFileId()).toBe('file-1');
    });

    it('skips files in terminal states (COMPLETED)', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'COMPLETED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const started = queue.startNextFile();
      expect(started).toEqual(entry2);
      expect(queue.getCurrentFileId()).toBe('file-2');
    });

    it('skips files in terminal states (CANCELLED)', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'CANCELLED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const started = queue.startNextFile();
      expect(started).toEqual(entry2);
      expect(queue.getCurrentFileId()).toBe('file-2');
    });

    it('returns null when all files are in terminal states', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'COMPLETED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'FAILED',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      const started = queue.startNextFile();
      expect(started).toBeNull();
      expect(queue.getCurrentFileId()).toBeNull();
    });

    it('returns null when queue is empty', () => {
      const started = queue.startNextFile();
      expect(started).toBeNull();
      expect(queue.getCurrentFileId()).toBeNull();
    });

    it('clears current file when starting a new one', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      };

      queue.enqueue(entry1);
      queue.enqueue(entry2);

      // Start first file
      queue.startNextFile();
      expect(queue.getCurrentFileId()).toBe('file-1');

      // Start next file (should clear file-1)
      queue.enqueue(entry2);
      const started = queue.startNextFile();
      expect(started).toEqual(entry2);
      expect(queue.getCurrentFileId()).toBe('file-2');
    });
  });

  describe('getCurrentFileId and setCurrentFileId', () => {
    it('getCurrentFileId returns null initially', () => {
      expect(queue.getCurrentFileId()).toBeNull();
    });

    it('setCurrentFileId sets the current file ID', () => {
      queue.setCurrentFileId('file-1');
      expect(queue.getCurrentFileId()).toBe('file-1');
    });

    it('setCurrentFileId with null clears the current file', () => {
      queue.setCurrentFileId('file-1');
      expect(queue.getCurrentFileId()).toBe('file-1');

      queue.setCurrentFileId(null);
      expect(queue.getCurrentFileId()).toBeNull();
    });
  });

  describe('isTransferring', () => {
    it('returns true when file is currently transferring', () => {
      queue.setCurrentFileId('file-1');
      expect(queue.isTransferring('file-1')).toBe(true);
      expect(queue.isTransferring('file-2')).toBe(false);
    });

    it('returns false when current file is null', () => {
      expect(queue.isTransferring('file-1')).toBe(false);
    });
  });
});
