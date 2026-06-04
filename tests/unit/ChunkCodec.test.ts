import {
  CHUNK_HEADER_SIZE,
  TOTAL_HEADER_SIZE,
  decodeChunk,
  decodeChunkHeader,
  encodeChunk,
  encodeChunkHeader,
} from '@lfs/shared';
import { generateUuid } from '@lfs/shared';
import { describe, expect, it } from 'vitest';

describe('ChunkCodec', () => {
  it('TOTAL_HEADER_SIZE matches CHUNK_HEADER_SIZE constant', () => {
    expect(TOTAL_HEADER_SIZE).toBe(CHUNK_HEADER_SIZE);
    expect(TOTAL_HEADER_SIZE).toBe(41);
  });

  it('round-trips an empty data chunk', () => {
    const fileId = generateUuid();
    const data = new ArrayBuffer(0);
    const buffer = encodeChunk(fileId, 0, false, data);
    const decoded = decodeChunk(buffer);
    expect(decoded.fileId).toBe(fileId);
    expect(decoded.index).toBe(0);
    expect(decoded.isLast).toBe(false);
    expect(decoded.data.byteLength).toBe(0);
  });

  it('round-trips a non-empty chunk with isLast=true', () => {
    const fileId = generateUuid();
    const data = new TextEncoder().encode('hello world').buffer;
    const buffer = encodeChunk(fileId, 7, true, data);
    const decoded = decodeChunk(buffer);
    expect(decoded.fileId).toBe(fileId);
    expect(decoded.index).toBe(7);
    expect(decoded.isLast).toBe(true);
    expect(new TextDecoder().decode(decoded.data)).toBe('hello world');
  });

  it('round-trips a chunk with isLast=false', () => {
    const fileId = generateUuid();
    const data = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const buffer = encodeChunk(fileId, 999, false, data);
    const decoded = decodeChunk(buffer);
    expect(decoded.isLast).toBe(false);
    expect(decoded.index).toBe(999);
    expect(Array.from(new Uint8Array(decoded.data))).toEqual([1, 2, 3, 4, 5]);
  });

  it('throws on decode with too-small buffer', () => {
    expect(() => decodeChunk(new ArrayBuffer(10))).toThrow();
  });

  it('encodeChunkHeader round-trips via decodeChunkHeader', () => {
    const fileId = generateUuid();
    const header = encodeChunkHeader(fileId, 42, true);
    const decoded = decodeChunkHeader(header);
    expect(decoded.fileId).toBe(fileId);
    expect(decoded.index).toBe(42);
    expect(decoded.isLast).toBe(true);
  });

  it('rejects fileId with wrong length', () => {
    expect(() => encodeChunkHeader('not-a-uuid', 0, false)).toThrow();
  });

  it('rejects negative index', () => {
    const fileId = generateUuid();
    expect(() => encodeChunkHeader(fileId, -1, false)).toThrow();
  });

  it('rejects non-integer index', () => {
    const fileId = generateUuid();
    expect(() => encodeChunkHeader(fileId, 1.5, false)).toThrow();
  });

  it('rejects index > uint32 max', () => {
    const fileId = generateUuid();
    expect(() => encodeChunkHeader(fileId, 0x1_0000_0000, false)).toThrow();
  });
});
