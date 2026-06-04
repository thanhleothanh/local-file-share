/**
 * File State Machine with 7 states and 7 events.
 * Implements the state transitions for file transfer lifecycle.
 */

export type FileState =
  | 'PENDING' // File offered, waiting for acceptance
  | 'QUEUED' // Accepted but waiting for transfer to start
  | 'TRANSFERRING' // Actively transferring chunks
  | 'COMPLETED' // Transfer finished successfully
  | 'REJECTED' // Receiver rejected the file
  | 'FAILED' // Transfer failed (timeout, error)
  | 'CANCELLED'; // Sender cancelled the file

export type FileEvent =
  | 'ACCEPT' // Receiver accepts the file
  | 'REJECT' // Receiver rejects the file
  | 'CANCEL' // Sender cancels the file
  | 'START' // Transfer starts (for sender) or download starts (for receiver)
  | 'COMPLETE' // Transfer finished successfully
  | 'FAIL' // Transfer failed
  | 'DISCONNECT'; // Connection lost

/**
 * Interface for a file entry in the state machine.
 */
export interface FileEntry {
  fileId: string;
  fileName: string;
  fileSize: number;
  state: FileState;
  createdAt: number;
  updatedAt: number;
}

/**
 * Transition function result.
 */
export interface TransitionResult {
  newState: FileState;
  isValid: boolean;
}

/**
 * FileStateMachine implements a pure state transition function.
 * All valid transitions:
 * - PENDING: --ACCEPT--> QUEUED, --REJECT--> REJECTED, --CANCEL--> CANCELLED, --DISCONNECT--> FAILED
 * - QUEUED: --START--> TRANSFERRING, --REJECT--> REJECTED, --CANCEL--> CANCELLED, --DISCONNECT--> FAILED
 * - TRANSFERRING: --COMPLETE--> COMPLETED, --FAIL--> FAILED, --CANCEL--> CANCELLED, --DISCONNECT--> FAILED
 * - COMPLETED: (terminal state - no transitions)
 * - REJECTED: (terminal state - no transitions)
 * - FAILED: (terminal state - no transitions)
 * - CANCELLED: (terminal state - no transitions)
 */

/**
 * All valid transitions.
 * Map from current state to map of events to new states.
 */
const TRANSITIONS: Record<FileState, Partial<Record<FileEvent, FileState>>> = {
  PENDING: {
    ACCEPT: 'QUEUED',
    REJECT: 'REJECTED',
    CANCEL: 'CANCELLED',
    DISCONNECT: 'FAILED',
  },
  QUEUED: {
    START: 'TRANSFERRING',
    REJECT: 'REJECTED',
    CANCEL: 'CANCELLED',
    DISCONNECT: 'FAILED',
  },
  TRANSFERRING: {
    COMPLETE: 'COMPLETED',
    FAIL: 'FAILED',
    CANCEL: 'CANCELLED',
    DISCONNECT: 'FAILED',
  },
  COMPLETED: {},
  REJECTED: {},
  FAILED: {},
  CANCELLED: {},
} as const;

/**
 * Terminal states that cannot transition further.
 */
const TERMINAL_STATES: Set<FileState> = new Set(['COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED']);

/**
 * Transition from current state with given event.
 * Returns the new state if valid, otherwise returns the current state.
 * Logs all transitions.
 */
function transition(currentState: FileState, event: FileEvent, fileId: string): TransitionResult {
  // Check if already in terminal state
  if (TERMINAL_STATES.has(currentState)) {
    const result: TransitionResult = {
      newState: currentState,
      isValid: false,
    };
    console.warn(
      `[FileState] ${fileId}: Cannot transition from terminal state ${currentState} with event ${event}`,
    );
    return result;
  }

  // Get the transition for this state and event
  const transitions = TRANSITIONS[currentState];
  const newState = transitions[event];

  if (newState) {
    console.info(`[FileState] ${fileId}: ${currentState} → ${newState} (${event})`);
    return {
      newState,
      isValid: true,
    };
  }
  console.warn(`[FileState] ${fileId}: Invalid transition from ${currentState} with event ${event}`);
  return {
    newState: currentState,
    isValid: false,
  };
}

/**
 * Check if a state is terminal (no further transitions allowed).
 */
function isTerminal(state: FileState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Get all valid transitions from a state.
 */
function getValidTransitions(state: FileState): FileEvent[] {
  if (TERMINAL_STATES.has(state)) {
    return [];
  }
  return Object.keys(TRANSITIONS[state]) as FileEvent[];
}

/**
 * Get all states.
 */
function getStates(): FileState[] {
  return ['PENDING', 'QUEUED', 'TRANSFERRING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'];
}

/**
 * Get all events.
 */
function getEvents(): FileEvent[] {
  return ['ACCEPT', 'REJECT', 'CANCEL', 'START', 'COMPLETE', 'FAIL', 'DISCONNECT'];
}

export const FileStateMachine = {
  transition,
  isTerminal,
  getValidTransitions,
  getStates,
  getEvents,
  TRANSITIONS,
  TERMINAL_STATES,
};
