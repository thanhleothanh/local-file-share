/**
 * Regression tests for bug fixes applied during local development.
 * Each test pins down a specific real-world bug so it cannot silently regress.
 */

import { jest } from '@jest/globals';
import { WebRTCManager, ConnectionState } from '@modules/webrtcManager.js';
import { FileTransferManager } from '@modules/fileTransfer.js';
import { ChunkHandler } from '@utils/chunkHandler.js';
import { QRHandler } from '@modules/qrHandler.js';
import { compressToBase64 } from '@utils/qrCompression.js';

describe('Regression: connection state machine', () => {
    let manager;

    beforeEach(() => {
        manager = new WebRTCManager();
    });

    test('initial state is CLOSED', () => {
        expect(manager.state).toBe(ConnectionState.CLOSED);
    });

    test('allows CLOSED -> NEW (createConnection from scratch)', async () => {
        await manager.transitionState(ConnectionState.NEW);
        expect(manager.state).toBe(ConnectionState.NEW);
    });

    test('allows CLOSED -> CONNECTING (answerer starts directly in CONNECTING)', async () => {
        await manager.transitionState(ConnectionState.CONNECTING);
        expect(manager.state).toBe(ConnectionState.CONNECTING);
    });

    test('allows NEW -> CONNECTING (offerer moves to CONNECTING after answer is accepted)', async () => {
        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.CONNECTING);
        expect(manager.state).toBe(ConnectionState.CONNECTING);
    });

    test('allows NEW -> CLOSED (cancel an offer)', async () => {
        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.CLOSED);
        expect(manager.state).toBe(ConnectionState.CLOSED);
    });

    test('allows CONNECTING -> CONNECTED (data channels open)', async () => {
        await manager.transitionState(ConnectionState.CONNECTING);
        await manager.transitionState(ConnectionState.CONNECTED);
        expect(manager.state).toBe(ConnectionState.CONNECTED);
    });

    test('allows CONNECTED <-> TRANSFERRING (file transfer toggles active state)', async () => {
        await manager.transitionState(ConnectionState.CONNECTING);
        await manager.transitionState(ConnectionState.CONNECTED);
        await manager.transitionState(ConnectionState.TRANSFERRING);
        expect(manager.state).toBe(ConnectionState.TRANSFERRING);
        await manager.transitionState(ConnectionState.CONNECTED);
        expect(manager.state).toBe(ConnectionState.CONNECTED);
    });

    test('allows FAILED -> CLOSED (close after failure)', async () => {
        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.FAILED);
        await manager.transitionState(ConnectionState.CLOSED);
        expect(manager.state).toBe(ConnectionState.CLOSED);
    });

    test('rejects CLOSED -> CONNECTED (cannot skip have-remote-offer)', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await manager.transitionState(ConnectionState.CONNECTED);
        expect(manager.state).toBe(ConnectionState.CLOSED);
        warn.mockRestore();
    });

    test('rejects CLOSED -> TRANSFERRING', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await manager.transitionState(ConnectionState.TRANSFERRING);
        expect(manager.state).toBe(ConnectionState.CLOSED);
        warn.mockRestore();
    });

    test('rejects CONNECTED -> NEW (cannot rewind)', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await manager.transitionState(ConnectionState.CONNECTING);
        await manager.transitionState(ConnectionState.CONNECTED);
        await manager.transitionState(ConnectionState.NEW);
        expect(manager.state).toBe(ConnectionState.CONNECTED);
        warn.mockRestore();
    });
});

describe('Regression: getAllIceCandidates (SDP parsing)', () => {
    let manager;

    beforeEach(() => {
        manager = new WebRTCManager();
    });

    function mockPeerConnectionWithSdp(sdp, pendingCandidates = []) {
        manager.peerConnection = {
            localDescription: { sdp, type: 'offer' },
        };
        manager.pendingIceCandidates = pendingCandidates;
    }

    test('keeps the candidate: prefix on each candidate (was previously stripped)', () => {
        const sdp = [
            'v=0',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'a=mid:0',
            'a=candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host',
            'a=candidate:2 1 UDP 2122252542 10.0.0.1 54322 typ srflx',
        ].join('\n');

        mockPeerConnectionWithSdp(sdp);

        const result = manager.getAllIceCandidates();

        expect(result).toHaveLength(2);
        for (const c of result) {
            expect(c.candidate.startsWith('candidate:')).toBe(true);
        }
    });

    test('assigns sdpMLineIndex 0 to the first m-line and 1 to the second', () => {
        const sdp = [
            'v=0',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'a=mid:0',
            'a=candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'a=mid:1',
            'a=candidate:2 1 UDP 2122252543 192.168.1.10 54322 typ host',
        ].join('\n');

        mockPeerConnectionWithSdp(sdp);

        const result = manager.getAllIceCandidates();

        expect(result[0].sdpMLineIndex).toBe(0);
        expect(result[1].sdpMLineIndex).toBe(1);
    });

    test('attaches the correct sdpMid to each candidate', () => {
        const sdp = [
            'v=0',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'a=mid:0',
            'a=candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'a=mid:1',
            'a=candidate:2 1 UDP 2122252543 192.168.1.10 54322 typ host',
        ].join('\n');

        mockPeerConnectionWithSdp(sdp);

        const result = manager.getAllIceCandidates();

        expect(result[0].sdpMid).toBe('0');
        expect(result[1].sdpMid).toBe('1');
    });

    test('merges pendingIceCandidates gathered via onicecandidate', () => {
        const sdp = [
            'v=0',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'a=mid:0',
            'a=candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host',
        ].join('\n');

        const pending = [{
            candidate: 'candidate:99 1 UDP 2122252543 10.0.0.99 60000 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0,
        }];

        mockPeerConnectionWithSdp(sdp, pending);

        const result = manager.getAllIceCandidates();

        expect(result).toHaveLength(2);
        expect(result[1]).toEqual(pending[0]);
        expect(manager.pendingIceCandidates).toEqual([]);
    });

    test('returns empty array when localDescription is null', () => {
        manager.peerConnection = { localDescription: null };
        expect(manager.getAllIceCandidates()).toEqual([]);
    });

    test('returns pending candidates when localDescription is null', () => {
        manager.peerConnection = { localDescription: null };
        manager.pendingIceCandidates = [{ candidate: 'candidate:1 1 UDP 1 1.1.1.1 1 typ host', sdpMid: '0', sdpMLineIndex: 0 }];
        expect(manager.getAllIceCandidates()).toHaveLength(1);
    });
});

describe('Regression: setupDataChannels isOfferer flag', () => {
    let manager;
    let createdChannels;

    beforeEach(() => {
        manager = new WebRTCManager();
        createdChannels = [];
        manager.peerConnection = {
            createDataChannel: jest.fn((label) => {
                const channel = { label, onopen: null, onclose: null, onerror: null, onmessage: null };
                createdChannels.push(channel);
                return channel;
            }),
            ondatachannel: null,
        };
    });

    test('offerer creates both control and data channels', async () => {
        await manager.setupDataChannels(true);

        expect(manager.peerConnection.createDataChannel).toHaveBeenCalledTimes(2);
        const labels = createdChannels.map(c => c.label);
        expect(labels).toContain('control');
        expect(labels).toContain('data');
        expect(manager.controlChannel).toBeDefined();
        expect(manager.dataChannel).toBeDefined();
    });

    test('offerer still registers ondatachannel for peer-initiated channels', async () => {
        await manager.setupDataChannels(true);
        expect(typeof manager.peerConnection.ondatachannel).toBe('function');
    });

    test('answerer does NOT call createDataChannel (would pollute the SDP)', async () => {
        await manager.setupDataChannels(false);
        expect(manager.peerConnection.createDataChannel).not.toHaveBeenCalled();
        expect(manager.controlChannel).toBeNull();
        expect(manager.dataChannel).toBeNull();
    });

    test('answerer still registers ondatachannel to receive incoming channels', async () => {
        await manager.setupDataChannels(false);
        expect(typeof manager.peerConnection.ondatachannel).toBe('function');
    });

    test('answerer ondatachannel handler assigns incoming control channel correctly', async () => {
        await manager.setupDataChannels(false);
        const handler = manager.peerConnection.ondatachannel;
        const incomingControl = { label: 'control', onopen: null, onclose: null, onerror: null, onmessage: null };
        handler({ channel: incomingControl });
        expect(manager.controlChannel).toBe(incomingControl);
    });

    test('answerer ondatachannel handler assigns incoming data channel correctly', async () => {
        await manager.setupDataChannels(false);
        const handler = manager.peerConnection.ondatachannel;
        const incomingData = { label: 'data', onopen: null, onclose: null, onerror: null, onmessage: null };
        handler({ channel: incomingData });
        expect(manager.dataChannel).toBe(incomingData);
    });

    test('answerer ondatachannel closes unknown channels', async () => {
        await manager.setupDataChannels(false);
        const handler = manager.peerConnection.ondatachannel;
        const unknown = { label: 'mystery', onopen: null, close: jest.fn() };
        handler({ channel: unknown });
        expect(unknown.close).toHaveBeenCalled();
    });
});

describe('Regression: offerer transitions to CONNECTED when channels open during NEW', () => {
    let manager;
    let controlChannel;
    let dataChannel;
    let connectedListener;

    beforeEach(async () => {
        manager = new WebRTCManager();
        controlChannel = { label: 'control', onopen: null, onclose: null, onerror: null, onmessage: null };
        dataChannel = { label: 'data', onopen: null, onclose: null, onerror: null, onmessage: null };

        manager.peerConnection = {
            createDataChannel: jest.fn((label) => label === 'control' ? controlChannel : dataChannel),
            ondatachannel: null,
            onconnectionstatechange: null,
            connectionState: 'new',
        };
        connectedListener = jest.fn();
        manager.on('connected', connectedListener);

        await manager.transitionState(ConnectionState.NEW);
        await manager.setupDataChannels(true);
    });

    test('moves NEW -> CONNECTED once both channels open and peer connection is connected (offerer bug)', async () => {
        manager.peerConnection.connectionState = 'connected';

        controlChannel.onopen();
        dataChannel.onopen();

        expect(manager.state).toBe(ConnectionState.CONNECTED);
        expect(connectedListener).toHaveBeenCalled();
    });

    test('does NOT transition with only the control channel open', async () => {
        manager.peerConnection.connectionState = 'connected';
        controlChannel.onopen();
        expect(manager.state).toBe(ConnectionState.NEW);
    });

    test('does NOT transition with only the data channel open', async () => {
        manager.peerConnection.connectionState = 'connected';
        dataChannel.onopen();
        expect(manager.state).toBe(ConnectionState.NEW);
    });

    test('does NOT transition when both channels are open but peer connection is not yet connected', async () => {
        manager.peerConnection.connectionState = 'connecting';
        controlChannel.onopen();
        dataChannel.onopen();
        expect(manager.state).toBe(ConnectionState.NEW);
    });

    test('still transitions if peer connection becomes connected after the channels open (the actual offerer ordering)', async () => {
        manager.peerConnection.connectionState = 'connecting';
        controlChannel.onopen();
        dataChannel.onopen();
        expect(manager.state).toBe(ConnectionState.NEW);

        manager.peerConnection.connectionState = 'connected';
        manager.tryTransitionToConnected();

        expect(manager.state).toBe(ConnectionState.CONNECTED);
        expect(connectedListener).toHaveBeenCalled();
    });

    test('does not re-emit connected if already CONNECTED', async () => {
        manager.peerConnection.connectionState = 'connected';
        controlChannel.onopen();
        dataChannel.onopen();
        expect(connectedListener).toHaveBeenCalledTimes(1);

        manager.peerConnection.connectionState = 'connected';
        manager.tryTransitionToConnected();
        expect(connectedListener).toHaveBeenCalledTimes(1);
    });

    test('resets channel-open flags when setupDataChannels runs again (reconnect)', async () => {
        manager.controlChannelOpen = true;
        manager.dataChannelOpen = true;
        await manager.setupDataChannels(true);
        expect(manager.controlChannelOpen).toBe(false);
        expect(manager.dataChannelOpen).toBe(false);
    });
});

describe('Regression: answerer transitions to CONNECTED from CONNECTING (existing path)', () => {
    let manager;
    let controlChannel;
    let dataChannel;
    let ondatachannelHandler;

    beforeEach(async () => {
        manager = new WebRTCManager();
        controlChannel = { label: 'control', onopen: null, onclose: null, onerror: null, onmessage: null };
        dataChannel = { label: 'data', onopen: null, onclose: null, onerror: null, onmessage: null };

        manager.peerConnection = {
            createDataChannel: jest.fn(),
            ondatachannel: null,
            connectionState: 'new',
        };
        await manager.setupDataChannels(false);
        ondatachannelHandler = manager.peerConnection.ondatachannel;
        ondatachannelHandler({ channel: controlChannel });
        ondatachannelHandler({ channel: dataChannel });

        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.CONNECTING);
    });

    test('CONNECTING -> CONNECTED when both channels open and peer connection is connected', async () => {
        manager.peerConnection.connectionState = 'connected';
        controlChannel.onopen();
        dataChannel.onopen();
        expect(manager.state).toBe(ConnectionState.CONNECTED);
    });
});

describe('Regression: QRHandler.handleScanResult', () => {
    let handler;
    let onResult;
    let onError;

    beforeEach(() => {
        handler = new QRHandler();
        onResult = jest.fn();
        onError = jest.fn();
        handler.scanning = true;
    });

    test('calls result.getText() (was previously broken by passing IScannerControls as the result)', () => {
        const validQr = {
            type: 'OFFER',
            payload: compressToBase64({ sdp: 'x', ice: [] }),
            secret: 'abcdefgh',
            connId: 'conn-1',
        };
        const result = { getText: jest.fn(() => JSON.stringify(validQr)) };

        handler.handleScanResult(result, onResult, onError);

        expect(result.getText).toHaveBeenCalledTimes(1);
        expect(onResult).toHaveBeenCalledWith(validQr);
        expect(onError).not.toHaveBeenCalled();
    });

    test('stops scanning after a successful parse', () => {
        const validQr = { type: 'OFFER', payload: 'p', secret: 's', connId: 'c' };
        const result = { getText: () => JSON.stringify(validQr) };

        handler.handleScanResult(result, onResult, onError);

        expect(handler.scanning).toBe(false);
    });

    test('reports an error when getText throws', () => {
        const result = {
            getText: () => { throw new TypeError("result.getText is not a function"); },
        };

        handler.handleScanResult(result, onResult, onError);

        expect(onResult).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
    });

    test('reports an error on invalid JSON', () => {
        const result = { getText: () => 'not-json' };

        handler.handleScanResult(result, onResult, onError);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onResult).not.toHaveBeenCalled();
    });

    test('reports an error when QR data is missing required fields', () => {
        const result = { getText: () => JSON.stringify({ type: 'OFFER' }) };

        handler.handleScanResult(result, onResult, onError);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onResult).not.toHaveBeenCalled();
    });
});

describe('Regression: QRHandler.generateQRCode returns a serialised SVG string', () => {
    let handler;

    beforeEach(() => {
        handler = new QRHandler();
    });

    test('return value is a string, not [object SVGSVGElement]', async () => {
        const svg = await handler.generateQRCode({ type: 'OFFER', connId: 'c' }, 100, 100);
        expect(typeof svg).toBe('string');
        expect(svg).not.toBe('[object SVGSVGElement]');
    });

    test('return value contains valid SVG markup', async () => {
        const svg = await handler.generateQRCode({ type: 'OFFER', connId: 'c' }, 100, 100);
        expect(svg).toMatch(/^<svg/);
        expect(svg).toMatch(/<\/svg>$/);
    });
});

describe('Regression: QRHandler.stopScanning halts the zxing controls', () => {
    test('calls .stop() on the stored IScannerControls', () => {
        const handler = new QRHandler();
        const controls = { stop: jest.fn() };
        handler.scanning = true;
        handler.scannerControls = controls;
        handler.scannerStream = { getTracks: () => [] };
        handler.scannerVideoElement = { srcObject: 'something' };

        handler.stopScanning();

        expect(controls.stop).toHaveBeenCalledTimes(1);
        expect(handler.scannerControls).toBeNull();
        expect(handler.scanning).toBe(false);
    });

    test('no-op when neither scanning nor controls are active', () => {
        const handler = new QRHandler();
        handler.stopScanning();
        expect(handler.scanning).toBe(false);
        expect(handler.scannerControls).toBeNull();
    });
});

describe('Regression: init() idempotency (circular dependency safety)', () => {
    test('FileTransferManager.init() only subscribes once', () => {
        const m = new FileTransferManager();
        expect(m.initialized).toBe(false);

        m.init();
        expect(m.initialized).toBe(true);

        const before = m.eventListeners['controlMessage']?.length || 0;
        m.init();
        const after = m.eventListeners['controlMessage']?.length || 0;

        expect(after).toBe(before);
    });

    test('FileTransferManager constructor does NOT subscribe to webrtcManager (was the TDZ source)', () => {
        const m = new FileTransferManager();
        expect(m.eventListeners['controlMessage']).toBeUndefined();
    });

    test('ChunkHandler.init() only subscribes once', () => {
        const c = new ChunkHandler();
        expect(c.initialized).toBe(false);

        c.init();
        expect(c.initialized).toBe(true);

        const before = c.eventListeners['dataMessage']?.length || 0;
        c.init();
        const after = c.eventListeners['dataMessage']?.length || 0;

        expect(after).toBe(before);
    });

    test('ChunkHandler constructor does NOT subscribe to webrtcManager', () => {
        const c = new ChunkHandler();
        expect(c.eventListeners['dataMessage']).toBeUndefined();
    });
});
