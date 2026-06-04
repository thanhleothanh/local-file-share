import type { FileMetadata, FileSystemWriter } from './FileSystemWriter.js';

/**
 * Writes files to disk using the File System Access API.
 * Requests directory permission once per session and reuses it for subsequent files.
 */
export class FileSystemAccessWriter implements FileSystemWriter {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private writableStreams: Map<string, FileSystemWritableFileStream> = new Map();
  private fileHandles: Map<string, FileSystemFileHandle> = new Map();

  /**
   * Check if the File System Access API is available.
   */
  static isAvailable(): boolean {
    return 'showDirectoryPicker' in window;
  }

  /**
   * Start writing a new file.
   * On the first file, prompts the user to select a directory.
   * For subsequent files, uses the previously selected directory.
   */
  async startFile(meta: FileMetadata): Promise<string> {
    if (!FileSystemAccessWriter.isAvailable()) {
      throw new Error('File System Access API is not available');
    }

    // If we don't have a directory handle yet, request one
    if (!this.directoryHandle) {
      this.directoryHandle = await (
        window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker();
    }

    // Create a file handle in the directory
    const fileHandle = await this.directoryHandle.getFileHandle(meta.fileName, { create: true });
    this.fileHandles.set(meta.fileId, fileHandle);

    // Create a writable stream
    const writable = await fileHandle.createWritable();
    this.writableStreams.set(meta.fileId, writable);

    return meta.fileId;
  }

  /**
   * Write a chunk for the given file.
   * Creates the writable stream if not already created (for the first chunk).
   */
  async writeChunk(fileId: string, _index: number, data: ArrayBuffer): Promise<void> {
    let writable = this.writableStreams.get(fileId);

    // If no writable stream exists for this file, we need to start the file
    // This can happen if startFile wasn't called or if this is a new session
    if (!writable) {
      const fileHandle = this.fileHandles.get(fileId);
      if (!fileHandle) {
        throw new Error(`No file handle for fileId: ${fileId}`);
      }
      writable = await fileHandle.createWritable();
      this.writableStreams.set(fileId, writable);
    }

    // Write the chunk
    await writable.write(data);

    // Yield to the event loop to allow the write to complete
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Finalize the file, closing the writable stream.
   */
  async finalize(fileId: string): Promise<void> {
    const writable = this.writableStreams.get(fileId);
    if (writable) {
      await writable.close();
      this.writableStreams.delete(fileId);
    }
    this.fileHandles.delete(fileId);
  }

  /**
   * Cancel the file writing, aborting the writable stream.
   */
  async cancel(fileId: string): Promise<void> {
    const writable = this.writableStreams.get(fileId);
    if (writable) {
      try {
        await writable.abort();
      } catch {
        // Ignore errors during abort
      }
      this.writableStreams.delete(fileId);
    }
    this.fileHandles.delete(fileId);
  }

  /**
   * Open the downloads folder in the system file explorer.
   * Only works if a directory has been selected.
   */
  async openDirectory(): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }
    // Note: There's no standard API to open a directory in the file explorer
    // This is a placeholder for future implementation
    console.warn('Opening directory is not yet implemented');
  }

  /**
   * Clear all handles and streams.
   */
  async clear(): Promise<void> {
    // Close all writable streams
    for (const writable of this.writableStreams.values()) {
      try {
        await writable.close();
      } catch {
        // Ignore errors during close
      }
    }
    this.writableStreams.clear();
    this.fileHandles.clear();
    this.directoryHandle = null;
  }
}

// Type definitions for File System Access API (not available in TypeScript lib by default)
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
