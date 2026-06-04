/**
 * Regression tests for bug fixes applied during local development.
 * Each test pins down a specific real-world bug so it cannot silently regress.
 */

import { jest } from '@jest/globals';
import { WebRTCManager, ConnectionState } from '@modules/webrtcManager.js';
import { FileTransferManager } from '@modules/fileTransfer.js';
import { ChunkHandler } from '@utils/chunkHandler.js';
import { webrtcManager as webrtcManagerSingleton } from '@modules/webrtcManager.js';
import { chunkHandler as chunkHandlerSingleton } from '@utils/chunkHandler.js';
import { storageManager as storageManagerSingleton } from '@utils/storage.js';
import { FileTransfer as FileTransferClass } from '@utils/fileState.js';
import { fileTransferManager as fileTransferManagerSingleton } from '@modules/fileTransfer.js';
import { errorHandler as errorHandlerSingleton } from '@utils/errorHandler.js';

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

describe('Regression: chunks are actually sent (offerer bug — no progress)', () => {
    // Pins down: after both sides CONNECT, sender sent FILE_OFFER, receiver
    // clicked Accept, FILE_ACCEPT arrived back at sender. Before this fix, the
    // sender's chunkHandler.sendFile was never invoked, so 0 bytes moved.
    //
    // Required pieces:
    //   1. selectFiles stashes the browser File/Blob on the FileTransfer
    //   2. handleFileAccept transitions to TRANSFERRING and starts chunk sending
    //   3. handleTransferDone (on the local sender when it finishes its own
    //      outgoing file) advances the queue and starts the next file
    //   4. If the queue is already busy when FILE_ACCEPT arrives, the file is
    //      queued and NOT sent (it should start later, when the current one
    //      finishes — see (3))

    let mgr;
    let originalGetConn;
    let originalSendControl;
    let originalSaveFile;
    let originalUpdateFileState;
    let originalDeleteFile;
    let originalSendFile;
    let sendFileSpy;

    beforeEach(() => {
        mgr = new FileTransferManager();

        // Stub webrtcManager singleton (selectFiles calls getConnectionInfo,
        // and sendFileOffer routes through sendControlMessage).
        originalGetConn = webrtcManagerSingleton.getConnectionInfo;
        originalSendControl = webrtcManagerSingleton.sendControlMessage;
        webrtcManagerSingleton.getConnectionInfo = () => ({ connId: 'c-test', role: 'offerer' });
        webrtcManagerSingleton.sendControlMessage = jest.fn();

        // Stub storageManager so the persistence path doesn't blow up.
        originalSaveFile = storageManagerSingleton.saveFile;
        originalUpdateFileState = storageManagerSingleton.updateFileState;
        originalDeleteFile = storageManagerSingleton.deleteFile;
        storageManagerSingleton.saveFile = jest.fn().mockResolvedValue(undefined);
        storageManagerSingleton.updateFileState = jest.fn().mockResolvedValue(undefined);
        storageManagerSingleton.deleteFile = jest.fn().mockResolvedValue(undefined);

        // Stub chunkHandler.sendFile so we can assert it was called without
        // actually trying to read a file or hit the data channel.
        originalSendFile = chunkHandlerSingleton.sendFile;
        sendFileSpy = jest.fn().mockResolvedValue(undefined);
        chunkHandlerSingleton.sendFile = sendFileSpy;
    });

    afterEach(() => {
        webrtcManagerSingleton.getConnectionInfo = originalGetConn;
        webrtcManagerSingleton.sendControlMessage = originalSendControl;
        storageManagerSingleton.saveFile = originalSaveFile;
        storageManagerSingleton.updateFileState = originalUpdateFileState;
        storageManagerSingleton.deleteFile = originalDeleteFile;
        chunkHandlerSingleton.sendFile = originalSendFile;
    });

    const fakeFile = (name, size = 100) => ({
        name,
        size,
        type: name.endsWith('.txt') ? 'text/plain' : 'application/octet-stream'
    });

    test('FileTransfer constructor stashes fileObject on send-side files', () => {
        const f = new FileTransferClass({ connId: 'c', fileId: 'f', name: 'a', size: 1, mime: 'x', direction: 'send', fileObject: { fake: true } });
        expect(f.fileObject).toEqual({ fake: true });
    });

    test('FileTransfer constructor defaults fileObject to null', () => {
        const f = new FileTransferClass({ connId: 'c', fileId: 'f', name: 'a', size: 1, mime: 'x', direction: 'receive' });
        expect(f.fileObject).toBeNull();
    });

    test('selectFiles stashes the browser File/Blob on the FileTransfer', async () => {
        const file = fakeFile('a.txt');
        const [transfer] = await mgr.selectFiles([file], { sendImmediately: false });
        expect(transfer.fileObject).toBe(file);
    });

    test('FILE_ACCEPT triggers chunkHandler.sendFile with the stashed File and the fileId', async () => {
        const file = fakeFile('a.txt', 100);
        const [transfer] = await mgr.selectFiles([file], { sendImmediately: false });
        sendFileSpy.mockClear();

        await mgr.handleFileAccept({ connId: 'c-test', fileId: transfer.fileId });

        expect(sendFileSpy).toHaveBeenCalledTimes(1);
        expect(sendFileSpy).toHaveBeenCalledWith(file, transfer.fileId);
        expect(transfer.state).toBe('TRANSFERRING');
    });

    test('FILE_ACCEPT on a second file (queue busy) does NOT call sendFile — it is queued', async () => {
        const first = fakeFile('first.txt', 100);
        const [firstTransfer] = await mgr.selectFiles([first], { sendImmediately: false });
        // Make the first file the "current" one (simulate that it is in flight).
        firstTransfer.transitionState('TRANSFERRING');
        mgr.queueManager.currentFile = firstTransfer;
        sendFileSpy.mockClear();

        const second = fakeFile('second.txt', 50);
        const [secondTransfer] = await mgr.selectFiles([second], { sendImmediately: false });
        sendFileSpy.mockClear();

        await mgr.handleFileAccept({ connId: 'c-test', fileId: secondTransfer.fileId });

        expect(sendFileSpy).not.toHaveBeenCalled();
        expect(secondTransfer.state).toBe('QUEUED');
    });

    test('FILE_RECEIVED for the current file triggers sendFile on the next queued file', async () => {
        // Set up: first file is current and in flight, second is queued behind it.
        const first = fakeFile('first.txt', 100);
        const [firstTransfer] = await mgr.selectFiles([first], { sendImmediately: false });
        firstTransfer.transitionState('TRANSFERRING');
        mgr.queueManager.currentFile = firstTransfer;

        const second = fakeFile('second.txt', 50);
        const [secondTransfer] = await mgr.selectFiles([second], { sendImmediately: false });
        secondTransfer.transitionState('QUEUED');
        mgr.queueManager.addFile(secondTransfer);
        sendFileSpy.mockClear();

        // Simulate the receiver's "I have all the bytes" acknowledgement.
        await mgr.handleFileReceived({ connId: 'c-test', fileId: firstTransfer.fileId, totalBytes: 100 });

        expect(sendFileSpy).toHaveBeenCalledWith(second, secondTransfer.fileId);
        expect(secondTransfer.state).toBe('TRANSFERRING');
    });

    test('full multi-file flow via handleFileAccept: second file advances, not re-sent first', async () => {
        // Regression: handleFileAccept used to add the first file to BOTH
        // currentFile and queue. When the first file's FILE_RECEIVED came
        // back, completeCurrentFile nulled currentFile but the file stayed
        // in the queue. startNextFile then shifted the already-COMPLETED
        // first file back and re-sent it, leaving the real second file
        // stuck at QUEUED forever. The fix: a file is either currentFile
        // or queued, never both.
        const first = fakeFile('first.txt', 100);
        const [firstTransfer] = await mgr.selectFiles([first], { sendImmediately: false });

        // Simulate the receiver accepting the first offer. This is where the
        // bug used to put the file in both currentFile and queue.
        await mgr.handleFileAccept({ connId: 'c-test', fileId: firstTransfer.fileId });
        expect(firstTransfer.state).toBe('TRANSFERRING');
        expect(mgr.queueManager.currentFile).toBe(firstTransfer);
        expect(mgr.queueManager.queue).not.toContain(firstTransfer);
        sendFileSpy.mockClear();

        const second = fakeFile('second.txt', 50);
        const [secondTransfer] = await mgr.selectFiles([second], { sendImmediately: false });

        // Simulate the receiver accepting the second offer while the first
        // is still in flight. This must queue the second file, not start it.
        await mgr.handleFileAccept({ connId: 'c-test', fileId: secondTransfer.fileId });
        expect(secondTransfer.state).toBe('QUEUED');
        expect(mgr.queueManager.queue).toContain(secondTransfer);
        expect(mgr.queueManager.currentFile).toBe(firstTransfer);
        sendFileSpy.mockClear();

        // First file is acknowledged. The second file should start, and the
        // first file must NOT be re-sent.
        await mgr.handleFileReceived({ connId: 'c-test', fileId: firstTransfer.fileId, totalBytes: 100 });

        expect(firstTransfer.state).toBe('COMPLETED');
        expect(secondTransfer.state).toBe('TRANSFERRING');
        expect(mgr.queueManager.currentFile).toBe(secondTransfer);
        expect(sendFileSpy).toHaveBeenCalledWith(second, secondTransfer.fileId);
        expect(sendFileSpy).not.toHaveBeenCalledWith(first, firstTransfer.fileId);
    });

    test('startSendingChunks marks the file FAILED if no File object is stashed', async () => {
        // Simulate a receive-side FileTransfer that somehow got routed through
        // the sender path (shouldn't happen, but defense in depth).
        const transfer = {
            fileId: 'orphan',
            fileObject: null,
            state: 'TRANSFERRING',
            transitionState: jest.fn(function (s) { this.state = s; })
        };
        const errorSpy = jest.fn();
        mgr.on('fileError', errorSpy);

        mgr.startSendingChunks(transfer);

        expect(transfer.transitionState).toHaveBeenCalledWith('FAILED');
        expect(errorSpy).toHaveBeenCalled();
        expect(sendFileSpy).not.toHaveBeenCalled();
    });
});

describe('Regression: receiver-side COMPLETED transition and event', () => {
    // Pins down: the receiver transitions a file to COMPLETED and emits
    // 'fileTransferComplete' in chunkHandler.assembleFile (where the file is
    // actually assembled), NOT in handleTransferDone (where the sender's
    // control message can race ahead of late data chunks).

    describe('chunkHandler.assembleFile marks the file COMPLETED and emits fileTransferComplete', () => {
        let handler;
        let originalPersist;
        let originalGetConn;
        let originalGetFile;
        let originalEmit;
        let completeListener;
        let persisted;

        beforeEach(() => {
            handler = new ChunkHandler();

            // The file we will hand to the chunk handler.
            const file = new FileTransferClass({
                connId: 'c',
                fileId: 'af-1',
                name: 'a.bin',
                size: 16,
                mime: 'application/octet-stream',
                direction: 'receive'
            });
            file.transitionState('TRANSFERRING');
            fileTransferManagerSingleton.files.set(file.fileId, file);

            // Stub webrtcManager so handleDataMessage doesn't try to do anything
            // with the real connection during tests.
            originalGetConn = webrtcManagerSingleton.getConnectionInfo;
            webrtcManagerSingleton.getConnectionInfo = () => ({ connId: 'c' });

            // Stub the persistence path on the singleton.
            originalPersist = fileTransferManagerSingleton.persistFileState;
            persisted = [];
            fileTransferManagerSingleton.persistFileState = jest.fn(async (f) => {
                persisted.push(f);
            });

            // Capture fileTransferComplete emissions.
            originalEmit = fileTransferManagerSingleton.emit.bind(fileTransferManagerSingleton);
            completeListener = jest.fn();
            fileTransferManagerSingleton.on('fileTransferComplete', completeListener);
        });

        afterEach(() => {
            webrtcManagerSingleton.getConnectionInfo = originalGetConn;
            fileTransferManagerSingleton.persistFileState = originalPersist;
            fileTransferManagerSingleton.eventListeners.fileTransferComplete =
                (fileTransferManagerSingleton.eventListeners.fileTransferComplete || []).filter(l => l !== completeListener);
            fileTransferManagerSingleton.files.delete('af-1');
        });

        test('transitions the file to COMPLETED and emits fileTransferComplete', async () => {
            // Pre-populate received chunks as if two 8-byte chunks had arrived.
            handler.receivedChunks.set('af-1', new Map([
                [0, new ArrayBuffer(8)],
                [1, new ArrayBuffer(8)]
            ]));

            await handler.assembleFile('af-1');

            const file = fileTransferManagerSingleton.getFile('af-1');
            expect(file.state).toBe('COMPLETED');
            expect(completeListener).toHaveBeenCalledTimes(1);
            expect(completeListener).toHaveBeenCalledWith(file);
        });

        test('persists the new state', async () => {
            handler.receivedChunks.set('af-1', new Map([
                [0, new ArrayBuffer(8)],
                [1, new ArrayBuffer(8)]
            ]));

            await handler.assembleFile('af-1');

            expect(persisted).toHaveLength(1);
            expect(persisted[0].state).toBe('COMPLETED');
        });

        test('cleans up receivedChunks for the fileId after assembly', async () => {
            handler.receivedChunks.set('af-1', new Map([
                [0, new ArrayBuffer(8)],
                [1, new ArrayBuffer(8)]
            ]));

            await handler.assembleFile('af-1');

            expect(handler.receivedChunks.has('af-1')).toBe(false);
        });
    });

    describe('fileTransferManager.handleTransferDone is queue-management only', () => {
        let mgr;
        let completeListener;
        let originalGetConn;
        let originalSendControl;
        let originalSaveFile;
        let originalUpdateFileState;
        let originalDeleteFile;
        let originalSendFile;

        beforeEach(() => {
            mgr = new FileTransferManager();
            fileTransferManagerSingleton.files.set('ft-1', new FileTransferClass({
                connId: 'c',
                fileId: 'ft-1',
                name: 'f.bin',
                size: 10,
                mime: 'application/octet-stream',
                direction: 'receive'
            }));
            const receiveFile = fileTransferManagerSingleton.getFile('ft-1');
            receiveFile.transitionState('TRANSFERRING');

            originalGetConn = webrtcManagerSingleton.getConnectionInfo;
            originalSendControl = webrtcManagerSingleton.sendControlMessage;
            webrtcManagerSingleton.getConnectionInfo = () => ({ connId: 'c' });
            webrtcManagerSingleton.sendControlMessage = jest.fn();

            originalSaveFile = storageManagerSingleton.saveFile;
            originalUpdateFileState = storageManagerSingleton.updateFileState;
            originalDeleteFile = storageManagerSingleton.deleteFile;
            storageManagerSingleton.saveFile = jest.fn().mockResolvedValue(undefined);
            storageManagerSingleton.updateFileState = jest.fn().mockResolvedValue(undefined);
            storageManagerSingleton.deleteFile = jest.fn().mockResolvedValue(undefined);

            originalSendFile = chunkHandlerSingleton.sendFile;
            chunkHandlerSingleton.sendFile = jest.fn().mockResolvedValue(undefined);

            completeListener = jest.fn();
            mgr.on('fileTransferComplete', completeListener);
        });

        afterEach(() => {
            webrtcManagerSingleton.getConnectionInfo = originalGetConn;
            webrtcManagerSingleton.sendControlMessage = originalSendControl;
            storageManagerSingleton.saveFile = originalSaveFile;
            storageManagerSingleton.updateFileState = originalUpdateFileState;
            storageManagerSingleton.deleteFile = originalDeleteFile;
            chunkHandlerSingleton.sendFile = originalSendFile;
            fileTransferManagerSingleton.files.delete('ft-1');
        });

        test('does NOT transition a receive-side file to COMPLETED (was the premature-completion bug)', async () => {
            await mgr.handleTransferDone({ connId: 'c', fileId: 'ft-1' });

            const file = fileTransferManagerSingleton.getFile('ft-1');
            // Stays in TRANSFERRING. The actual COMPLETED transition happens in
            // chunkHandler.assembleFile once the last chunk has actually arrived.
            expect(file.state).toBe('TRANSFERRING');
        });

        test('does NOT emit fileTransferComplete (avoids duplicate "downloaded" events)', async () => {
            await mgr.handleTransferDone({ connId: 'c', fileId: 'ft-1' });

            expect(completeListener).not.toHaveBeenCalled();
        });

        test('still advances the local send queue if this side is also a sender', async () => {
            // The receive file is unrelated to the local send queue. Set up a
            // local send that should advance on FILE_RECEIVED.
            const first = { name: 'a.txt', size: 1, type: 'text/plain' };
            const [firstTransfer] = await mgr.selectFiles([first], { sendImmediately: false });
            firstTransfer.transitionState('TRANSFERRING');
            mgr.queueManager.currentFile = firstTransfer;

            const second = { name: 'b.txt', size: 1, type: 'text/plain' };
            const [secondTransfer] = await mgr.selectFiles([second], { sendImmediately: false });
            secondTransfer.transitionState('QUEUED');
            mgr.queueManager.addFile(secondTransfer);

            await mgr.handleFileReceived({ connId: 'c', fileId: firstTransfer.fileId, totalBytes: 1 });

            // The next file in the queue should now be the current file and
            // the chunk handler should have been invoked.
            expect(mgr.queueManager.currentFile).toBe(secondTransfer);
            expect(secondTransfer.state).toBe('TRANSFERRING');
        });
    });
});

describe('Regression: chunk integrity and FILE_RECEIVED / NACK protocol', () => {
    // Pins down: chunk assembly is driven by expected chunk count (from
    // file.size), not by the isLast flag. Missing chunks are detected and
    // surfaced via NACK up to MAX_NACK_ROUNDS times before failure. The
    // sender marks its local file COMPLETED only on FILE_RECEIVED, so the
    // two UIs stay in sync with the receiver's view of the data.

    describe('chunkHandler: assembly is driven by expected chunk count, not isLast', () => {
        let handler;
        let originalGetConn;
        let originalSendControl;
        let originalPersist;
        let originalSendData;
        let controlMessages;
        let dataMessages;
        let persisted;

        beforeEach(() => {
            handler = new ChunkHandler();
            controlMessages = [];
            dataMessages = [];
            persisted = [];

            originalGetConn = webrtcManagerSingleton.getConnectionInfo;
            originalSendControl = webrtcManagerSingleton.sendControlMessage;
            originalSendData = webrtcManagerSingleton.sendDataMessage;
            originalPersist = fileTransferManagerSingleton.persistFileState;

            webrtcManagerSingleton.getConnectionInfo = () => ({ connId: 'c' });
            webrtcManagerSingleton.sendControlMessage = jest.fn((m) => controlMessages.push(m));
            webrtcManagerSingleton.sendDataMessage = jest.fn((m) => dataMessages.push(m));
            fileTransferManagerSingleton.persistFileState = jest.fn(async (f) => { persisted.push(f); });
        });

        afterEach(() => {
            webrtcManagerSingleton.getConnectionInfo = originalGetConn;
            webrtcManagerSingleton.sendControlMessage = originalSendControl;
            webrtcManagerSingleton.sendDataMessage = originalSendData;
            fileTransferManagerSingleton.persistFileState = originalPersist;
            fileTransferManagerSingleton.files.delete('count-1');
        });

        test('does NOT assemble when the isLast chunk arrives if other chunks are missing', async () => {
            const file = new FileTransferClass({
                connId: 'c', fileId: 'count-1', name: 'a.bin',
                size: 32 * 1024, mime: 'application/octet-stream', direction: 'receive'
            });
            file.transitionState('TRANSFERRING');
            fileTransferManagerSingleton.files.set(file.fileId, file);

            // ceil(32768/8192) = 4 expected chunks. Arrive in scrambled order
            // with the isLast one early — the receiver should NOT assemble
            // because 3 of 4 chunks are present, regardless of isLast.
            await handler.storeChunk('count-1', 0, new ArrayBuffer(8192), false);
            await handler.storeChunk('count-1', 1, new ArrayBuffer(8192), false);
            await handler.storeChunk('count-1', 3, new ArrayBuffer(8192), true);

            expect(handler.receivedChunks.get('count-1').size).toBe(3);
            expect(file.state).toBe('TRANSFERRING');
            expect(persisted).toHaveLength(0);
            // No FILE_RECEIVED has been sent.
            expect(controlMessages.filter(m => m.type === 'FILE_RECEIVED')).toHaveLength(0);
            // A NACK should have been sent for the missing index (2).
            const nacks = controlMessages.filter(m => m.type === 'CHUNK_REQUEST_NACK');
            expect(nacks).toHaveLength(1);
            expect(nacks[0].missingIndices).toEqual([2]);
        });

        test('assembles on chunk-count match even when isLast was not seen', async () => {
            const file = new FileTransferClass({
                connId: 'c', fileId: 'count-2', name: 'b.bin',
                size: 16 * 1024, mime: 'application/octet-stream', direction: 'receive'
            });
            file.transitionState('TRANSFERRING');
            fileTransferManagerSingleton.files.set(file.fileId, file);

            // 2 expected chunks, all arrived with isLast=false on each
            // (e.g. sender's isLast flag was lost — receiver should still
            // assemble because the count matches).
            await handler.storeChunk('count-2', 0, new ArrayBuffer(8192), false);
            await handler.storeChunk('count-2', 1, new ArrayBuffer(8192), false);

            expect(file.state).toBe('COMPLETED');
            expect(persisted).toHaveLength(1);
            const ack = controlMessages.find(m => m.type === 'FILE_RECEIVED');
            expect(ack).toBeDefined();
            expect(ack.fileId).toBe('count-2');
            fileTransferManagerSingleton.files.delete('count-2');
        });

        test('late chunks after assembly are ignored (no duplicate transitions)', async () => {
            const file = new FileTransferClass({
                connId: 'c', fileId: 'count-3', name: 'c.bin',
                size: 8 * 1024, mime: 'application/octet-stream', direction: 'receive'
            });
            file.transitionState('TRANSFERRING');
            fileTransferManagerSingleton.files.set(file.fileId, file);

            await handler.storeChunk('count-3', 0, new ArrayBuffer(8192), true);
            expect(file.state).toBe('COMPLETED');
            const initialPersists = persisted.length;

            // Late duplicate chunk — must be a no-op.
            await handler.storeChunk('count-3', 0, new ArrayBuffer(8192), true);
            expect(persisted.length).toBe(initialPersists);
            fileTransferManagerSingleton.files.delete('count-3');
        });

        test('late chunk for a different index after assembly is a silent no-op (re-send stragglers)', async () => {
            // Simulates the NACK re-send path: receiver briefly NACKs because
            // the isLast chunk arrived a hair ahead of an earlier chunk. The
            // sender re-sends from cache, but by the time the re-sent chunk
            // arrives the original (out-of-order) chunk has already shown up
            // and assembly has completed. The re-sent chunk must be a no-op,
            // not a duplicate FILE_RECEIVED.
            const file = new FileTransferClass({
                connId: 'c', fileId: 'count-4', name: 'd.bin',
                size: 16 * 1024, mime: 'application/octet-stream', direction: 'receive'
            });
            file.transitionState('TRANSFERRING');
            fileTransferManagerSingleton.files.set(file.fileId, file);

            // 2 expected chunks. The "out-of-order" path: chunk 1 arrives
            // first, then chunk 0. At the time chunk 1 (isLast=true) arrives,
            // fileChunks.size=1 < expectedChunks=2 so the receiver NACKs for
            // [0]. Then chunk 0 arrives, the count matches, assembly runs.
            await handler.storeChunk('count-4', 1, new ArrayBuffer(8192), true);
            expect(file.state).toBe('TRANSFERRING');
            expect(controlMessages.filter(m => m.type === 'CHUNK_REQUEST_NACK')).toHaveLength(1);

            await handler.storeChunk('count-4', 0, new ArrayBuffer(8192), false);
            expect(file.state).toBe('COMPLETED');
            const fileReceivedCount = controlMessages.filter(m => m.type === 'FILE_RECEIVED').length;
            expect(fileReceivedCount).toBe(1);

            // Now the re-sent chunk 0 arrives (from the NACK above). The
            // receiver must silently drop it, not send a second FILE_RECEIVED.
            await handler.storeChunk('count-4', 0, new ArrayBuffer(8192), false);
            expect(controlMessages.filter(m => m.type === 'FILE_RECEIVED')).toHaveLength(fileReceivedCount);
            fileTransferManagerSingleton.files.delete('count-4');
        });
    });

    describe('chunkHandler: missing-chunk NACK + bounded retries', () => {
        let handler;
        let originalGetConn;
        let originalSendControl;
        let originalPersist;
        let controlMessages;
        let persisted;
        let failListener;

        beforeEach(() => {
            handler = new ChunkHandler();
            controlMessages = [];
            persisted = [];

            originalGetConn = webrtcManagerSingleton.getConnectionInfo;
            originalSendControl = webrtcManagerSingleton.sendControlMessage;
            originalPersist = fileTransferManagerSingleton.persistFileState;

            webrtcManagerSingleton.getConnectionInfo = () => ({ connId: 'c' });
            webrtcManagerSingleton.sendControlMessage = jest.fn((m) => controlMessages.push(m));
            fileTransferManagerSingleton.persistFileState = jest.fn(async (f) => { persisted.push(f); });

            failListener = jest.fn();
            fileTransferManagerSingleton.on('fileTransferFailed', failListener);
        });

        afterEach(() => {
            webrtcManagerSingleton.getConnectionInfo = originalGetConn;
            webrtcManagerSingleton.sendControlMessage = originalSendControl;
            fileTransferManagerSingleton.persistFileState = originalPersist;
            fileTransferManagerSingleton.eventListeners.fileTransferFailed =
                (fileTransferManagerSingleton.eventListeners.fileTransferFailed || []).filter(l => l !== failListener);
            fileTransferManagerSingleton.files.delete('miss-1');
        });

        test('after MAX_NACK_ROUNDS missing rounds, the file is marked FAILED', async () => {
            const file = new FileTransferClass({
                connId: 'c', fileId: 'miss-1', name: 'm.bin',
                size: 16 * 1024, mime: 'application/octet-stream', direction: 'receive'
            });
            file.transitionState('TRANSFERRING');
            fileTransferManagerSingleton.files.set(file.fileId, file);

            // 4 isLast arrivals with chunk 1 still missing: 3 NACKs then FAILED.
            for (let i = 0; i < 4; i++) {
                await handler.storeChunk('miss-1', 0, new ArrayBuffer(8192), true);
            }

            const nacks = controlMessages.filter(m => m.type === 'CHUNK_REQUEST_NACK');
            // Rounds 1, 2, 3 send NACK; round 4 (rounds > MAX) triggers FAILED.
            expect(nacks).toHaveLength(3);
            expect(file.state).toBe('FAILED');
            expect(failListener).toHaveBeenCalledWith(file);
        });
    });
});

describe('Regression: data channel is reliable (no maxRetransmits: 0)', () => {
    // Pins down: the data channel must NOT be configured with
    // maxRetransmits: 0, which puts it in unreliable mode and would let
    // chunks be silently dropped — corrupting reassembled files.

    test('createDataChannel does not pass maxRetransmits: 0', () => {
        const manager = new WebRTCManager();
        const created = [];
        manager.peerConnection = {
            createDataChannel: (label, init) => {
                created.push({ label, init });
                return { label, onopen: null, onclose: null, onerror: null, onmessage: null };
            },
            ondatachannel: null,
            connectionState: 'new',
            addEventListener: () => {}
        };

        manager.setupDataChannels(true);

        for (const c of created) {
            expect(c.init.maxRetransmits).toBeUndefined();
            expect(c.init.maxPacketLifeTime).toBeUndefined();
            expect(c.init.ordered).toBe(true);
        }
    });

    test('data channel has bufferedAmountLowThreshold set so backpressure works', () => {
        // Without this, bufferedamountlow only fires when the buffer is
        // fully drained (default threshold = 0), which starves throughput.
        // With it set, the sender can pipeline chunks and still get
        // woken up before the buffer overflows.
        const manager = new WebRTCManager();
        const created = [];
        manager.peerConnection = {
            createDataChannel: (label, init) => {
                created.push({ label, init });
                return { label, onopen: null, onclose: null, onerror: null, onmessage: null };
            },
            ondatachannel: null,
            connectionState: 'new',
            addEventListener: () => {}
        };

        manager.setupDataChannels(true);

        const dataChannel = created.find(c => c.label === 'data');
        expect(dataChannel).toBeDefined();
        expect(dataChannel.init.bufferedAmountLowThreshold).toBeGreaterThan(0);
    });
});

describe('Regression: data channel backpressure prevents overflow on large files', () => {
    // Pins down: sendDataMessage must apply backpressure by returning a
    // Promise that resolves only when the SCTP send buffer has drained
    // past bufferedAmountLowThreshold. Without this, the sender pushes
    // chunks into the buffer as fast as FileReader fires onload, the
    // buffer overflows around 16 MiB, and the channel closes silently —
    // the sender's UI shows "not connected" while the receiver stays
    // stuck on the progress bar.

    test('sendDataMessage returns a Promise (awaitable backpressure)', () => {
        const manager = new WebRTCManager();
        const sendSpy = jest.fn();
        manager.dataChannel = {
            readyState: 'open',
            bufferedAmount: 0,
            bufferedAmountLowThreshold: 1024,
            send: sendSpy
        };

        const result = manager.sendDataMessage(new ArrayBuffer(8));
        expect(result).toBeInstanceOf(Promise);
        return result;
    });

    test('sendDataMessage resolves immediately when buffer is already drained', async () => {
        const manager = new WebRTCManager();
        manager.dataChannel = {
            readyState: 'open',
            bufferedAmount: 100,
            bufferedAmountLowThreshold: 1024,
            send: jest.fn()
        };

        const start = Date.now();
        await manager.sendDataMessage(new ArrayBuffer(8));
        // Should be effectively instant — no waiting for bufferedamountlow.
        expect(Date.now() - start).toBeLessThan(50);
    });

    test('sendDataMessage waits for bufferedamountlow when buffer is full', async () => {
        const manager = new WebRTCManager();
        const listeners = {};
        manager.dataChannel = {
            readyState: 'open',
            bufferedAmount: 5_000_000, // above the 1 MiB threshold
            bufferedAmountLowThreshold: 1024 * 1024,
            send: jest.fn(),
            addEventListener: (event, cb) => {
                listeners[event] = cb;
            },
            removeEventListener: (event, cb) => {
                if (listeners[event] === cb) delete listeners[event];
            }
        };

        const sendPromise = manager.sendDataMessage(new ArrayBuffer(8));
        // Give the microtask queue a tick to register the listener.
        await Promise.resolve();
        expect(listeners.bufferedamountlow).toBeDefined();

        // Simulate the buffer draining.
        manager.dataChannel.bufferedAmount = 0;
        listeners.bufferedamountlow();

        await sendPromise;
        expect(listeners.bufferedamountlow).toBeUndefined();
    });

    test('sendDataMessage is a no-op when the data channel is not open', async () => {
        const manager = new WebRTCManager();
        manager.dataChannel = { readyState: 'closed' };

        // Should resolve (not hang or throw) even though the channel is closed.
        await manager.sendDataMessage(new ArrayBuffer(8));
    });
});

describe('Regression: sender waits for FILE_RECEIVED before marking COMPLETED', () => {
    // Pins down: the sender does NOT mark its local file COMPLETED on
    // TRANSFER_DONE — it waits for the receiver's FILE_RECEIVED ack so the
    // two UIs stay in sync. sendTransferDone only sends the control message
    // and arms a timeout.

    test('sendTransferDone does NOT mark the file COMPLETED on the sender side', async () => {
        const mgr = new FileTransferManager();
        const file = new FileTransferClass({
            connId: 'c', fileId: 'st-1', name: 's.bin', size: 100,
            mime: 'application/octet-stream', direction: 'send'
        });
        file.transitionState('TRANSFERRING');
        mgr.files.set(file.fileId, file);

        // Stub network path.
        webrtcManagerSingleton.sendControlMessage = jest.fn();
        mgr.persistFileState = jest.fn().mockResolvedValue(undefined);

        const completeListener = jest.fn();
        mgr.on('fileTransferComplete', completeListener);

        await mgr.sendTransferDone(file.fileId);

        // Sender-side state is still TRANSFERRING — waiting for ACK.
        expect(file.state).toBe('TRANSFERRING');
        expect(completeListener).not.toHaveBeenCalled();
        // The control message was still sent.
        expect(webrtcManagerSingleton.sendControlMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'TRANSFER_DONE', fileId: 'st-1' })
        );
        mgr.clearAckTimer('st-1');
        mgr.files.delete('st-1');
    });

    test('handleFileReceived marks the file COMPLETED and emits fileTransferComplete', async () => {
        const mgr = new FileTransferManager();
        const file = new FileTransferClass({
            connId: 'c', fileId: 'hr-1', name: 'r.bin', size: 100,
            mime: 'application/octet-stream', direction: 'send'
        });
        file.transitionState('TRANSFERRING');
        mgr.files.set(file.fileId, file);

        mgr.persistFileState = jest.fn().mockResolvedValue(undefined);
        mgr.queueManager.currentFile = file;

        const completeListener = jest.fn();
        mgr.on('fileTransferComplete', completeListener);

        await mgr.handleFileReceived({ connId: 'c', fileId: 'hr-1', totalBytes: 100 });

        expect(file.state).toBe('COMPLETED');
        expect(completeListener).toHaveBeenCalledWith(file);
        // Cache is cleared on receipt.
        expect(mgr.sentChunkCache.has('hr-1')).toBe(false);
        mgr.files.delete('hr-1');
    });

    test('CHUNK_REQUEST_NACK re-sends the requested chunks from the cache', async () => {
        const mgr = new FileTransferManager();
        const file = new FileTransferClass({
            connId: 'c', fileId: 'nack-1', name: 'n.bin', size: 100,
            mime: 'application/octet-stream', direction: 'send'
        });
        mgr.files.set(file.fileId, file);

        const chunk0 = new ArrayBuffer(8);
        const chunk2 = new ArrayBuffer(8);
        mgr.cacheChunk('nack-1', 0, chunk0);
        mgr.cacheChunk('nack-1', 2, chunk2);

        // Spy on chunk header/combine + data channel send.
        const sendDataSpy = jest.fn();
        webrtcManagerSingleton.sendDataMessage = sendDataSpy;
        const headerSpy = jest.spyOn(chunkHandlerSingleton, 'createChunkHeader');
        const combineSpy = jest.spyOn(chunkHandlerSingleton, 'combineBuffer');

        await mgr.handleChunkRequestNack({
            connId: 'c',
            fileId: 'nack-1',
            missingIndices: [0, 2]
        });

        expect(headerSpy).toHaveBeenCalledWith('nack-1', 0, false);
        expect(headerSpy).toHaveBeenCalledWith('nack-1', 2, false);
        expect(combineSpy).toHaveBeenCalled();
        expect(sendDataSpy).toHaveBeenCalledTimes(2);
        // The retransmit arms the ack timer.
        expect(mgr.ackTimers.has('nack-1')).toBe(true);

        mgr.clearAckTimer('nack-1');
        mgr.sentChunkCache.delete('nack-1');
        mgr.files.delete('nack-1');
        headerSpy.mockRestore();
        combineSpy.mockRestore();
    });

    test('NACK for a file not in the cache is a no-op (defensive)', async () => {
        const mgr = new FileTransferManager();
        const sendDataSpy = jest.fn();
        webrtcManagerSingleton.sendDataMessage = sendDataSpy;

        await mgr.handleChunkRequestNack({
            connId: 'c', fileId: 'unknown', missingIndices: [0, 1, 2]
        });

        expect(sendDataSpy).not.toHaveBeenCalled();
    });
});

describe('Regression: sendFile marks the last chunk with isLast=true', () => {
    // Pins down: the sender's onload handler must flag the final chunk with
    // isLast=true so the receiver's NACK detection and the sender's own
    // bookkeeping know when the byte stream is complete. We exercise sendFile
    // with a real FileReader backed by a Blob of a non-CHUNK_SIZE-aligned
    // size so the last chunk is smaller than 8192 bytes.

    test('last chunk (smaller than CHUNK_SIZE) is sent with isLast=true', async () => {
        const handler = new ChunkHandler();
        // Network stubs.
        const sentMessages = [];
        webrtcManagerSingleton.sendDataMessage = (msg) => {
            sentMessages.push(msg);
            return true;
        };
        // Transfer manager stubs.
        const cacheChunks = [];
        fileTransferManagerSingleton.cacheChunk = (fileId, index, data) => {
            cacheChunks.push({ fileId, index, size: data.byteLength });
        };
        fileTransferManagerSingleton.sendTransferDone = jest.fn().mockResolvedValue(undefined);

        // Real Blob → real FileReader. 24000 bytes = 2 full chunks + 1 of 7616.
        const blob = new Blob([new Uint8Array(24000)]);
        const file = new File([blob], 'test.bin', { type: 'application/octet-stream' });
        await handler.sendFile(file, 'last-1');

        // Parse each message header to extract isLast. ArrayBuffer has no
        // indexed access — go through a Uint8Array view.
        const HEADER_SIZE = 41;
        const records = sentMessages.map((msg) => {
            const view = new Uint8Array(msg);
            return {
                index: new DataView(msg.slice(36, 40)).getUint32(0, false),
                isLast: view[40] === 1,
                size: msg.byteLength - HEADER_SIZE
            };
        });

        // 3 chunks total: indices 0, 1, 2.
        expect(records).toHaveLength(3);
        expect(records[0]).toEqual({ index: 0, isLast: false, size: 8192 });
        expect(records[1]).toEqual({ index: 1, isLast: false, size: 8192 });
        expect(records[2]).toEqual({ index: 2, isLast: true, size: 7616 });
    });

    test('single-chunk file (size === CHUNK_SIZE) is sent with isLast=true', async () => {
        const handler = new ChunkHandler();
        const sentMessages = [];
        webrtcManagerSingleton.sendDataMessage = (msg) => { sentMessages.push(msg); return true; };
        fileTransferManagerSingleton.cacheChunk = jest.fn();
        fileTransferManagerSingleton.sendTransferDone = jest.fn().mockResolvedValue(undefined);

        const blob = new Blob([new Uint8Array(8192)]);
        const file = new File([blob], 'single.bin', { type: 'application/octet-stream' });
        await handler.sendFile(file, 'single-1');

        const HEADER_SIZE = 41;
        const records = sentMessages.map((msg) => {
            const view = new Uint8Array(msg);
            return {
                index: new DataView(msg.slice(36, 40)).getUint32(0, false),
                isLast: view[40] === 1,
                size: msg.byteLength - HEADER_SIZE
            };
        });

        expect(records).toHaveLength(1);
        expect(records[0]).toEqual({ index: 0, isLast: true, size: 8192 });
    });
});

describe('Regression: bidirectional file transfer (send then receive, then send again)', () => {
    // Pins down: after device A sends a file to device B successfully,
    // device B can then send a file back to A. The bug was that B's
    // sendFileAccept set queueManager.currentFile to the received file,
    // which was never cleared (assembleFile transitions the file to
    // COMPLETED but doesn't touch the queue manager). After A->B
    // finished, B's queueManager.currentFile was stuck on the completed
    // receive; when B then sent a file to A, B's handleFileAccept saw
    // hasCurrentFile()=true and pushed the new send into the QUEUED
    // state, where startNextFile's `if (currentFile) return` short-circuit
    // prevented the queue from ever advancing.

    let mgr;
    let originalPersist;
    let originalSendControl;
    let originalSendData;
    let originalGetConn;
    let originalSendTransferDone;
    let originalCacheChunk;
    let originalStartSendingChunks;

    beforeEach(() => {
        mgr = new FileTransferManager();

        // Stub the persistence path.
        originalPersist = mgr.persistFileState;
        mgr.persistFileState = jest.fn().mockResolvedValue(undefined);

        // Stub the control / data channels.
        originalSendControl = webrtcManagerSingleton.sendControlMessage;
        webrtcManagerSingleton.sendControlMessage = jest.fn();
        originalSendData = webrtcManagerSingleton.sendDataMessage;
        webrtcManagerSingleton.sendDataMessage = jest.fn().mockReturnValue(Promise.resolve());
        originalGetConn = webrtcManagerSingleton.getConnectionInfo;
        webrtcManagerSingleton.getConnectionInfo = () => ({ connId: 'c' });

        // Stub the chunk handler integrations.
        originalSendTransferDone = mgr.sendTransferDone;
        mgr.sendTransferDone = jest.fn().mockResolvedValue(undefined);
        originalCacheChunk = mgr.cacheChunk;
        mgr.cacheChunk = jest.fn();

        // handleFileAccept calls startSendingChunks on success. We don't
        // need the actual chunk pipeline here — only the queue/state
        // transition we're regression-pinning.
        originalStartSendingChunks = mgr.startSendingChunks;
        mgr.startSendingChunks = jest.fn();
    });

    afterEach(() => {
        mgr.persistFileState = originalPersist;
        mgr.sendTransferDone = originalSendTransferDone;
        mgr.cacheChunk = originalCacheChunk;
        mgr.startSendingChunks = originalStartSendingChunks;
        webrtcManagerSingleton.sendControlMessage = originalSendControl;
        webrtcManagerSingleton.sendDataMessage = originalSendData;
        webrtcManagerSingleton.getConnectionInfo = originalGetConn;
        mgr.files.clear();
        mgr.pendingOffers.clear();
        mgr.queueManager.clear();
    });

    test('sendFileAccept does not pollute the send queue with the received file', async () => {
        // B is the receiver. It accepts A's file offer.
        const receivedFile = new FileTransferClass({
            connId: 'c', fileId: 'recv-1', name: 'fromA.bin', size: 100,
            mime: 'application/octet-stream', direction: 'receive'
        });
        mgr.pendingOffers.set(receivedFile.fileId, receivedFile);
        mgr.files.set(receivedFile.fileId, receivedFile);

        await mgr.sendFileAccept('recv-1');

        // The receive transitions to TRANSFERRING and leaves pendingOffers.
        expect(receivedFile.state).toBe('TRANSFERRING');
        expect(mgr.pendingOffers.has('recv-1')).toBe(false);

        // The critical invariant: queueManager.currentFile is NOT set for
        // a receive. The send queue must stay clean across direction switches.
        expect(mgr.queueManager.currentFile).toBeNull();
    });

    test('after receiving a file, the next send becomes current (not stuck in QUEUED)', async () => {
        // Simulates the full B-side flow:
        // 1) B accepts A's file (receive) — must not touch send queue.
        // 2) A's chunks arrive, B's assembleFile runs, B's local state COMPLETED.
        // 3) B initiates a new send to A (handleFileAccept is the entry point).
        // 4) B's new send must become the current send, not get stuck in QUEUED.

        // 1) B accepts A's file.
        const recvFile = new FileTransferClass({
            connId: 'c', fileId: 'recv-1', name: 'fromA.bin', size: 8192,
            mime: 'application/octet-stream', direction: 'receive'
        });
        mgr.pendingOffers.set(recvFile.fileId, recvFile);
        mgr.files.set(recvFile.fileId, recvFile);

        await mgr.sendFileAccept('recv-1');
        // Receive must not touch the send queue.
        expect(mgr.queueManager.currentFile).toBeNull();

        // 2) Simulate A's chunk arriving and assembleFile completing.
        //    The chunk handler uses the singleton's fileTransferManager, so
        //    we put the receive file there too and feed the chunk via the
        //    singleton.
        fileTransferManagerSingleton.files.set(recvFile.fileId, recvFile);
        const handler = new ChunkHandler();
        // Stub assembleFile side effects (no real persistence / no real sender).
        const sentControls = [];
        webrtcManagerSingleton.sendControlMessage = (msg) => sentControls.push(msg);
        fileTransferManagerSingleton.persistFileState = jest.fn().mockResolvedValue(undefined);
        try {
            await handler.storeChunk('recv-1', 0, new ArrayBuffer(8192), true);
            expect(recvFile.state).toBe('COMPLETED');
            // Receive completion must not pollute the send queue either.
            expect(mgr.queueManager.currentFile).toBeNull();
        } finally {
            fileTransferManagerSingleton.files.delete('recv-1');
        }

        // 3) B initiates a new send via handleFileAccept (the message
        //    A sends back when it accepts B's FILE_OFFER).
        const sendFile = new FileTransferClass({
            connId: 'c', fileId: 'send-2', name: 'toA.bin', size: 100,
            mime: 'application/octet-stream', direction: 'send'
        });
        mgr.files.set(sendFile.fileId, sendFile);

        await mgr.handleFileAccept({ connId: 'c', fileId: 'send-2' });

        // 4) B's new send must have become the current send, not QUEUED.
        expect(sendFile.state).toBe('TRANSFERRING');
        expect(mgr.queueManager.currentFile).toBe(sendFile);
        expect(mgr.queueManager.hasCurrentFile()).toBe(true);
    });
});

/**
 * Regression for the bug where device B (still connected) would show one
 * or two delayed red "Connection failed" / "ICE negotiation failed" error
 * dialogs after device A reloaded its page. The peer-disconnect lifecycle
 * events from the WebRTC layer must:
 *   1. transition the connection state to FAILED, AND
 *   2. NOT escalate to a user-facing error (the other device's UI is the
 *      same — a clean reload — so a dialog would be asymmetric and not
 *      actionable for the user).
 */
describe('Regression: peer-disconnect is silent (no user-facing error)', () => {
    let manager;
    let errorSpy;

    beforeEach(() => {
        manager = new WebRTCManager();
        // Install a mock peerConnection that records the on*change handlers
        // so the test can fire them manually — the constructor's
        // setupPeerConnectionHandlers() runs against MockRTCPeerConnection
        // which is a plain object, so we re-run setup against our mock.
        manager.peerConnection = {
            connectionState: 'new',
            iceConnectionState: 'new',
            onicecandidate: null,
            onconnectionstatechange: null,
            oniceconnectionstatechange: null,
            ondatachannel: null,
        };
        manager.setupPeerConnectionHandlers();

        // Spy on the errorHandler after import. handleWebRTCError is the
        // path that escalates to a user alert via the CRITICAL branch.
        errorSpy = jest.spyOn(errorHandlerSingleton, 'handleWebRTCError').mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    test('connectionstatechange -> failed transitions to FAILED and does NOT call errorHandler', async () => {
        // Bring the manager up to CONNECTED so FAILED is a valid transition.
        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.CONNECTING);
        await manager.transitionState(ConnectionState.CONNECTED);

        manager.peerConnection.connectionState = 'failed';
        manager.peerConnection.onconnectionstatechange();

        expect(manager.state).toBe(ConnectionState.FAILED);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('iceconnectionstatechange -> failed transitions to FAILED and does NOT call errorHandler', async () => {
        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.CONNECTING);
        await manager.transitionState(ConnectionState.CONNECTED);

        manager.peerConnection.iceConnectionState = 'failed';
        manager.peerConnection.oniceconnectionstatechange();

        expect(manager.state).toBe(ConnectionState.FAILED);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('a late iceconnectionstatechange -> failed after FAILED is a no-op and stays silent', async () => {
        // This is the "seconds later" scenario from the bug report: the
        // connectionstatechange already moved us to FAILED, then a delayed
        // iceconnectionstatechange fires. The errorHandler must not be
        // called for this late event either.
        await manager.transitionState(ConnectionState.NEW);
        await manager.transitionState(ConnectionState.CONNECTING);
        await manager.transitionState(ConnectionState.CONNECTED);

        manager.peerConnection.connectionState = 'failed';
        manager.peerConnection.onconnectionstatechange();
        expect(manager.state).toBe(ConnectionState.FAILED);
        expect(errorSpy).not.toHaveBeenCalled();

        errorSpy.mockClear();
        manager.peerConnection.iceConnectionState = 'failed';
        manager.peerConnection.oniceconnectionstatechange();
        // Late ICE event: state was FAILED -> FAILED, transitionState rejects
        // it (FAILED not in CLOSED's validTransitions), so state stays FAILED.
        // The error handler must still not fire.
        expect(manager.state).toBe(ConnectionState.FAILED);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('connectionstatechange -> connected/completed still tries to advance (regression guard)', async () => {
        // Sanity check: removing the errorHandler calls must not have
        // broken the happy path. Bring the manager up to NEW, set up
        // channels (mirroring the offerer setup in earlier tests), open
        // them, and verify the 'connected' state still drives the
        // transition.
        const controlChannel = { label: 'control', onopen: null, onclose: null, onerror: null, onmessage: null };
        const dataChannel = { label: 'data', onopen: null, onclose: null, onerror: null, onmessage: null };
        manager.peerConnection.createDataChannel = jest.fn((label) => label === 'control' ? controlChannel : dataChannel);
        await manager.transitionState(ConnectionState.NEW);
        await manager.setupDataChannels(true);

        // open both channels, then fire the connected state change.
        controlChannel.onopen();
        dataChannel.onopen();
        manager.peerConnection.connectionState = 'connected';
        manager.peerConnection.onconnectionstatechange();

        expect(manager.state).toBe(ConnectionState.CONNECTED);
    });
});
