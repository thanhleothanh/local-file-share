/**
 * FileQueue implements a FIFO queue for managing file transfers.
 * It works with FileEntry objects and skips terminal-state files when starting the next file.
 */

import type { FileEntry, FileState } from './FileStateMachine.js';
import { FileStateMachine } from './FileStateMachine.js';

/**
 * FileQueue manages a FIFO queue of file transfers.
 * Only non-terminal state files can be started.
 */
export class FileQueue {
  private queue: FileEntry[] = [];
  private currentFileId: string | null = null;

  /**
   * Add a file to the end of the queue.
   */
  enqueue(entry: FileEntry): void {
    this.queue.push(entry);
    console.info(`[FileQueue] enqueued ${entry.fileId} (state: ${entry.state})`);
  }

  /**
   * Remove and return the file at the front of the queue.
   * Does not skip terminal-state files - use startNextFile for that.
   */
  dequeue(): FileEntry | null {
    const entry = this.queue.shift() ?? null;
    if (entry) {
      console.info(`[FileQueue] dequeued ${entry.fileId}`);
    }
    return entry;
  }

  /**
   * Get the file at the front of the queue without removing it.
   */
  peek(): FileEntry | null {
    return this.queue[0] ?? null;
  }

  /**
   * Remove a specific file from the queue by fileId.
   */
  remove(fileId: string): boolean {
    const index = this.queue.findIndex((entry) => entry.fileId === fileId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.info(`[FileQueue] removed ${fileId} from queue`);

      // If this was the current file, clear it
      if (this.currentFileId === fileId) {
        this.currentFileId = null;
      }
      return true;
    }
    return false;
  }

  /**
   * Get the current queue size.
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is empty.
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all files from the queue.
   */
  clear(): void {
    this.queue = [];
    this.currentFileId = null;
    console.info('[FileQueue] cleared');
  }

  /**
   * Get all files in the queue.
   */
  getAll(): FileEntry[] {
    return [...this.queue];
  }

  /**
   * Start the next file in the queue.
   * Skips files that are in terminal states (COMPLETED, REJECTED, FAILED, CANCELLED).
   * Returns the file that was started, or null if no valid file found.
   */
  startNextFile(): FileEntry | null {
    // First, check if there's a current file that needs to be cleared
    if (this.currentFileId) {
      // Find and remove the current file from the queue
      const currentIndex = this.queue.findIndex((entry) => entry.fileId === this.currentFileId);
      if (currentIndex !== -1) {
        this.queue.splice(currentIndex, 1);
      }
      this.currentFileId = null;
    }

    // Find the first non-terminal state file in the queue
    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i];
      if (entry && !FileStateMachine.isTerminal(entry.state as FileState)) {
        // Remove from queue and set as current
        this.queue.splice(i, 1);
        this.currentFileId = entry.fileId;
        console.info(`[FileQueue] started ${entry.fileId} (was ${entry.state}, now current)`);
        return entry;
      }
    }

    // No valid file found
    this.currentFileId = null;
    console.info('[FileQueue] no valid file to start (all terminal states)');
    return null;
  }

  /**
   * Get the current file ID.
   */
  getCurrentFileId(): string | null {
    return this.currentFileId;
  }

  /**
   * Set the current file ID (used when a file starts transferring).
   */
  setCurrentFileId(fileId: string | null): void {
    this.currentFileId = fileId;
    if (fileId) {
      console.info(`[FileQueue] set current file: ${fileId}`);
    } else {
      console.info('[FileQueue] cleared current file');
    }
  }

  /**
   * Check if a specific file is currently transferring.
   */
  isTransferring(fileId: string): boolean {
    return this.currentFileId === fileId;
  }
}
