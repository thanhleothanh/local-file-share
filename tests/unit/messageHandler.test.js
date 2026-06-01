/**
 * Message Handler Unit Tests
 * Tests for control message serialization/deserialization
 */

// Import jest functions
import { jest } from '@jest/globals';

// Define MessageType locally to avoid circular dependency with webrtcManager
const MessageType = {
    FILE_OFFER: 'FILE_OFFER',
    FILE_ACCEPT: 'FILE_ACCEPT',
    FILE_REJECT: 'FILE_REJECT',
    FILE_CHUNK: 'FILE_CHUNK',
    TRANSFER_DONE: 'TRANSFER_DONE',
    CLOSE: 'CLOSE',
    CANCELLED: 'CANCELLED',
    PING: 'PING',
    PONG: 'PONG'
};

/**
 * Simple message handler that mimics the behavior in webrtcManager.js
 */
class SimpleMessageHandler {
    constructor() {
        this.eventListeners = {};
    }

    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    emit(event, ...args) {
        if (this.eventListeners[event]) {
            for (const listener of this.eventListeners[event]) {
                listener(...args);
            }
        }
    }

    handleControlMessage(data) {
        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data);
                this.emit('controlMessage', message);
                return message;
            } catch (error) {
                console.error('Failed to parse control message:', error);
                return null;
            }
        }
        return null;
    }

    sendControlMessage(channel, message) {
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
}

describe('Control Message Serialization and Deserialization', () => {
    let handler;

    beforeEach(() => {
        handler = new SimpleMessageHandler();
    });

    describe('handleControlMessage', () => {
        test('parses valid JSON control message', () => {
            const message = { type: MessageType.FILE_OFFER, connId: 'test', fileId: '123' };
            const jsonString = JSON.stringify(message);
            
            const result = handler.handleControlMessage(jsonString);
            
            expect(result).toEqual(message);
        });

        test('emits controlMessage event with parsed object', () => {
            const message = { type: MessageType.FILE_ACCEPT, connId: 'test', fileId: '456' };
            const jsonString = JSON.stringify(message);
            
            const mockCallback = jest.fn();
            handler.on('controlMessage', mockCallback);
            
            handler.handleControlMessage(jsonString);
            
            expect(mockCallback).toHaveBeenCalledWith(message);
        });

        test('handles all message types', () => {
            const testCases = [
                MessageType.FILE_OFFER,
                MessageType.FILE_ACCEPT,
                MessageType.FILE_REJECT,
                MessageType.FILE_CHUNK,
                MessageType.TRANSFER_DONE,
                MessageType.CLOSE,
                MessageType.CANCELLED,
                MessageType.PING,
                MessageType.PONG
            ];
            
            const mockCallback = jest.fn();
            handler.on('controlMessage', mockCallback);
            
            testCases.forEach(type => {
                const message = { type, connId: 'test', fileId: '123' };
                const jsonString = JSON.stringify(message);
                handler.handleControlMessage(jsonString);
                expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ type }));
            });
        });

        test('handles complex FILE_OFFER message', () => {
            const fileOffer = {
                type: MessageType.FILE_OFFER,
                connId: 'conn-123',
                fileId: 'file-456',
                name: 'test.txt',
                size: 1024,
                mime: 'text/plain'
            };
            const jsonString = JSON.stringify(fileOffer);
            
            const result = handler.handleControlMessage(jsonString);
            
            expect(result).toEqual(fileOffer);
            expect(result.name).toBe('test.txt');
            expect(result.size).toBe(1024);
        });

        test('returns null for malformed JSON', () => {
            const result = handler.handleControlMessage('not valid json');
            expect(result).toBeNull();
        });

        test('returns null for non-string data', () => {
            const result = handler.handleControlMessage({ not: 'string' });
            expect(result).toBeNull();
        });

        test('returns null for empty string', () => {
            const result = handler.handleControlMessage('');
            expect(result).toBeNull();
        });

        test('handles messages with nested objects', () => {
            const message = {
                type: MessageType.FILE_OFFER,
                connId: 'test',
                metadata: {
                    name: 'test.txt',
                    size: 1024,
                    chunks: [1, 2, 3]
                }
            };
            const jsonString = JSON.stringify(message);
            
            const result = handler.handleControlMessage(jsonString);
            
            expect(result).toEqual(message);
            expect(result.metadata.chunks).toEqual([1, 2, 3]);
        });
    });

    describe('sendControlMessage', () => {
        test('sends message via control channel when open', () => {
            const mockSend = jest.fn();
            const mockChannel = {
                readyState: 'open',
                send: mockSend
            };
            
            const message = { type: MessageType.PING, connId: 'test' };
            const result = handler.sendControlMessage(mockChannel, message);
            
            expect(result).toBe(true);
            expect(mockSend).toHaveBeenCalledWith(JSON.stringify(message));
        });

        test('does not send when control channel is not open', () => {
            const mockSend = jest.fn();
            const mockChannel = {
                readyState: 'closed',
                send: mockSend
            };
            
            const message = { type: MessageType.PING, connId: 'test' };
            const result = handler.sendControlMessage(mockChannel, message);
            
            expect(result).toBe(false);
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('does not send when control channel is connecting', () => {
            const mockSend = jest.fn();
            const mockChannel = {
                readyState: 'connecting',
                send: mockSend
            };
            
            const message = { type: MessageType.PING, connId: 'test' };
            const result = handler.sendControlMessage(mockChannel, message);
            
            expect(result).toBe(false);
            expect(mockSend).not.toHaveBeenCalled();
        });

        test('does not send when control channel is null', () => {
            const result = handler.sendControlMessage(null, { type: MessageType.PING });
            expect(result).toBe(false);
        });

        test('serializes complex message objects correctly', () => {
            const mockSend = jest.fn();
            const mockChannel = {
                readyState: 'open',
                send: mockSend
            };
            
            const complexMessage = {
                type: MessageType.FILE_OFFER,
                connId: 'conn-123',
                fileId: 'file-456',
                name: 'test.txt',
                size: 1024,
                mime: 'text/plain',
                timestamp: Date.now()
            };
            
            handler.sendControlMessage(mockChannel, complexMessage);
            
            const sentData = mockSend.mock.calls[0][0];
            const parsed = JSON.parse(sentData);
            expect(parsed).toEqual(complexMessage);
        });

        test('handles message with special characters', () => {
            const mockSend = jest.fn();
            const mockChannel = {
                readyState: 'open',
                send: mockSend
            };
            
            const message = {
                type: MessageType.FILE_OFFER,
                name: 'test\nfile\twith\rspecial\"chars.txt'
            };
            
            handler.sendControlMessage(mockChannel, message);
            
            const sentData = mockSend.mock.calls[0][0];
            const parsed = JSON.parse(sentData);
            expect(parsed.name).toBe('test\nfile\twith\rspecial\"chars.txt');
        });
    });

    describe('Round-trip serialization', () => {
        test('round-trip for FILE_OFFER message', () => {
            const original = {
                type: MessageType.FILE_OFFER,
                connId: 'conn-1',
                fileId: 'file-1',
                name: 'test.txt',
                size: 1024,
                mime: 'text/plain'
            };
            
            const jsonString = JSON.stringify(original);
            const parsed = handler.handleControlMessage(jsonString);
            
            expect(parsed).toEqual(original);
        });

        test('round-trip for FILE_ACCEPT message', () => {
            const original = {
                type: MessageType.FILE_ACCEPT,
                connId: 'conn-1',
                fileId: 'file-1'
            };
            
            const jsonString = JSON.stringify(original);
            const parsed = handler.handleControlMessage(jsonString);
            
            expect(parsed).toEqual(original);
        });

        test('round-trip for FILE_REJECT message', () => {
            const original = {
                type: MessageType.FILE_REJECT,
                connId: 'conn-1',
                fileId: 'file-1',
                reason: 'File too large'
            };
            
            const jsonString = JSON.stringify(original);
            const parsed = handler.handleControlMessage(jsonString);
            
            expect(parsed).toEqual(original);
        });

        test('round-trip for TRANSFER_DONE message', () => {
            const original = {
                type: MessageType.TRANSFER_DONE,
                connId: 'conn-1',
                fileId: 'file-1'
            };
            
            const jsonString = JSON.stringify(original);
            const parsed = handler.handleControlMessage(jsonString);
            
            expect(parsed).toEqual(original);
        });
    });

    describe('Connection State Machine Transitions', () => {
        // Simulate the state machine from webrtcManager.js
        const ConnectionState = {
            NEW: 'NEW',
            CONNECTING: 'CONNECTING',
            CONNECTED: 'CONNECTED',
            TRANSFERRING: 'TRANSFERRING',
            FAILED: 'FAILED',
            CLOSED: 'CLOSED'
        };

        const validTransitions = {
            [ConnectionState.NEW]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.CONNECTING]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.CONNECTED]: [ConnectionState.TRANSFERRING, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.TRANSFERRING]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
            [ConnectionState.FAILED]: [ConnectionState.CLOSED],
            [ConnectionState.CLOSED]: []
        };

        test('allows valid transition from NEW to CONNECTED', () => {
            const currentState = ConnectionState.NEW;
            const newState = ConnectionState.CONNECTED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('allows valid transition from NEW to CLOSED', () => {
            const currentState = ConnectionState.NEW;
            const newState = ConnectionState.CLOSED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('allows valid transition from CONNECTING to CONNECTED', () => {
            const currentState = ConnectionState.CONNECTING;
            const newState = ConnectionState.CONNECTED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('allows valid transition from CONNECTED to TRANSFERRING', () => {
            const currentState = ConnectionState.CONNECTED;
            const newState = ConnectionState.TRANSFERRING;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('allows valid transition from TRANSFERRING to CONNECTED', () => {
            const currentState = ConnectionState.TRANSFERRING;
            const newState = ConnectionState.CONNECTED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('allows valid transition from CONNECTING to FAILED', () => {
            const currentState = ConnectionState.CONNECTING;
            const newState = ConnectionState.FAILED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('allows valid transition from FAILED to CLOSED', () => {
            const currentState = ConnectionState.FAILED;
            const newState = ConnectionState.CLOSED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(true);
        });

        test('rejects invalid transition from CONNECTED to NEW', () => {
            const currentState = ConnectionState.CONNECTED;
            const newState = ConnectionState.NEW;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(false);
        });

        test('rejects invalid transition from CLOSED to CONNECTED', () => {
            const currentState = ConnectionState.CLOSED;
            const newState = ConnectionState.CONNECTED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(false);
        });

        test('rejects invalid transition from NEW to TRANSFERRING', () => {
            const currentState = ConnectionState.NEW;
            const newState = ConnectionState.TRANSFERRING;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(false);
        });

        test('rejects invalid transition from FAILED to NEW', () => {
            const currentState = ConnectionState.FAILED;
            const newState = ConnectionState.NEW;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.includes(newState)).toBe(false);
        });

        test('CLOSED state has no valid transitions', () => {
            const currentState = ConnectionState.CLOSED;
            const allowed = validTransitions[currentState] || [];
            expect(allowed.length).toBe(0);
        });

        test('all states have defined transitions', () => {
            Object.values(ConnectionState).forEach(state => {
                expect(validTransitions).toHaveProperty(state);
                expect(Array.isArray(validTransitions[state])).toBe(true);
            });
        });
    });
});
