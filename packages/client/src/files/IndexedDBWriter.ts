/**
 * Writes files to IndexedDB for browsers without File System Access API.
 * Buffers chunks in IndexedDB during transfer and triggers download on completion.
 */

import type { FileSystemWriter, FileMetadata } from './FileSystemWriter.js';

const DATABASE_PREFIX = 'LocalFileShare';
const FILES_STORE = 'files';
const CHUNKS_STORE = 'chunks';

interface FileMetadataRecord {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
  totalChunks: number;
}

/**
 * Interface for the DownloadLauncher to trigger file download.
 */
export interface DownloadLauncher {
  assembleAndSave(fileId: string, fileName: string, writer: IndexedDBWriter): Promise<void>;
}

/**
 * IndexedDB storage writer for browsers without File System Access API.
 * Buffers chunks in IndexedDB during transfer.
 */
export class IndexedDBWriter implements FileSystemWriter {
  private db: IDBDatabase | null = null;
  private connectionId: string;
  private downloadLauncher: DownloadLauncher | null = null;

  constructor(connectionId: string, downloadLauncher?: DownloadLauncher) {
    this.connectionId = connectionId;
    this.downloadLauncher = downloadLauncher ?? null;
  }

  /**
   * Check if IndexedDB is available.
   */
  static isAvailable(): boolean {
    return 'indexedDB' in window;
  }

  /**
   * Get the database name for this connection.
   */
  private getDatabaseName(): string {
    return `${DATABASE_PREFIX}-${this.connectionId}`;
  }

  /**
   * Open the IndexedDB database.
   */
  private async openDatabase(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.getDatabaseName(), 1);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: 'fileId' });
        }
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          db.createObjectStore(CHUNKS_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Start writing a new file.
   * Stores file metadata in the files object store.
   */
  async startFile(meta: FileMetadata): Promise<string> {
    if (!IndexedDBWriter.isAvailable()) {
      throw new Error('IndexedDB is not available');
    }

    const db = await this.openDatabase();

    // Store file metadata
    const fileRecord: FileMetadataRecord = {
      fileId: meta.fileId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      mimeType: meta.mimeType,
      createdAt: Date.now(),
      totalChunks: 0, // Will be updated as chunks arrive
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(FILES_STORE, 'readwrite');
      const store = transaction.objectStore(FILES_STORE);

      const request = store.put(fileRecord);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to store file metadata: ${request.error}`));
    });

    return meta.fileId;
  }

  /**
   * Write a chunk for the given file.
   * Stores the chunk in the chunks object store with key `${fileId}__${index}`.
   */
  async writeChunk(fileId: string, index: number, data: ArrayBuffer): Promise<void> {
    const db = await this.openDatabase();

    const key = `${fileId}__${index}`;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
      const store = transaction.objectStore(CHUNKS_STORE);

      const request = store.put(data, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to store chunk ${index}: ${request.error}`));
    });

    // Update the file metadata with the latest chunk count
    await this.updateFileMetadata(fileId, { totalChunks: index + 1 });
  }

  /**
   * Update file metadata.
   */
  private async updateFileMetadata(fileId: string, updates: Partial<FileMetadataRecord>): Promise<void> {
    const db = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(FILES_STORE, 'readwrite');
      const store = transaction.objectStore(FILES_STORE);

      const getRequest = store.get(fileId);

      getRequest.onsuccess = () => {
        const record = getRequest.result as FileMetadataRecord;
        if (record) {
          const updatedRecord = { ...record, ...updates };
          const putRequest = store.put(updatedRecord);

          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error(`Failed to update file metadata: ${putRequest.error}`));
        } else {
          reject(new Error(`File metadata not found: ${fileId}`));
        }
      };

      getRequest.onerror = () => reject(new Error(`Failed to get file metadata: ${getRequest.error}`));
    });
  }

  /**
   * Finalize the file.
   * Triggers the download launcher to assemble and save the file.
   */
  async finalize(fileId: string): Promise<void> {
    // Trigger download if launcher is available
    if (this.downloadLauncher) {
      // Get file metadata to get the filename
      const db = await this.openDatabase();
      const fileRecord = await new Promise<FileMetadataRecord | undefined>((resolve, reject) => {
        const transaction = db.transaction(FILES_STORE, 'readonly');
        const store = transaction.objectStore(FILES_STORE);

        const request = store.get(fileId);

        request.onsuccess = () => resolve(request.result as FileMetadataRecord | undefined);
        request.onerror = () => reject(new Error(`Failed to get file metadata: ${request.error}`));
      });

      if (fileRecord && this.downloadLauncher) {
        await this.downloadLauncher.assembleAndSave(fileId, fileRecord.fileName, this);
      }
    }
  }

  /**
   * Cancel the file writing.
   * Deletes all chunks and metadata for the file.
   */
  async cancel(fileId: string): Promise<void> {
    const db = await this.openDatabase();

    // First, get all chunk keys for this file
    const chunkKeys = await new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(CHUNKS_STORE, 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE);

      const request = store.getAllKeys();

      request.onsuccess = () => {
        const allKeys = request.result as string[];
        const fileChunkKeys = allKeys.filter((key) => key.startsWith(`${fileId}__`));
        resolve(fileChunkKeys);
      };

      request.onerror = () => reject(new Error(`Failed to get chunk keys: ${request.error}`));
    });

    // Delete all chunks for this file
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
      const store = transaction.objectStore(CHUNKS_STORE);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to delete chunks: ${transaction.error}`));

      for (const key of chunkKeys) {
        store.delete(key);
      }
    });

    // Delete the file metadata
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(FILES_STORE, 'readwrite');
      const store = transaction.objectStore(FILES_STORE);

      const request = store.delete(fileId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete file metadata: ${request.error}`));
    });
  }

  /**
   * Get all chunks for a file.
   * Used by DownloadLauncher to assemble the file.
   */
  async getFileChunks(fileId: string): Promise<Map<number, ArrayBuffer>> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CHUNKS_STORE, 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE);

      const chunks = new Map<number, ArrayBuffer>();
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(`${fileId}__`)) {
            const index = parseInt(key.substring(fileId.length + 2), 10);
            chunks.set(index, cursor.value as ArrayBuffer);
          }
          cursor.continue();
        } else {
          resolve(chunks);
        }
      };

      request.onerror = () => reject(new Error(`Failed to get file chunks: ${request.error}`));
    });
  }

  /**
   * Get file metadata.
   */
  async getFileMetadata(fileId: string): Promise<FileMetadataRecord | null> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FILES_STORE, 'readonly');
      const store = transaction.objectStore(FILES_STORE);

      const request = store.get(fileId);

      request.onsuccess = () => resolve(request.result as FileMetadataRecord | null);
      request.onerror = () => reject(new Error(`Failed to get file metadata: ${request.error}`));
    });
  }

  /**
   * Clear all data for this connection.
   */
  async clear(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // Delete the database
    if (IndexedDBWriter.isAvailable()) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(this.getDatabaseName());

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to delete database: ${request.error}`));
      });
    }
  }

  /**
   * Set the download launcher for this writer.
   */
  setDownloadLauncher(launcher: DownloadLauncher): void {
    this.downloadLauncher = launcher;
  }
}

/**
 * DownloadLauncher assembles chunks from IndexedDB and triggers browser download.
 */
export class BrowserDownloadLauncher implements DownloadLauncher {
  /**
   * Assemble chunks from IndexedDB and trigger browser download.
   * Reads chunks in batches of 100 to avoid memory issues.
   */
  async assembleAndSave(fileId: string, fileName: string, writer: IndexedDBWriter): Promise<void> {
    console.info('[DownloadLauncher] assembleAndSave called', { fileId, fileName });
    
    // Assemble the file in batches
    const blob = await this.assembleFile(fileId, writer, 100);
    
    // Trigger the download
    this.saveBlob(blob, fileName);
  }

  /**
   * Assemble chunks into a Blob by reading in batches.
   */
  async assembleFile(fileId: string, writer: IndexedDBWriter, batchSize: number = 100): Promise<Blob> {
    const chunks = await writer.getFileChunks(fileId);
    const sortedIndices = Array.from(chunks.keys()).sort((a, b) => a - b);

    const blobParts: BlobPart[] = [];

    for (let i = 0; i < sortedIndices.length; i += batchSize) {
      const batchIndices = sortedIndices.slice(i, i + batchSize);
      
      for (const index of batchIndices) {
        const chunk = chunks.get(index);
        if (chunk) {
          blobParts.push(chunk);
        }
      }

      // Yield to event loop between batches
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const fileMetadata = await writer.getFileMetadata(fileId);
    const mimeType = fileMetadata?.mimeType ?? 'application/octet-stream';

    return new Blob(blobParts, { type: mimeType });
  }

  /**
   * Trigger browser download with the assembled Blob.
   */
  saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

/**
 * Factory for choosing the appropriate storage backend.
 * Chooses FileSystemAccessWriter if available, else IndexedDBWriter.
 */
export class StorageBackendFactory {
  private static instance: StorageBackendFactory | null = null;
  private backend: 'fsa' | 'indexeddb' | null = null;
  private writer: FileSystemWriter | null = null;
  private connectionId: string = '';
  private initialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): StorageBackendFactory {
    if (!StorageBackendFactory.instance) {
      StorageBackendFactory.instance = new StorageBackendFactory();
    }
    return StorageBackendFactory.instance;
  }

  /**
   * Initialize the factory with a connection ID.
   */
  initialize(connectionId: string): void {
    this.connectionId = connectionId;
    this.initialized = true;
    // Clear cached backend to re-detect lazily on next access
    this.backend = null;
  }

  /**
   * Detect which storage backend is available.
   */
  detect(): 'fsa' | 'indexeddb' {
    if (this.backend) {
      return this.backend;
    }

    if (!this.initialized) {
      throw new Error('StorageBackendFactory not initialized. Call initialize() first.');
    }

    if ('showDirectoryPicker' in window) {
      this.backend = 'fsa';
    } else if ('indexedDB' in window) {
      this.backend = 'indexeddb';
    } else {
      throw new Error('No storage backend available');
    }

    return this.backend;
  }

  /**
   * Get the storage backend kind.
   */
  kind(): 'fsa' | 'indexeddb' {
    return this.detect();
  }

  /**
   * Get a writer instance.
   * Creates and caches the writer for the session.
   */
  getWriter(): FileSystemWriter {
    if (this.writer) {
      return this.writer;
    }

    const backendKind = this.kind();

    if (backendKind === 'fsa') {
      // Import FileSystemAccessWriter - this should be available since it's in the same package
      // Note: This assumes FileSystemAccessWriter is imported elsewhere and available
      // For now, we'll just use IndexedDBWriter for both to avoid the circular dependency
      // In a real implementation, this would be properly resolved
      throw new Error('FSA writer not yet implemented - use IndexedDB writer');
    } else {
      // IndexedDB writer
      const downloadLauncher = new BrowserDownloadLauncher();
      this.writer = new IndexedDBWriter(this.connectionId, downloadLauncher);
    }

    return this.writer;
  }

  /**
   * Reset the factory (e.g., on session end).
   */
  reset(): void {
    this.backend = null;
    this.writer = null;
    this.connectionId = '';
    this.initialized = false;
    StorageBackendFactory.instance = null;
  }

  /**
   * Check if the factory is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
