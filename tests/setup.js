// Jest setup
// Mock browser APIs for testing

// Mock RTCPeerConnection
class MockRTCPeerConnection {
    constructor(config) {
        this.config = config;
        this.connectionState = 'new';
        this.iceConnectionState = 'new';
        this.iceGatheringState = 'new';
        this.localDescription = null;
        this.remoteDescription = null;
        this.onicecandidate = null;
        this.onconnectionstatechange = null;
        this.oniceconnectionstatechange = null;
        this.ondatachannel = null;
    }

    createDataChannel(label, options) {
        return new MockRTCDataChannel(label, options);
    }

    createOffer() {
        return Promise.resolve({ sdp: 'mock-offer' });
    }

    createAnswer() {
        return Promise.resolve({ sdp: 'mock-answer' });
    }

    setLocalDescription(desc) {
        this.localDescription = desc;
        this.iceGatheringState = 'complete';
        return Promise.resolve();
    }

    setRemoteDescription(desc) {
        this.remoteDescription = desc;
        return Promise.resolve();
    }

    addIceCandidate(candidate) {
        return Promise.resolve();
    }

    close() {
        this.connectionState = 'closed';
    }
}

class MockRTCDataChannel {
    constructor(label, options) {
        this.label = label;
        this.readyState = 'open';
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
    }

    send(data) {}
    close() {}
}

// Mock WebRTC globals
global.RTCPeerConnection = MockRTCPeerConnection;
global.RTCDataChannel = MockRTCDataChannel;

// Mock IndexedDB
class MockIDBRequest {
    constructor() {
        this.onsuccess = null;
        this.onerror = null;
        this.onupgradeneeded = null;
        this.result = null;
    }
}

class MockIDBTransaction {
    constructor() {
        this.objectStore = () => this;
    }

    objectStore(name) {
        return {
            put: () => new MockIDBRequest(),
            get: () => new MockIDBRequest(),
            delete: () => new MockIDBRequest(),
            clear: () => new MockIDBRequest(),
            openCursor: () => new MockIDBRequest(),
            createIndex: () => ({}),
        };
    }
}

class MockIDBDatabase {
    constructor() {
        this.transaction = () => new MockIDBTransaction();
    }
}

global.indexedDB = {
    open: (name, version) => {
        const request = new MockIDBRequest();
        request.result = new MockIDBDatabase();
        setTimeout(() => {
            if (request.onupgradeneeded) {
                request.onupgradeneeded({ target: request });
            }
            if (request.onsuccess) {
                request.onsuccess({ target: request });
            }
        }, 0);
        return request;
    },
};

// Mock UUID
global.Uint32Array = Uint32Array;

// Mock crypto
if (!global.crypto) {
    global.crypto = {
        getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 1000000);
            }
            return arr;
        },
    };
}

// Mock navigator
if (!global.navigator) {
    global.navigator = {};
}
Object.defineProperty(navigator, 'storage', {
    value: {
        estimate: () => Promise.resolve({ usage: 0, quota: 1000000, percentage: 0 }),
    },
    writable: true,
});
