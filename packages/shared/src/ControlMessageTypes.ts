/**
 * WebRTC control-channel message types — JSON over the control data channel.
 */

export type ControlMessageType =
  | 'FILE_OFFER'
  | 'FILE_ACCEPT'
  | 'FILE_REJECT'
  | 'FILE_CANCEL'
  | 'TRANSFER_DONE'
  | 'FILE_RECEIVED'
  | 'CHUNK_ACK'
  | 'CHUNK_REQUEST_NACK'
  | 'PROGRESS'
  | 'CANCELLED'
  | 'CLOSE'
  | 'IDLE_PING'
  | 'IDLE_PONG';

export interface FileOfferEntry {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileOfferData {
  files: FileOfferEntry[];
  batchId: string;
}

export interface FileAcceptData {
  fileId: string;
  batchId: string;
}

export interface FileRejectData {
  fileId: string;
  batchId: string;
  reason?: string;
}

export interface FileCancelData {
  fileId: string;
  reason?: string;
}

export interface TransferDoneData {
  fileId: string;
  totalChunks: number;
}

export interface FileReceivedData {
  fileId: string;
  totalChunks: number;
  expectedHash: string;
}

export interface ChunkAckData {
  fileId: string;
  index: number;
}

export interface ChunkRequestNackData {
  fileId: string;
  missingIndices: number[];
  round: number;
}

export interface ProgressData {
  fileId: string;
  bytesSent: number;
  totalBytes: number;
  chunksSent: number;
  totalChunks: number;
}

export interface CancelledData {
  fileId: string;
  reason?: string;
}

export interface CloseData {
  reason: string;
}

export interface IdlePingData {
  timestamp: number;
}

export interface IdlePongData {
  timestamp: number;
}

export interface ControlEnvelope<T = unknown> {
  type: ControlMessageType;
  from: string;
  data: T;
}

export type FileOfferMessage = ControlEnvelope<FileOfferData> & { type: 'FILE_OFFER' };
export type FileAcceptMessage = ControlEnvelope<FileAcceptData> & { type: 'FILE_ACCEPT' };
export type FileRejectMessage = ControlEnvelope<FileRejectData> & { type: 'FILE_REJECT' };
export type FileCancelMessage = ControlEnvelope<FileCancelData> & { type: 'FILE_CANCEL' };
export type TransferDoneMessage = ControlEnvelope<TransferDoneData> & { type: 'TRANSFER_DONE' };
export type FileReceivedMessage = ControlEnvelope<FileReceivedData> & { type: 'FILE_RECEIVED' };
export type ChunkAckMessage = ControlEnvelope<ChunkAckData> & { type: 'CHUNK_ACK' };
export type ChunkRequestNackMessage = ControlEnvelope<ChunkRequestNackData> & { type: 'CHUNK_REQUEST_NACK' };
export type ProgressMessage = ControlEnvelope<ProgressData> & { type: 'PROGRESS' };
export type CancelledMessage = ControlEnvelope<CancelledData> & { type: 'CANCELLED' };
export type CloseMessage = ControlEnvelope<CloseData> & { type: 'CLOSE' };
export type IdlePingMessage = ControlEnvelope<IdlePingData> & { type: 'IDLE_PING' };
export type IdlePongMessage = ControlEnvelope<IdlePongData> & { type: 'IDLE_PONG' };

export type AnyControlMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileCancelMessage
  | TransferDoneMessage
  | FileReceivedMessage
  | ChunkAckMessage
  | ChunkRequestNackMessage
  | ProgressMessage
  | CancelledMessage
  | CloseMessage
  | IdlePingMessage
  | IdlePongMessage;
