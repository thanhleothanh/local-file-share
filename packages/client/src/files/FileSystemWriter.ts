/**
 * Interface for writing files to storage.
 * Used by FileReceiver to persist received chunks.
 */
export interface FileSystemWriter {
  /**
   * Start a new file with the given metadata.
   * Returns a unique identifier for this file writing session.
   */
  startFile(meta: FileMetadata): Promise<string>;

  /**
   * Write a chunk for the given file.
   */
  writeChunk(fileId: string, index: number, data: ArrayBuffer): Promise<void>;

  /**
   * Finalize the file, ensuring all data is flushed.
   */
  finalize(fileId: string): Promise<void>;

  /**
   * Cancel the file writing, cleaning up any partial data.
   */
  cancel(fileId: string): Promise<void>;
}

export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
