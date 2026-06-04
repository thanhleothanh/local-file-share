/**
 * Unit tests for FileRegistry.
 * Tests add, update, get, getAll, getByState, sorting, and state transitions.
 */

import { FileRegistry } from '../../../packages/client/src/files/FileRegistry.js';
import { describe, expect, it, beforeEach } from 'vitest';
import type { FileEntry } from '../../../packages/client/src/files/FileStateMachine.js';

describe('FileRegistry', () => {
  let registry: FileRegistry;

  beforeEach(() => {
    registry = new FileRegistry();
  });

  describe('add', () => {
    it('adds a file entry', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      expect(registry.size()).toBe(1);
      expect(registry.get('file-1')).toEqual(entry);
    });

    it('overwrites existing file with same ID', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const entry2: FileEntry = {
        fileId: 'file-1',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'QUEUED',
        createdAt: 2000,
        updatedAt: 2000,
      };

      registry.add(entry1);
      registry.add(entry2);

      expect(registry.size()).toBe(1);
      expect(registry.get('file-1')?.fileName).toBe('test2.txt');
    });
  });

  describe('update', () => {
    it('updates an existing file entry', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      const updated = registry.update('file-1', { state: 'QUEUED', fileSize: 200 });

      expect(updated).toBe(true);
      const retrieved = registry.get('file-1');
      expect(retrieved?.state).toBe('QUEUED');
      expect(retrieved?.fileSize).toBe(200);
      expect(retrieved?.updatedAt).toBeGreaterThan(1000);
    });

    it('returns false when file does not exist', () => {
      const updated = registry.update('file-999', { state: 'QUEUED' });
      expect(updated).toBe(false);
    });
  });

  describe('get', () => {
    it('returns a file by ID', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      expect(registry.get('file-1')).toEqual(entry);
    });

    it('returns null when file does not exist', () => {
      expect(registry.get('file-999')).toBeNull();
    });
  });

  describe('getAll', () => {
    it('returns all files sorted by createdAt descending', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: 3000,
        updatedAt: 3000,
      };
      const entry3: FileEntry = {
        fileId: 'file-3',
        fileName: 'test3.txt',
        fileSize: 300,
        state: 'PENDING',
        createdAt: 2000,
        updatedAt: 2000,
      };

      registry.add(entry1);
      registry.add(entry2);
      registry.add(entry3);

      const all = registry.getAll();
      expect(all).toHaveLength(3);
      // Should be sorted by createdAt descending: file-2 (3000), file-3 (2000), file-1 (1000)
      expect(all[0].fileId).toBe('file-2');
      expect(all[1].fileId).toBe('file-3');
      expect(all[2].fileId).toBe('file-1');
    });
  });

  describe('getByState', () => {
    it('returns files filtered by state', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'QUEUED',
        createdAt: 2000,
        updatedAt: 2000,
      };
      const entry3: FileEntry = {
        fileId: 'file-3',
        fileName: 'test3.txt',
        fileSize: 300,
        state: 'PENDING',
        createdAt: 3000,
        updatedAt: 3000,
      };

      registry.add(entry1);
      registry.add(entry2);
      registry.add(entry3);

      const pending = registry.getByState('PENDING');
      expect(pending).toHaveLength(2);
      expect(pending.map((e) => e.fileId).sort()).toEqual(['file-1', 'file-3']);

      const queued = registry.getByState('QUEUED');
      expect(queued).toHaveLength(1);
      expect(queued[0].fileId).toBe('file-2');
    });
  });

  describe('getActiveFiles', () => {
    it('returns only non-terminal state files', () => {
      const entry1: FileEntry = {
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const entry2: FileEntry = {
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'COMPLETED',
        createdAt: 2000,
        updatedAt: 2000,
      };
      const entry3: FileEntry = {
        fileId: 'file-3',
        fileName: 'test3.txt',
        fileSize: 300,
        state: 'QUEUED',
        createdAt: 3000,
        updatedAt: 3000,
      };
      const entry4: FileEntry = {
        fileId: 'file-4',
        fileName: 'test4.txt',
        fileSize: 400,
        state: 'FAILED',
        createdAt: 4000,
        updatedAt: 4000,
      };

      registry.add(entry1);
      registry.add(entry2);
      registry.add(entry3);
      registry.add(entry4);

      const active = registry.getActiveFiles();
      expect(active).toHaveLength(2);
      expect(active.map((e) => e.fileId).sort()).toEqual(['file-1', 'file-3']);
    });
  });

  describe('has', () => {
    it('returns true when file exists', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      expect(registry.has('file-1')).toBe(true);
      expect(registry.has('file-999')).toBe(false);
    });
  });

  describe('remove', () => {
    it('removes a file by ID', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      expect(registry.remove('file-1')).toBe(true);
      expect(registry.size()).toBe(0);
      expect(registry.get('file-1')).toBeNull();
    });

    it('returns false when file does not exist', () => {
      expect(registry.remove('file-999')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all files', () => {
      registry.add({
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      });
      registry.add({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: 2000,
        updatedAt: 2000,
      });

      expect(registry.size()).toBe(2);
      registry.clear();
      expect(registry.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('returns the number of files', () => {
      expect(registry.size()).toBe(0);

      registry.add({
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      });

      expect(registry.size()).toBe(1);
    });
  });

  describe('transition', () => {
    it('transitions a file to a new state', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      const transitioned = registry.transition('file-1', 'ACCEPT');

      expect(transitioned).toBe(true);
      expect(registry.get('file-1')?.state).toBe('QUEUED');
    });

    it('returns false when file does not exist', () => {
      const transitioned = registry.transition('file-999', 'ACCEPT');
      expect(transitioned).toBe(false);
    });

    it('returns false for invalid transitions', () => {
      const entry: FileEntry = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      };

      registry.add(entry);
      // PENDING + COMPLETE is invalid
      const transitioned = registry.transition('file-1', 'COMPLETE');
      expect(transitioned).toBe(false);
      expect(registry.get('file-1')?.state).toBe('PENDING');
    });
  });

  describe('getPendingFiles', () => {
    it('returns files in PENDING state', () => {
      registry.add({
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      });
      registry.add({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'QUEUED',
        createdAt: 2000,
        updatedAt: 2000,
      });
      registry.add({
        fileId: 'file-3',
        fileName: 'test3.txt',
        fileSize: 300,
        state: 'PENDING',
        createdAt: 3000,
        updatedAt: 3000,
      });

      const pending = registry.getPendingFiles();
      expect(pending).toHaveLength(2);
      expect(pending.map((e) => e.fileId).sort()).toEqual(['file-1', 'file-3']);
    });
  });

  describe('getQueuedFiles', () => {
    it('returns files in QUEUED state', () => {
      registry.add({
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      });
      registry.add({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'QUEUED',
        createdAt: 2000,
        updatedAt: 2000,
      });

      const queued = registry.getQueuedFiles();
      expect(queued).toHaveLength(1);
      expect(queued[0].fileId).toBe('file-2');
    });
  });

  describe('getTransferringFiles', () => {
    it('returns files in TRANSFERRING state', () => {
      registry.add({
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'TRANSFERRING',
        createdAt: 1000,
        updatedAt: 1000,
      });
      registry.add({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: 2000,
        updatedAt: 2000,
      });

      const transferring = registry.getTransferringFiles();
      expect(transferring).toHaveLength(1);
      expect(transferring[0].fileId).toBe('file-1');
    });
  });

  describe('getStateCounts', () => {
    it('returns counts of files by state', () => {
      registry.add({
        fileId: 'file-1',
        fileName: 'test1.txt',
        fileSize: 100,
        state: 'PENDING',
        createdAt: 1000,
        updatedAt: 1000,
      });
      registry.add({
        fileId: 'file-2',
        fileName: 'test2.txt',
        fileSize: 200,
        state: 'PENDING',
        createdAt: 2000,
        updatedAt: 2000,
      });
      registry.add({
        fileId: 'file-3',
        fileName: 'test3.txt',
        fileSize: 300,
        state: 'QUEUED',
        createdAt: 3000,
        updatedAt: 3000,
      });
      registry.add({
        fileId: 'file-4',
        fileName: 'test4.txt',
        fileSize: 400,
        state: 'COMPLETED',
        createdAt: 4000,
        updatedAt: 4000,
      });

      const counts = registry.getStateCounts();
      expect(counts.PENDING).toBe(2);
      expect(counts.QUEUED).toBe(1);
      expect(counts.COMPLETED).toBe(1);
      expect(counts.REJECTED).toBe(0);
      expect(counts.FAILED).toBe(0);
      expect(counts.CANCELLED).toBe(0);
      expect(counts.TRANSFERRING).toBe(0);
    });
  });
});
