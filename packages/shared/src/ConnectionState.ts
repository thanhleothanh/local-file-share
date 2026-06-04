export enum ConnectionState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
}

export const CONNECTION_STATES: readonly ConnectionState[] = Object.freeze([
  ConnectionState.IDLE,
  ConnectionState.CONNECTING,
  ConnectionState.CONNECTED,
] as const);

export type ConnectionEvent =
  | 'REQUEST_CONNECT'
  | 'CONNECT_ACCEPTED'
  | 'CONNECT_REJECTED'
  | 'PEER_CANCELLED'
  | 'CONNECTION_OPEN'
  | 'DISCONNECT'
  | 'ERROR';

export const CONNECTION_EVENTS: readonly ConnectionEvent[] = Object.freeze([
  'REQUEST_CONNECT',
  'CONNECT_ACCEPTED',
  'CONNECT_REJECTED',
  'PEER_CANCELLED',
  'CONNECTION_OPEN',
  'DISCONNECT',
  'ERROR',
] as const);

const CONNECTION_STATE_TRANSITIONS: Readonly<
  Record<ConnectionState, Readonly<Partial<Record<ConnectionEvent, ConnectionState>>>>
> = Object.freeze({
  [ConnectionState.IDLE]: Object.freeze({
    REQUEST_CONNECT: ConnectionState.CONNECTING,
  } as const),
  [ConnectionState.CONNECTING]: Object.freeze({
    CONNECT_ACCEPTED: ConnectionState.CONNECTED,
    CONNECT_REJECTED: ConnectionState.IDLE,
    PEER_CANCELLED: ConnectionState.IDLE,
    ERROR: ConnectionState.IDLE,
  } as const),
  [ConnectionState.CONNECTED]: Object.freeze({
    DISCONNECT: ConnectionState.IDLE,
    ERROR: ConnectionState.IDLE,
  } as const),
});

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ConnectionState,
    public readonly event: ConnectionEvent,
  ) {
    super(`Invalid transition: cannot apply event "${event}" from state "${from}"`);
    this.name = 'InvalidTransitionError';
  }
}

export function isConnectionState(value: unknown): value is ConnectionState {
  return typeof value === 'string' && CONNECTION_STATES.includes(value as ConnectionState);
}

export function isConnectionEvent(value: unknown): value is ConnectionEvent {
  return typeof value === 'string' && CONNECTION_EVENTS.includes(value as ConnectionEvent);
}

export function getValidEventsForConnection(state: ConnectionState): readonly ConnectionEvent[] {
  return Object.keys(CONNECTION_STATE_TRANSITIONS[state]) as ConnectionEvent[];
}

export function isValidConnectionTransition(from: ConnectionState, event: ConnectionEvent): boolean {
  return event in CONNECTION_STATE_TRANSITIONS[from];
}

export function transition(currentState: ConnectionState, event: ConnectionEvent): ConnectionState {
  const next = CONNECTION_STATE_TRANSITIONS[currentState][event];
  if (next === undefined) {
    throw new InvalidTransitionError(currentState, event);
  }
  return next;
}
