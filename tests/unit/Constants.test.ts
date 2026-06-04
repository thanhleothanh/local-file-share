import {
  ACK_TIMEOUT_MS,
  BACKPRESSURE_SAFETY_TIMEOUT_MS,
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  CHUNK_HEADER_SIZE,
  CHUNK_SIZE,
  FSA_QUEUE_FILE_COUNT_CAP,
  IDB_QUEUE_SIZE_CAP_BYTES,
  IDLE_TIMEOUT_MS,
  MAX_NACK_ROUNDS,
} from '@lfs/shared';
import { describe, expect, it } from 'vitest';

describe('Constants', () => {
  it('CHUNK_SIZE is 16384', () => {
    expect(CHUNK_SIZE).toBe(16384);
  });
  it('CHUNK_HEADER_SIZE is 41', () => {
    expect(CHUNK_HEADER_SIZE).toBe(41);
  });
  it('BUFFERED_AMOUNT_LOW_THRESHOLD is 1 MiB', () => {
    expect(BUFFERED_AMOUNT_LOW_THRESHOLD).toBe(1024 * 1024);
  });
  it('BACKPRESSURE_SAFETY_TIMEOUT_MS is 60s', () => {
    expect(BACKPRESSURE_SAFETY_TIMEOUT_MS).toBe(60_000);
  });
  it('ACK_TIMEOUT_MS is 30s', () => {
    expect(ACK_TIMEOUT_MS).toBe(30_000);
  });
  it('IDLE_TIMEOUT_MS is 10 minutes', () => {
    expect(IDLE_TIMEOUT_MS).toBe(600_000);
  });
  it('MAX_NACK_ROUNDS is 3', () => {
    expect(MAX_NACK_ROUNDS).toBe(3);
  });
  it('FSA_QUEUE_FILE_COUNT_CAP is 100', () => {
    expect(FSA_QUEUE_FILE_COUNT_CAP).toBe(100);
  });
  it('IDB_QUEUE_SIZE_CAP_BYTES is 1 GiB', () => {
    expect(IDB_QUEUE_SIZE_CAP_BYTES).toBe(1024 * 1024 * 1024);
  });
});
