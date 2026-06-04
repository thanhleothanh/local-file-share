/**
 * Unit tests for FileStateMachine.
 * Tests the exhaustive transition table.
 */

import {
  FileStateMachine,
  type FileState,
  type FileEvent,
} from '../../../packages/client/src/files/FileStateMachine.js';
import { describe, expect, it } from 'vitest';

describe('FileStateMachine', () => {
  describe('getStates', () => {
    it('returns all 7 states', () => {
      const states = FileStateMachine.getStates();
      expect(states).toHaveLength(7);
      expect(states).toContain('PENDING');
      expect(states).toContain('QUEUED');
      expect(states).toContain('TRANSFERRING');
      expect(states).toContain('COMPLETED');
      expect(states).toContain('REJECTED');
      expect(states).toContain('FAILED');
      expect(states).toContain('CANCELLED');
    });
  });

  describe('getEvents', () => {
    it('returns all 7 events', () => {
      const events = FileStateMachine.getEvents();
      expect(events).toHaveLength(7);
      expect(events).toContain('ACCEPT');
      expect(events).toContain('REJECT');
      expect(events).toContain('CANCEL');
      expect(events).toContain('START');
      expect(events).toContain('COMPLETE');
      expect(events).toContain('FAIL');
      expect(events).toContain('DISCONNECT');
    });
  });

  describe('isTerminal', () => {
    it('returns true for terminal states', () => {
      expect(FileStateMachine.isTerminal('COMPLETED')).toBe(true);
      expect(FileStateMachine.isTerminal('REJECTED')).toBe(true);
      expect(FileStateMachine.isTerminal('FAILED')).toBe(true);
      expect(FileStateMachine.isTerminal('CANCELLED')).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(FileStateMachine.isTerminal('PENDING')).toBe(false);
      expect(FileStateMachine.isTerminal('QUEUED')).toBe(false);
      expect(FileStateMachine.isTerminal('TRANSFERRING')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for PENDING', () => {
      const transitions = FileStateMachine.getValidTransitions('PENDING');
      expect(transitions).toEqual(['ACCEPT', 'REJECT', 'CANCEL', 'DISCONNECT']);
    });

    it('returns valid transitions for QUEUED', () => {
      const transitions = FileStateMachine.getValidTransitions('QUEUED');
      expect(transitions).toEqual(['START', 'REJECT', 'CANCEL', 'DISCONNECT']);
    });

    it('returns valid transitions for TRANSFERRING', () => {
      const transitions = FileStateMachine.getValidTransitions('TRANSFERRING');
      expect(transitions).toEqual(['COMPLETE', 'FAIL', 'CANCEL', 'DISCONNECT']);
    });

    it('returns empty array for terminal states', () => {
      expect(FileStateMachine.getValidTransitions('COMPLETED')).toEqual([]);
      expect(FileStateMachine.getValidTransitions('REJECTED')).toEqual([]);
      expect(FileStateMachine.getValidTransitions('FAILED')).toEqual([]);
      expect(FileStateMachine.getValidTransitions('CANCELLED')).toEqual([]);
    });
  });

  describe('transition', () => {
    const fileId = 'test-file';

    // Valid transitions from PENDING
    it('PENDING + ACCEPT = QUEUED', () => {
      const result = FileStateMachine.transition('PENDING', 'ACCEPT', fileId);
      expect(result.newState).toBe('QUEUED');
      expect(result.isValid).toBe(true);
    });

    it('PENDING + REJECT = REJECTED', () => {
      const result = FileStateMachine.transition('PENDING', 'REJECT', fileId);
      expect(result.newState).toBe('REJECTED');
      expect(result.isValid).toBe(true);
    });

    it('PENDING + CANCEL = CANCELLED', () => {
      const result = FileStateMachine.transition('PENDING', 'CANCEL', fileId);
      expect(result.newState).toBe('CANCELLED');
      expect(result.isValid).toBe(true);
    });

    it('PENDING + DISCONNECT = FAILED', () => {
      const result = FileStateMachine.transition('PENDING', 'DISCONNECT', fileId);
      expect(result.newState).toBe('FAILED');
      expect(result.isValid).toBe(true);
    });

    // Valid transitions from QUEUED
    it('QUEUED + START = TRANSFERRING', () => {
      const result = FileStateMachine.transition('QUEUED', 'START', fileId);
      expect(result.newState).toBe('TRANSFERRING');
      expect(result.isValid).toBe(true);
    });

    it('QUEUED + REJECT = REJECTED', () => {
      const result = FileStateMachine.transition('QUEUED', 'REJECT', fileId);
      expect(result.newState).toBe('REJECTED');
      expect(result.isValid).toBe(true);
    });

    it('QUEUED + CANCEL = CANCELLED', () => {
      const result = FileStateMachine.transition('QUEUED', 'CANCEL', fileId);
      expect(result.newState).toBe('CANCELLED');
      expect(result.isValid).toBe(true);
    });

    it('QUEUED + DISCONNECT = FAILED', () => {
      const result = FileStateMachine.transition('QUEUED', 'DISCONNECT', fileId);
      expect(result.newState).toBe('FAILED');
      expect(result.isValid).toBe(true);
    });

    // Valid transitions from TRANSFERRING
    it('TRANSFERRING + COMPLETE = COMPLETED', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'COMPLETE', fileId);
      expect(result.newState).toBe('COMPLETED');
      expect(result.isValid).toBe(true);
    });

    it('TRANSFERRING + FAIL = FAILED', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'FAIL', fileId);
      expect(result.newState).toBe('FAILED');
      expect(result.isValid).toBe(true);
    });

    it('TRANSFERRING + CANCEL = CANCELLED', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'CANCEL', fileId);
      expect(result.newState).toBe('CANCELLED');
      expect(result.isValid).toBe(true);
    });

    it('TRANSFERRING + DISCONNECT = FAILED', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'DISCONNECT', fileId);
      expect(result.newState).toBe('FAILED');
      expect(result.isValid).toBe(true);
    });

    // Invalid transitions from PENDING
    it('PENDING + COMPLETE = PENDING (invalid)', () => {
      const result = FileStateMachine.transition('PENDING', 'COMPLETE', fileId);
      expect(result.newState).toBe('PENDING');
      expect(result.isValid).toBe(false);
    });

    it('PENDING + START = PENDING (invalid)', () => {
      const result = FileStateMachine.transition('PENDING', 'START', fileId);
      expect(result.newState).toBe('PENDING');
      expect(result.isValid).toBe(false);
    });

    it('PENDING + FAIL = PENDING (invalid)', () => {
      const result = FileStateMachine.transition('PENDING', 'FAIL', fileId);
      expect(result.newState).toBe('PENDING');
      expect(result.isValid).toBe(false);
    });

    // Invalid transitions from QUEUED
    it('QUEUED + ACCEPT = QUEUED (invalid)', () => {
      const result = FileStateMachine.transition('QUEUED', 'ACCEPT', fileId);
      expect(result.newState).toBe('QUEUED');
      expect(result.isValid).toBe(false);
    });

    it('QUEUED + COMPLETE = QUEUED (invalid)', () => {
      const result = FileStateMachine.transition('QUEUED', 'COMPLETE', fileId);
      expect(result.newState).toBe('QUEUED');
      expect(result.isValid).toBe(false);
    });

    it('QUEUED + FAIL = QUEUED (invalid)', () => {
      const result = FileStateMachine.transition('QUEUED', 'FAIL', fileId);
      expect(result.newState).toBe('QUEUED');
      expect(result.isValid).toBe(false);
    });

    // Invalid transitions from TRANSFERRING
    it('TRANSFERRING + ACCEPT = TRANSFERRING (invalid)', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'ACCEPT', fileId);
      expect(result.newState).toBe('TRANSFERRING');
      expect(result.isValid).toBe(false);
    });

    it('TRANSFERRING + REJECT = TRANSFERRING (invalid)', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'REJECT', fileId);
      expect(result.newState).toBe('TRANSFERRING');
      expect(result.isValid).toBe(false);
    });

    it('TRANSFERRING + START = TRANSFERRING (invalid)', () => {
      const result = FileStateMachine.transition('TRANSFERRING', 'START', fileId);
      expect(result.newState).toBe('TRANSFERRING');
      expect(result.isValid).toBe(false);
    });

    // Transitions from terminal states should all be invalid
    it('COMPLETED + ACCEPT = COMPLETED (terminal, invalid)', () => {
      const result = FileStateMachine.transition('COMPLETED', 'ACCEPT', fileId);
      expect(result.newState).toBe('COMPLETED');
      expect(result.isValid).toBe(false);
    });

    it('REJECTED + ACCEPT = REJECTED (terminal, invalid)', () => {
      const result = FileStateMachine.transition('REJECTED', 'ACCEPT', fileId);
      expect(result.newState).toBe('REJECTED');
      expect(result.isValid).toBe(false);
    });

    it('FAILED + START = FAILED (terminal, invalid)', () => {
      const result = FileStateMachine.transition('FAILED', 'START', fileId);
      expect(result.newState).toBe('FAILED');
      expect(result.isValid).toBe(false);
    });

    it('CANCELLED + COMPLETE = CANCELLED (terminal, invalid)', () => {
      const result = FileStateMachine.transition('CANCELLED', 'COMPLETE', fileId);
      expect(result.newState).toBe('CANCELLED');
      expect(result.isValid).toBe(false);
    });
  });

  describe('exhaustive transition table', () => {
    it('has exactly 9 valid transitions', () => {
      // Count all valid transitions
      const states = FileStateMachine.getStates();
      const allEvents = FileStateMachine.getEvents();
      let validCount = 0;

      for (const state of states) {
        for (const event of allEvents) {
          const result = FileStateMachine.transition(state, event as FileEvent, 'test');
          if (result.isValid) {
            validCount++;
          }
        }
      }

      expect(validCount).toBe(12); // 4 from PENDING + 4 from QUEUED + 4 from TRANSFERRING = 12
    });
  });
});
