/**
 * Single source of truth for magic numbers used across the application.
 * Values are decided by ADRs in `.docs/adr/`.
 */

export const CHUNK_SIZE = 16384;
export const CHUNK_HEADER_SIZE = 41;
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1024 * 1024;
export const BACKPRESSURE_SAFETY_TIMEOUT_MS = 60000;
export const ACK_TIMEOUT_MS = 30000;
export const IDLE_TIMEOUT_MS = 600000;
export const MAX_NACK_ROUNDS = 3;
export const FSA_QUEUE_FILE_COUNT_CAP = 100;
export const IDB_QUEUE_SIZE_CAP_BYTES = 1024 * 1024 * 1024;
export const TOAST_AUTO_DISMISS_MS = 2000;
export const IDLE_CHECK_INTERVAL_MS = 30000;
export const HEARTBEAT_INTERVAL_MS = 15000;
export const NACK_RETRY_DELAY_MS = 100;
export const MIN_CHUNK_DATA_SIZE = 1;
export const MAX_FILE_NAME_LENGTH = 255;
export const DEFAULT_PORT = 3000;
export const DEFAULT_VITE_PORT = 5173;
export const SIGNATURE_MAGIC = 0x4c46_4301;
export const PROTOCOL_VERSION = 1;
