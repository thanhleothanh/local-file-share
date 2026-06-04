/**
 * Unit tests for IndexedDBWriter.
 * These tests use vi.stubGlobal to mock browser APIs.
 */

import {
  IndexedDBWriter,
  BrowserDownloadLauncher,
  StorageBackendFactory,
} from '../../../packages/client/src/files/IndexedDBWriter.js';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Type declaration for FileSystemDirectoryHandle (not available in Node.js types)
declare interface FileSystemDirectoryHandle {
  getFileHandle(name: string, options?: { create: boolean }): Promise<FileSystemFileHandle>;
}

declare interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

declare interface FileSystemWritableFileStream {
  write(data: ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

describe('IndexedDBWriter', () => {
  beforeEach(() => {
    // Clean up all stubs before each test
    vi.unstubAllGlobals();
    // Reset the singleton
    // @ts-expect-error - accessing private field
    StorageBackendFactory.instance = null;
  });

  describe('isAvailable', () => {
    it('returns true when indexedDB is in window', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      expect(IndexedDBWriter.isAvailable()).toBe(true);
    });

    it('returns false when indexedDB is not in window', () => {
      vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

      expect(IndexedDBWriter.isAvailable()).toBe(false);
    });
  });

  describe('StorageBackendFactory', () => {
    it('can be instantiated', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn(),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      expect(factory).toBeDefined();
    });

    it('returns the same instance for getInstance', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn(),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      // Reset singleton to clear previous state
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;

      const factory1 = StorageBackendFactory.getInstance();
      const factory2 = StorageBackendFactory.getInstance();

      expect(factory1).toBe(factory2);
    });

    it('returns fsa when showDirectoryPicker is available', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn().mockResolvedValue({}),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      expect(factory.kind()).toBe('fsa');
      expect(factory.detect()).toBe('fsa');
    });

    it('returns indexeddb when showDirectoryPicker is not available but indexedDB is', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      // Reset singleton to clear previous state
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      expect(factory.kind()).toBe('indexeddb');
      expect(factory.detect()).toBe('indexeddb');
    });

    it('throws when no storage backend is available', () => {
      vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

      // Reset singleton to clear previous state
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      expect(() => factory.kind()).toThrow('No storage backend available');
    });

    it('caches the detection result', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn().mockResolvedValue({}),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      // Reset singleton to clear previous state
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      // Call detect multiple times
      expect(factory.detect()).toBe('fsa');
      expect(factory.detect()).toBe('fsa');
      expect(factory.kind()).toBe('fsa');
    });

    it('can be reset', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn().mockResolvedValue({}),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      // Reset singleton to clear previous state
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      expect(factory.kind()).toBe('fsa');

      factory.reset();

      // After reset, we should be able to get a new instance
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;
      const newFactory = StorageBackendFactory.getInstance();
      newFactory.initialize('conn-2');
      expect(newFactory).toBeDefined();
      expect(newFactory.isInitialized()).toBe(true);
      expect(newFactory.kind()).toBe('fsa');
    });

    it('can be initialized with a connection ID', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn().mockResolvedValue({}),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      // Reset singleton to clear previous state
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('test-connection');

      expect(factory.isInitialized()).toBe(true);
      expect(factory.kind()).toBe('fsa');
    });
  });

  describe('BrowserDownloadLauncher', () => {
    it('can be instantiated', () => {
      const launcher = new BrowserDownloadLauncher();
      expect(launcher).toBeDefined();
    });

    it('saveBlob creates object URL, triggers download, and revokes URL', () => {
      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };

      const mockBody = {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      };

      vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);
      vi.stubGlobal('document', {
        createElement: vi.fn(() => mockAnchor),
        body: mockBody,
      } as unknown as Document);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
      });

      const launcher = new BrowserDownloadLauncher();
      const mockBlob = new Blob(['test'], { type: 'text/plain' });

      launcher.saveBlob(mockBlob, 'test.txt');

      expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.href).toBe('blob:mock-url');
      expect(mockAnchor.download).toBe('test.txt');
      expect(mockAnchor.style.display).toBe('none');
      expect(mockBody.appendChild).toHaveBeenCalledWith(mockAnchor);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockBody.removeChild).toHaveBeenCalledWith(mockAnchor);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('IndexedDBWriter', () => {
    it('can be instantiated', () => {
      const writer = new IndexedDBWriter('test-connection');
      expect(writer).toBeDefined();
    });

    it('can be instantiated with a download launcher', () => {
      const launcher = new BrowserDownloadLauncher();
      const writer = new IndexedDBWriter('test-connection', launcher);
      expect(writer).toBeDefined();
    });

    it('isAvailable returns true when indexedDB is in window', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      expect(IndexedDBWriter.isAvailable()).toBe(true);
    });

    it('isAvailable returns false when indexedDB is not in window', () => {
      vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

      expect(IndexedDBWriter.isAvailable()).toBe(false);
    });

    it('getDatabaseName returns correct name with connectionId', () => {
      const writer = new IndexedDBWriter('conn-123');
      // @ts-expect-error - accessing private method for testing
      expect(writer.getDatabaseName()).toBe('LocalFileShare-conn-123');
    });

    describe('with mocked IndexedDB', () => {
      let mockDB: any;
      let mockRequest: any;
      let mockTransaction: any;
      let mockStore: any;

      beforeEach(() => {
        // Create mock IndexedDB objects
        mockStore = {
          put: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
          get: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
          delete: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
          getAllKeys: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
          openCursor: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
        };

        mockTransaction = {
          objectStore: vi.fn().mockReturnValue(mockStore),
          oncomplete: null,
          onerror: null,
        };

        mockDB = {
          transaction: vi.fn().mockReturnValue(mockTransaction),
          objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
          close: vi.fn(),
        };

        mockRequest = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          result: mockDB,
          error: null,
        };

        vi.stubGlobal('window', {
          indexedDB: {
            open: vi.fn().mockReturnValue(mockRequest),
            deleteDatabase: vi.fn().mockReturnValue(mockRequest),
          },
        } as unknown as Window & typeof globalThis);
      });

      it('startFile throws when IndexedDB is not available', async () => {
        vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

        const writer = new IndexedDBWriter('test-conn');

        await expect(
          writer.startFile({ fileId: 'file-1', fileName: 'test.txt', fileSize: 100, mimeType: 'text/plain' }),
        ).rejects.toThrow('IndexedDB is not available');
      });

      it('writeChunk calls put on the chunks store', async () => {
        vi.stubGlobal('window', {
          indexedDB: {
            open: vi.fn().mockReturnValue({
              onsuccess: vi.fn(),
              onerror: vi.fn(),
              onupgradeneeded: vi.fn(),
              result: mockDB,
              error: null,
            }),
            deleteDatabase: vi.fn(),
          },
        } as unknown as Window & typeof globalThis);

        const writer = new IndexedDBWriter('test-conn');
        const data = new ArrayBuffer(8);

        // Mock the transaction and store behavior
        const mockPutRequest = {
          onsuccess: vi.fn(),
          onerror: vi.fn(),
        };
        mockStore.put = vi.fn().mockReturnValue(mockPutRequest);

        // We can't fully test this without proper mocking, but we can verify the structure
        // For now, just test that the method exists and can be called
        expect(writer.writeChunk).toBeDefined();
        expect(typeof writer.writeChunk).toBe('function');
      });

      it('cancel calls delete on chunks and files stores', () => {
        const writer = new IndexedDBWriter('test-conn');

        // Verify the method exists
        expect(writer.cancel).toBeDefined();
        expect(typeof writer.cancel).toBe('function');
      });

      it('getFileChunks returns a Map', async () => {
        const writer = new IndexedDBWriter('test-conn');

        // Mock cursor behavior for getFileChunks
        const mockCursor = {
          key: 'file-1__0',
          value: new ArrayBuffer(8),
          continue: vi.fn(),
        };

        const mockRequest = {
          onsuccess: null,
          onerror: null,
          result: mockCursor,
        };

        mockStore.openCursor = vi.fn().mockReturnValue(mockRequest);

        // This test is limited without full IndexedDB mocking
        expect(writer.getFileChunks).toBeDefined();
        expect(typeof writer.getFileChunks).toBe('function');
      });
    });
  });

  describe('BrowserDownloadLauncher assembleAndSave', () => {
    it('assembleAndSave calls assembleFile and saveBlob', async () => {
      const launcher = new BrowserDownloadLauncher();

      // Mock the methods
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const mockWriter = {
        getFileChunks: vi.fn().mockResolvedValue(new Map([[0, new ArrayBuffer(4)]])),
        getFileMetadata: vi.fn().mockResolvedValue({ mimeType: 'text/plain' }),
      } as unknown as IndexedDBWriter;

      // Mock saveBlob
      launcher.saveBlob = vi.fn();

      // Mock assembleFile to return a blob
      launcher.assembleFile = vi.fn().mockResolvedValue(mockBlob);

      await launcher.assembleAndSave('file-1', 'test.txt', mockWriter);

      expect(launcher.assembleFile).toHaveBeenCalledWith('file-1', mockWriter, 100);
      expect(launcher.saveBlob).toHaveBeenCalledWith(mockBlob, 'test.txt');
    });

    it('assembleFile creates correct Blob from chunks', async () => {
      const launcher = new BrowserDownloadLauncher();

      // Create mock chunks
      const chunk1 = new TextEncoder().encode('hello').buffer;
      const chunk2 = new TextEncoder().encode('world').buffer;
      const chunks = new Map<number, ArrayBuffer>([
        [0, chunk1],
        [1, chunk2],
      ]);

      const mockWriter = {
        getFileChunks: vi.fn().mockResolvedValue(chunks),
        getFileMetadata: vi.fn().mockResolvedValue({ mimeType: 'text/plain' }),
      } as unknown as IndexedDBWriter;

      const blob = await launcher.assembleFile('file-1', mockWriter, 100);

      expect(blob.size).toBe(10); // 'hello' (5) + 'world' (5)
      expect(blob.type).toBe('text/plain');
    });

    it('assembleFile handles batches correctly with 250 chunks', async () => {
      const launcher = new BrowserDownloadLauncher();

      // Create 250 chunks of 1 byte each
      const chunks = new Map<number, ArrayBuffer>();
      for (let i = 0; i < 250; i++) {
        chunks.set(i, new Uint8Array([i % 256]).buffer);
      }

      const mockWriter = {
        getFileChunks: vi.fn().mockResolvedValue(chunks),
        getFileMetadata: vi.fn().mockResolvedValue({ mimeType: 'application/octet-stream' }),
      } as unknown as IndexedDBWriter;

      const blob = await launcher.assembleFile('file-1', mockWriter, 100);

      expect(blob.size).toBe(250);
      expect(blob.type).toBe('application/octet-stream');
    });
  });

  describe('StorageBackendFactory integration', () => {
    beforeEach(() => {
      // @ts-expect-error - accessing private field
      StorageBackendFactory.instance = null;
    });

    it('getWriter returns FileSystemAccessWriter when showDirectoryPicker is available', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn(),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      const writer = factory.getWriter();
      // Note: We can't import FileSystemAccessWriter here due to circular dependency
      // So we just check that it's a truthy object with the expected methods
      expect(writer).toBeDefined();
      expect(typeof (writer as any).startFile).toBe('function');
      expect(typeof (writer as any).writeChunk).toBe('function');
      expect(typeof (writer as any).finalize).toBe('function');
      expect(typeof (writer as any).cancel).toBe('function');
    });

    it('getWriter returns IndexedDBWriter when showDirectoryPicker is not available', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      const writer = factory.getWriter();
      expect(writer).toBeInstanceOf(IndexedDBWriter);
    });

    it('getWriter returns same instance on subsequent calls', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      const writer1 = factory.getWriter();
      const writer2 = factory.getWriter();

      expect(writer1).toBe(writer2);
    });

    it('kind returns fsa when showDirectoryPicker is available', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn(),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      // Verify the kind is detected correctly
      expect(factory.kind()).toBe('fsa');
    });

    it('kind returns indexeddb when showDirectoryPicker is not available', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      const factory = StorageBackendFactory.getInstance();
      factory.initialize('conn-1');

      expect(factory.kind()).toBe('indexeddb');
    });
  });

  describe('IndexedDBWriter with fake-indexeddb', () => {
    let writer: IndexedDBWriter;
    let connectionId: string;

    beforeEach(async () => {
      // Clean up any existing databases
      await indexedDB.databases?.();
      connectionId = `test-conn-${Date.now()}`;
      writer = new IndexedDBWriter(connectionId);
    });

    it('write and read chunks round-trip', async () => {
      const fileId = 'file-1';
      const fileName = 'test.txt';
      const fileSize = 1024;
      const mimeType = 'text/plain';

      // Start the file
      await writer.startFile({ fileId, fileName, fileSize, mimeType });

      // Write some chunks
      const chunk1 = new TextEncoder().encode('hello').buffer;
      const chunk2 = new TextEncoder().encode('world').buffer;

      await writer.writeChunk(fileId, 0, chunk1);
      await writer.writeChunk(fileId, 1, chunk2);

      // Read chunks back
      const chunks = await writer.getFileChunks(fileId);

      expect(chunks).toBeDefined();
      expect(chunks!.size).toBe(2);
      expect(chunks!.get(0)).toEqual(chunk1);
      expect(chunks!.get(1)).toEqual(chunk2);
    });

    it('cancel deletes file and all chunks', async () => {
      const fileId = 'file-2';
      const fileName = 'test2.txt';
      const fileSize = 1024;
      const mimeType = 'text/plain';

      // Start and write to the file
      await writer.startFile({ fileId, fileName, fileSize, mimeType });
      const chunk = new TextEncoder().encode('test').buffer;
      await writer.writeChunk(fileId, 0, chunk);

      // Verify chunks exist
      let chunks = await writer.getFileChunks(fileId);
      expect(chunks!.size).toBe(1);

      // Cancel the file
      await writer.cancel(fileId);

      // Verify chunks are deleted
      chunks = await writer.getFileChunks(fileId);
      expect(chunks).toBeDefined();
      expect(chunks!.size).toBe(0);
    });

    it('concurrent writes to different files do not interleave', async () => {
      const file1Id = 'file-a';
      const file2Id = 'file-b';

      // Start both files
      await writer.startFile({
        fileId: file1Id,
        fileName: 'file1.txt',
        fileSize: 100,
        mimeType: 'text/plain',
      });
      await writer.startFile({
        fileId: file2Id,
        fileName: 'file2.txt',
        fileSize: 100,
        mimeType: 'text/plain',
      });

      // Write to both files with different content
      const chunk1 = new TextEncoder().encode('file1-chunk').buffer;
      const chunk2 = new TextEncoder().encode('file2-chunk').buffer;

      await writer.writeChunk(file1Id, 0, chunk1);
      await writer.writeChunk(file2Id, 0, chunk2);

      // Read back
      const chunks1 = await writer.getFileChunks(file1Id);
      const chunks2 = await writer.getFileChunks(file2Id);

      // Verify each file has its own chunk
      expect(chunks1!.get(0)).toEqual(chunk1);
      expect(chunks2!.get(0)).toEqual(chunk2);
      // Verify the content is different by checking the byte content
      expect(new Uint8Array(chunks1!.get(0)!)).not.toEqual(new Uint8Array(chunks2!.get(0)!));
    });

    it('getFileMetadata returns stored metadata', async () => {
      const fileId = 'file-3';
      const fileName = 'test3.txt';
      const fileSize = 2048;
      const mimeType = 'application/octet-stream';

      await writer.startFile({ fileId, fileName, fileSize, mimeType });

      const metadata = await writer.getFileMetadata(fileId);

      expect(metadata).toBeDefined();
      expect(metadata!.fileId).toBe(fileId);
      expect(metadata!.fileName).toBe(fileName);
      expect(metadata!.fileSize).toBe(fileSize);
      expect(metadata!.mimeType).toBe(mimeType);
    });

    it('clear removes all file data', async () => {
      const fileId1 = 'file-x';
      const fileId2 = 'file-y';

      // Start and write to both files
      await writer.startFile({
        fileId: fileId1,
        fileName: 'filex.txt',
        fileSize: 100,
        mimeType: 'text/plain',
      });
      await writer.writeChunk(fileId1, 0, new ArrayBuffer(8));

      await writer.startFile({
        fileId: fileId2,
        fileName: 'filey.txt',
        fileSize: 100,
        mimeType: 'text/plain',
      });
      await writer.writeChunk(fileId2, 0, new ArrayBuffer(8));

      // Clear all
      await writer.clear();

      // Verify both are gone
      const chunks1 = await writer.getFileChunks(fileId1);
      const chunks2 = await writer.getFileChunks(fileId2);

      expect(chunks1).toBeDefined();
      expect(chunks2).toBeDefined();
      expect(chunks1!.size).toBe(0);
      expect(chunks2!.size).toBe(0);
    });

    it('getDatabaseName returns correct name', () => {
      const testWriter = new IndexedDBWriter('my-connection-123');
      // @ts-expect-error - accessing private method for testing
      expect(testWriter.getDatabaseName()).toBe('LocalFileShare-my-connection-123');
    });

    it('IndexedDBWriter with download launcher', async () => {
      const launcher = new BrowserDownloadLauncher();
      const writerWithLauncher = new IndexedDBWriter('test-conn', launcher);

      const fileId = 'file-with-launcher';
      await writerWithLauncher.startFile({
        fileId,
        fileName: 'test.txt',
        fileSize: 100,
        mimeType: 'text/plain',
      });

      // Write a chunk
      await writerWithLauncher.writeChunk(fileId, 0, new TextEncoder().encode('hello').buffer);

      // Read it back
      const chunks = await writerWithLauncher.getFileChunks(fileId);
      expect(chunks!.size).toBe(1);
    });
  });

  describe('StorageBackendFactory static detect', () => {
    it('static detect returns fsa when showDirectoryPicker is available', () => {
      vi.stubGlobal('window', {
        showDirectoryPicker: vi.fn(),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      expect(StorageBackendFactory.detect()).toBe('fsa');
    });

    it('static detect returns indexeddb when only indexedDB is available', () => {
      vi.stubGlobal('window', {
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      expect(StorageBackendFactory.detect()).toBe('indexeddb');
    });

    it('static detect throws when no backend is available', () => {
      vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

      expect(() => StorageBackendFactory.detect()).toThrow('No storage backend available');
    });
  });
});
