import {
  FILE_EVENTS,
  FILE_STATES,
  FileState,
  getValidEventsFor,
  isFileState,
  isValidTransition,
} from '@lfs/shared';
import { describe, expect, it } from 'vitest';

describe('FileState', () => {
  it('exposes exactly 7 states', () => {
    expect(FILE_STATES).toHaveLength(7);
  });

  it('contains all expected state names', () => {
    expect(FILE_STATES).toEqual([
      FileState.PENDING,
      FileState.QUEUED,
      FileState.TRANSFERRING,
      FileState.COMPLETED,
      FileState.REJECTED,
      FileState.FAILED,
      FileState.CANCELLED,
    ]);
  });

  it('isFileState accepts valid states', () => {
    expect(isFileState('PENDING')).toBe(true);
    expect(isFileState('COMPLETED')).toBe(true);
  });

  it('isFileState rejects unknown values', () => {
    expect(isFileState('UNKNOWN')).toBe(false);
    expect(isFileState(123)).toBe(false);
    expect(isFileState(null)).toBe(false);
  });

  it('PENDING can transition on QUEUE and CANCEL', () => {
    const events = getValidEventsFor(FileState.PENDING);
    expect(events).toContain('QUEUE');
    expect(events).toContain('CANCEL');
  });

  it('QUEUED can transition on START and CANCEL', () => {
    const events = getValidEventsFor(FileState.QUEUED);
    expect(events).toContain('START');
    expect(events).toContain('CANCEL');
  });

  it('TRANSFERRING can transition on COMPLETE, FAIL, CANCEL', () => {
    const events = getValidEventsFor(FileState.TRANSFERRING);
    expect(events).toContain('COMPLETE');
    expect(events).toContain('FAIL');
    expect(events).toContain('CANCEL');
  });

  it('COMPLETED and REJECTED are terminal (no events)', () => {
    expect(getValidEventsFor(FileState.COMPLETED)).toEqual([]);
    expect(getValidEventsFor(FileState.REJECTED)).toEqual([]);
  });

  it('FAILED and CANCELLED can only RESET', () => {
    expect(getValidEventsFor(FileState.FAILED)).toEqual(['RESET']);
    expect(getValidEventsFor(FileState.CANCELLED)).toEqual(['RESET']);
  });

  it('isValidTransition matches transition table for all state/event pairs', () => {
    for (const state of FILE_STATES) {
      for (const event of FILE_EVENTS) {
        const expected = getValidEventsFor(state).includes(event);
        expect(isValidTransition(state, event)).toBe(expected);
      }
    }
  });
});
