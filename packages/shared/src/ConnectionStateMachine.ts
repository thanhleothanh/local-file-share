import {
  type ConnectionEvent,
  ConnectionState,
  InvalidTransitionError,
  isConnectionEvent,
  transition,
} from './ConnectionState.js';

export interface TransitionDetail {
  from: ConnectionState;
  to: ConnectionState;
  event: ConnectionEvent;
}

export type TransitionListener = (detail: TransitionDetail) => void;

export class ConnectionStateMachine extends EventTarget {
  private current: ConnectionState = ConnectionState.IDLE;

  constructor(initial: ConnectionState = ConnectionState.IDLE) {
    super();
    this.current = initial;
  }

  get state(): ConnectionState {
    return this.current;
  }

  dispatch(event: ConnectionEvent): ConnectionState {
    if (!isConnectionEvent(event)) {
      throw new InvalidTransitionError(this.current, event);
    }
    const next = transition(this.current, event);
    if (next === this.current) {
      return this.current;
    }
    const from = this.current;
    this.current = next;
    const detail: TransitionDetail = { from, to: next, event };
    this.dispatchEvent(new CustomEvent<TransitionDetail>('transition', { detail }));
    return this.current;
  }

  reset(state: ConnectionState = ConnectionState.IDLE): void {
    if (this.current === state) return;
    const from = this.current;
    this.current = state;
    const detail: TransitionDetail = { from, to: state, event: 'ERROR' };
    this.dispatchEvent(new CustomEvent<TransitionDetail>('transition', { detail }));
  }

  onTransition(listener: TransitionListener): () => void {
    const handler = (e: Event): void => {
      const ce = e as CustomEvent<TransitionDetail>;
      listener(ce.detail);
    };
    this.addEventListener('transition', handler);
    return () => this.removeEventListener('transition', handler);
  }
}
