export enum FileState {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  TRANSFERRING = 'TRANSFERRING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export type FileStateName = `${FileState}`;

export const FILE_STATES: readonly FileState[] = Object.freeze([
  FileState.PENDING,
  FileState.QUEUED,
  FileState.TRANSFERRING,
  FileState.COMPLETED,
  FileState.REJECTED,
  FileState.FAILED,
  FileState.CANCELLED,
] as const);

export type FileEvent = 'QUEUE' | 'START' | 'COMPLETE' | 'FAIL' | 'REJECT' | 'CANCEL' | 'RESET';

export const FILE_EVENTS: readonly FileEvent[] = Object.freeze([
  'QUEUE',
  'START',
  'COMPLETE',
  'FAIL',
  'REJECT',
  'CANCEL',
  'RESET',
] as const);

const FILE_STATE_TRANSITIONS: Readonly<Record<FileState, ReadonlyArray<FileEvent>>> = Object.freeze({
  [FileState.PENDING]: Object.freeze(['QUEUE', 'CANCEL'] as const),
  [FileState.QUEUED]: Object.freeze(['START', 'CANCEL'] as const),
  [FileState.TRANSFERRING]: Object.freeze(['COMPLETE', 'FAIL', 'CANCEL'] as const),
  [FileState.COMPLETED]: Object.freeze([] as const),
  [FileState.REJECTED]: Object.freeze([] as const),
  [FileState.FAILED]: Object.freeze(['RESET'] as const),
  [FileState.CANCELLED]: Object.freeze(['RESET'] as const),
});

export function isFileState(value: unknown): value is FileState {
  return typeof value === 'string' && FILE_STATES.includes(value as FileState);
}

export function getValidEventsFor(state: FileState): readonly FileEvent[] {
  return FILE_STATE_TRANSITIONS[state];
}

export function isValidTransition(from: FileState, event: FileEvent): boolean {
  return FILE_STATE_TRANSITIONS[from].includes(event);
}
