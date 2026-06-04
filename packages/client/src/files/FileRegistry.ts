/**
 * FileRegistry maintains an in-memory registry of all file transfers.
 * Files are stored with their metadata and state, sorted by creation time.
 */

import type { FileEntry, FileState, FileEvent } from './FileStateMachine.js';
import { FileStateMachine } from './FileStateMachine.js';

/**
 * FileRegistry stores and manages file entries with their state.
 */
export class FileRegistry {
  private files: Map<string, FileEntry> = new Map();

  /**
   * Add a new file entry to the registry.
   * If a file with the same ID already exists, it will be overwritten.
   */
  add(entry: FileEntry): void {
    this.files.set(entry.fileId, { ...entry });
    console.info(`[FileRegistry] added ${entry.fileId} (state: ${entry.state})`);
  }

  /**
   * Update a file entry in the registry.
   * Returns true if the file existed and was updated, false otherwise.
   */
  update(fileId: string, updates: Partial<FileEntry>): boolean {
    const existing = this.files.get(fileId);
    if (!existing) {
      return false;
    }

    const updated: FileEntry = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.files.set(fileId, updated);
    console.info(`[FileRegistry] updated ${fileId} (state: ${updated.state})`);
    return true;
  }

  /**
   * Transition a file to a new state.
   * This is a convenience method that updates the state field.
   */
  transition(fileId: string, event: FileEvent): boolean {
    const existing = this.files.get(fileId);
    if (!existing) {
      console.warn(`[FileRegistry] cannot transition ${fileId}: not found`);
      return false;
    }

    const result = FileStateMachine.transition(existing.state as FileState, event, fileId);
    if (result.isValid) {
      return this.update(fileId, { state: result.newState });
    }
    return false;
  }

  /**
   * Get a file entry by ID.
   */
  get(fileId: string): FileEntry | null {
    return this.files.get(fileId) ?? null;
  }

  /**
   * Get all file entries, sorted by createdAt descending (newest first).
   */
  getAll(): FileEntry[] {
    return Array.from(this.files.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  /**
   * Get all files in a specific state.
   */
  getByState(state: FileState): FileEntry[] {
    return this.getAll().filter((entry) => entry.state === state);
  }

  /**
   * Get all non-terminal state files.
   */
  getActiveFiles(): FileEntry[] {
    return this.getAll().filter(
      (entry) => !FileStateMachine.isTerminal(entry.state as FileState)
    );
  }

  /**
   * Check if a file exists in the registry.
   */
  has(fileId: string): boolean {
    return this.files.has(fileId);
  }

  /**
   * Remove a file from the registry.
   */
  remove(fileId: string): boolean {
    if (this.files.has(fileId)) {
      this.files.delete(fileId);
      console.info(`[FileRegistry] removed ${fileId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all files from the registry.
   */
  clear(): void {
    this.files.clear();
    console.info('[FileRegistry] cleared');
  }

  /**
   * Get the number of files in the registry.
   */
  size(): number {
    return this.files.size;
  }

  /**
   * Get files that can be accepted (PENDING state).
   */
  getPendingFiles(): FileEntry[] {
    return this.getByState('PENDING');
  }

  /**
   * Get files that are currently queued.
   */
  getQueuedFiles(): FileEntry[] {
    return this.getByState('QUEUED');
  }

  /**
   * Get files that are currently transferring.
   */
  getTransferringFiles(): FileEntry[] {
    return this.getByState('TRANSFERRING');
  }

  /**
   * Get the count of files by state.
   */
  getStateCounts(): Record<FileState, number> {
    const counts: Record<FileState, number> = {
      PENDING: 0,
      QUEUED: 0,
      TRANSFERRING: 0,
      COMPLETED: 0,
      REJECTED: 0,
      FAILED: 0,
      CANCELLED: 0,
    };

    for (const entry of this.files.values()) {
      const state = entry.state as FileState;
      if (counts[state] !== undefined) {
        counts[state]++;
      }
    }

    return counts;
  }

  /**
   * Subscribe to changes in the registry.
   * The callback is invoked whenever a file is added, updated, or removed.
   */
  private subscribers: Array<(registry: FileRegistry) => void> = [];

  subscribe(callback: (registry: FileRegistry) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index !== -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Notify all subscribers of a change.
   * Called internally after modifications.
   */
  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this);
      } catch (error) {
        console.error('[FileRegistry] subscriber error:', error);
      }
    }
  }
}
