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

export type ConnectionEvent = 'INITIATE_CONNECT' | 'ACCEPT' | 'REJECT' | 'CONNECTED' | 'DISCONNECT' | 'ERROR';

export const CONNECTION_EVENTS: readonly ConnectionEvent[] = Object.freeze([
  'INITIATE_CONNECT',
  'ACCEPT',
  'REJECT',
  'CONNECTED',
  'DISCONNECT',
  'ERROR',
] as const);

const CONNECTION_STATE_TRANSITIONS: Readonly<Record<ConnectionState, ReadonlyArray<ConnectionEvent>>> =
  Object.freeze({
    [ConnectionState.IDLE]: Object.freeze(['INITIATE_CONNECT'] as const),
    [ConnectionState.CONNECTING]: Object.freeze(['ACCEPT', 'REJECT', 'ERROR', 'DISCONNECT'] as const),
    [ConnectionState.CONNECTED]: Object.freeze(['DISCONNECT', 'ERROR'] as const),
  });

export function isConnectionState(value: unknown): value is ConnectionState {
  return typeof value === 'string' && CONNECTION_STATES.includes(value as ConnectionState);
}

export function getValidEventsForConnection(state: ConnectionState): readonly ConnectionEvent[] {
  return CONNECTION_STATE_TRANSITIONS[state];
}

export function isValidConnectionTransition(from: ConnectionState, event: ConnectionEvent): boolean {
  return CONNECTION_STATE_TRANSITIONS[from].includes(event);
}
