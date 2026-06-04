import { CHUNK_HEADER_SIZE } from './Constants.js';

export interface ChunkHeader {
  fileId: string;
  index: number;
  isLast: boolean;
}

export interface DecodedChunk {
  fileId: string;
  index: number;
  isLast: boolean;
  data: ArrayBuffer;
}

const FILE_ID_LENGTH = 36;
const HEADER_FIXED_BYTES = FILE_ID_LENGTH + 4 + 1;
const OFFSET_FILE_ID = 0;
const OFFSET_INDEX = FILE_ID_LENGTH;
const OFFSET_IS_LAST = FILE_ID_LENGTH + 4;
export const TOTAL_HEADER_SIZE = HEADER_FIXED_BYTES;

if (TOTAL_HEADER_SIZE !== CHUNK_HEADER_SIZE) {
  throw new Error(`Header size mismatch: ${TOTAL_HEADER_SIZE} != ${CHUNK_HEADER_SIZE}`);
}

export function encodeChunkHeader(fileId: string, index: number, isLast: boolean): ArrayBuffer {
  if (fileId.length !== FILE_ID_LENGTH) {
    throw new Error(`fileId must be a ${FILE_ID_LENGTH}-char UUID string`);
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('index must be a non-negative integer');
  }
  if (index > 0xffffffff) {
    throw new Error('index must fit in 32-bit unsigned integer');
  }

  const buffer = new ArrayBuffer(TOTAL_HEADER_SIZE);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  for (let i = 0; i < FILE_ID_LENGTH; i++) {
    bytes[OFFSET_FILE_ID + i] = fileId.charCodeAt(i);
  }
  view.setUint32(OFFSET_INDEX, index, false);
  bytes[OFFSET_IS_LAST] = isLast ? 1 : 0;

  return buffer;
}

export function decodeChunkHeader(buffer: ArrayBuffer): ChunkHeader {
  if (buffer.byteLength < TOTAL_HEADER_SIZE) {
    throw new Error(`Buffer too small for chunk header: ${buffer.byteLength} < ${TOTAL_HEADER_SIZE}`);
  }
  const bytes = new Uint8Array(buffer, 0, TOTAL_HEADER_SIZE);
  const view = new DataView(buffer);

  let fileId = '';
  for (let i = 0; i < FILE_ID_LENGTH; i++) {
    fileId += String.fromCharCode(bytes[OFFSET_FILE_ID + i] ?? 0);
  }
  const index = view.getUint32(OFFSET_INDEX, false);
  const isLast = bytes[OFFSET_IS_LAST] === 1;

  return { fileId, index, isLast };
}

export interface EncodedChunk {
  header: ArrayBuffer;
  data: ArrayBuffer;
}

export function encodeChunk(fileId: string, index: number, isLast: boolean, data: ArrayBuffer): ArrayBuffer {
  const header = encodeChunkHeader(fileId, index, isLast);
  const combined = new ArrayBuffer(TOTAL_HEADER_SIZE + data.byteLength);
  new Uint8Array(combined, 0, TOTAL_HEADER_SIZE).set(new Uint8Array(header));
  new Uint8Array(combined, TOTAL_HEADER_SIZE, data.byteLength).set(new Uint8Array(data));
  return combined;
}

export function decodeChunk(buffer: ArrayBuffer): DecodedChunk {
  const header = decodeChunkHeader(buffer);
  const data = buffer.slice(TOTAL_HEADER_SIZE);
  return {
    fileId: header.fileId,
    index: header.index,
    isLast: header.isLast,
    data,
  };
}
