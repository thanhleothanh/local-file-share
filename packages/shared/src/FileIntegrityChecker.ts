/**
 * FileIntegrityChecker performs integrity checks on received file chunks.
 * Compares expected chunk count against received chunks and identifies missing indices.
 */

import type { ChunkBuffer } from './ChunkBuffer.js';

/**
 * Result of an integrity check.
 */
export interface IntegrityCheckResult {
  /**
   * Whether all chunks are present.
   */
  complete: boolean;
  /**
   * List of missing chunk indices (empty if complete).
   */
  missingIndices: number[];
}

/**
 * FileIntegrityChecker checks file integrity by comparing expected chunks against received chunks.
 */
export class FileIntegrityChecker {
  private readonly buffer: ChunkBuffer;

  constructor(buffer: ChunkBuffer) {
    this.buffer = buffer;
  }

  /**
   * Check if all chunks for a file have been received.
   *
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks expected
   * @returns Integrity check result with complete flag and missing indices
   */
  check(fileId: string, totalChunks: number): IntegrityCheckResult {
    const missing = this.buffer.missingIndices(fileId, totalChunks);
    return {
      complete: missing.length === 0,
      missingIndices: missing,
    };
  }

  /**
   * Check if all chunks for a file have been received, using the buffer's stored total.
   *
   * @param fileId - The file ID
   * @returns Integrity check result with complete flag and missing indices
   */
  checkFromBuffer(fileId: string): IntegrityCheckResult {
    // Get the total chunks from the buffer (stored when isLast=true was received)
    // For now, we use a large number to check all available chunks
    // The actual total should come from the FILE_OFFER message
    const maxChunks = 1000000; // Reasonable upper bound
    return this.check(fileId, maxChunks);
  }

  /**
   * Get the buffer being used by this checker.
   */
  getBuffer(): ChunkBuffer {
    return this.buffer;
  }
}
