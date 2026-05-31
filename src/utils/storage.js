/**
 * IndexedDB Storage Module
 * Implements persistent storage for connections, files, chunks, and queue (ISSUE-005)
 * Uses IndexedDB API (ADR-0021)
 */

// Database name and version
const DB_NAME = 'LocalFileShare';
const DB_VERSION = 1;

// Object store names
const STORE_CONNECTIONS = 'connections';
const STORE_FILES = 'files';
const STORE_CHUNKS = 'chunks';
const STORE_QUEUE = 'queue';

/**
 * Storage Manager
 * Manages IndexedDB operations for persistent storage
 */
export class StorageManager {
    constructor() {
        this.db = null;
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize the database
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = (event) => {
                    console.error('IndexedDB open error:', event.target.error);
                    reject(event.target.error);
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.initialized = true;
                    console.log('IndexedDB initialized successfully');
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // Create connections store
                    if (!db.objectStoreNames.contains(STORE_CONNECTIONS)) {
                        const connectionsStore = db.createObjectStore(STORE_CONNECTIONS, {
                            keyPath: 'connId'
                        });
                        // Indexes
                        connectionsStore.createIndex('secret', 'secret', { unique: false });
                        connectionsStore.createIndex('state', 'state', { unique: false });
                        connectionsStore.createIndex('createdAt', 'createdAt', { unique: false });
                        connectionsStore.createIndex('lastActivityAt', 'lastActivityAt', { unique: false });
                    }

                    // Create files store
                    if (!db.objectStoreNames.contains(STORE_FILES)) {
                        const filesStore = db.createObjectStore(STORE_FILES, {
                            keyPath: ['connId', 'fileId']
                        });
                        // Indexes
                        filesStore.createIndex('connId', 'connId', { unique: false });
                        filesStore.createIndex('fileId', 'fileId', { unique: false });
                        filesStore.createIndex('state', 'state', { unique: false });
                        filesStore.createIndex('direction', 'direction', { unique: false });
                        filesStore.createIndex('createdAt', 'createdAt', { unique: false });
                        filesStore.createIndex('completedAt', 'completedAt', { unique: false });
                    }

                    // Create chunks store
                    if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
                        const chunksStore = db.createObjectStore(STORE_CHUNKS, {
                            keyPath: ['connId', 'fileId', 'index']
                        });
                        // Indexes
                        chunksStore.createIndex('connId', 'connId', { unique: false });
                        chunksStore.createIndex('fileId', 'fileId', { unique: false });
                        chunksStore.createIndex('connId_fileId', ['connId', 'fileId'], { unique: false });
                    }

                    // Create queue store
                    if (!db.objectStoreNames.contains(STORE_QUEUE)) {
                        const queueStore = db.createObjectStore(STORE_QUEUE, {
                            keyPath: ['connId', 'fileId']
                        });
                        // Indexes
                        queueStore.createIndex('connId', 'connId', { unique: false });
                        queueStore.createIndex('fileId', 'fileId', { unique: false });
                        queueStore.createIndex('order', 'order', { unique: false });
                    }
                };
            } catch (error) {
                reject(error);
            }
        });

        return this.initPromise;
    }

    /**
     * Ensure database is initialized
     * @returns {Promise<void>}
     */
    async ensureInit() {
        if (!this.initialized) {
            await this.init();
        }
    }

    // =========================================================================
    // CONNECTION OPERATIONS
    // =========================================================================

    /**
     * Save connection metadata
     * @param {Object} connection - Connection data
     * @returns {Promise<void>}
     */
    async saveConnection(connection) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CONNECTIONS, 'readwrite');
            const store = transaction.objectStore(STORE_CONNECTIONS);

            const request = store.put({
                connId: connection.connId,
                secret: connection.secret,
                state: connection.state,
                createdAt: Date.now(),
                lastActivityAt: Date.now(),
                peerInfo: connection.peerInfo || null
            });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Get connection by ID
     * @param {string} connId - Connection ID
     * @returns {Promise<Object|null>}
     */
    async getConnection(connId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CONNECTIONS, 'readonly');
            const store = transaction.objectStore(STORE_CONNECTIONS);

            const request = store.get(connId);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Update connection state
     * @param {string} connId - Connection ID
     * @param {string} state - New state
     * @returns {Promise<void>}
     */
    async updateConnectionState(connId, state) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CONNECTIONS, 'readwrite');
            const store = transaction.objectStore(STORE_CONNECTIONS);

            const getRequest = store.get(connId);

            getRequest.onsuccess = () => {
                const connection = getRequest.result;
                if (!connection) {
                    reject(new Error('Connection not found'));
                    return;
                }

                connection.state = state;
                connection.lastActivityAt = Date.now();

                const putRequest = store.put(connection);

                putRequest.onsuccess = () => resolve();
                putRequest.onerror = (event) => reject(event.target.error);
            };

            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Update connection last activity time
     * @param {string} connId - Connection ID
     * @returns {Promise<void>}
     */
    async updateConnectionActivity(connId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CONNECTIONS, 'readwrite');
            const store = transaction.objectStore(STORE_CONNECTIONS);

            const getRequest = store.get(connId);

            getRequest.onsuccess = () => {
                const connection = getRequest.result;
                if (!connection) {
                    reject(new Error('Connection not found'));
                    return;
                }

                connection.lastActivityAt = Date.now();

                const putRequest = store.put(connection);

                putRequest.onsuccess = () => resolve();
                putRequest.onerror = (event) => reject(event.target.error);
            };

            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Delete connection and all related data
     * @param {string} connId - Connection ID
     * @returns {Promise<void>}
     */
    async deleteConnection(connId) {
        await this.ensureInit();

        const transaction = this.db.transaction(
            [STORE_CONNECTIONS, STORE_FILES, STORE_CHUNKS, STORE_QUEUE],
            'readwrite'
        );

        // Delete connection
        const connStore = transaction.objectStore(STORE_CONNECTIONS);
        connStore.delete(connId);

        // Delete all files for this connection
        const filesStore = transaction.objectStore(STORE_FILES);
        const filesIndex = filesStore.index('connId');
        filesIndex.openCursor(IDBKeyRange.only(connId)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        // Delete all chunks for this connection
        const chunksStore = transaction.objectStore(STORE_CHUNKS);
        const chunksIndex = chunksStore.index('connId');
        chunksIndex.openCursor(IDBKeyRange.only(connId)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        // Delete all queue entries for this connection
        const queueStore = transaction.objectStore(STORE_QUEUE);
        const queueIndex = queueStore.index('connId');
        queueIndex.openCursor(IDBKeyRange.only(connId)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    // =========================================================================
    // FILE OPERATIONS
    // =========================================================================

    /**
     * Save file metadata
     * @param {Object} file - File data
     * @returns {Promise<void>}
     */
    async saveFile(file) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_FILES, 'readwrite');
            const store = transaction.objectStore(STORE_FILES);

            const request = store.put({
                connId: file.connId,
                fileId: file.fileId,
                name: file.name,
                size: file.size,
                mime: file.mime,
                state: file.state,
                direction: file.direction,
                createdAt: file.createdAt || Date.now(),
                completedAt: file.completedAt || null
            });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Get file by connection ID and file ID
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @returns {Promise<Object|null>}
     */
    async getFile(connId, fileId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_FILES, 'readonly');
            const store = transaction.objectStore(STORE_FILES);

            const request = store.get([connId, fileId]);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Get all files for a connection
     * @param {string} connId - Connection ID
     * @returns {Promise<Array>}
     */
    async getFilesByConnection(connId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_FILES, 'readonly');
            const store = transaction.objectStore(STORE_FILES);
            const index = store.index('connId');

            const files = [];
            const request = index.openCursor(IDBKeyRange.only(connId));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    files.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(files);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Update file state
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @param {string} state - New state
     * @returns {Promise<void>}
     */
    async updateFileState(connId, fileId, state) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_FILES, 'readwrite');
            const store = transaction.objectStore(STORE_FILES);

            const getRequest = store.get([connId, fileId]);

            getRequest.onsuccess = () => {
                const file = getRequest.result;
                if (!file) {
                    reject(new Error('File not found'));
                    return;
                }

                file.state = state;
                if (state === 'COMPLETED') {
                    file.completedAt = Date.now();
                }

                const putRequest = store.put(file);

                putRequest.onsuccess = () => resolve();
                putRequest.onerror = (event) => reject(event.target.error);
            };

            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Delete file
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @returns {Promise<void>}
     */
    async deleteFile(connId, fileId) {
        await this.ensureInit();

        const transaction = this.db.transaction(
            [STORE_FILES, STORE_CHUNKS, STORE_QUEUE],
            'readwrite'
        );

        // Delete file
        const fileStore = transaction.objectStore(STORE_FILES);
        fileStore.delete([connId, fileId]);

        // Delete all chunks for this file
        const chunksStore = transaction.objectStore(STORE_CHUNKS);
        const chunksIndex = chunksStore.index('connId_fileId');
        chunksIndex.openCursor(IDBKeyRange.only([connId, fileId])).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        // Delete queue entry for this file
        const queueStore = transaction.objectStore(STORE_QUEUE);
        queueStore.delete([connId, fileId]);

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    // =========================================================================
    // CHUNK OPERATIONS
    // =========================================================================

    /**
     * Save a chunk
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @param {number} index - Chunk index
     * @param {ArrayBuffer} data - Chunk data
     * @param {boolean} isLast - Whether this is the last chunk
     * @returns {Promise<void>}
     */
    async saveChunk(connId, fileId, index, data, isLast = false) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CHUNKS, 'readwrite');
            const store = transaction.objectStore(STORE_CHUNKS);

            const request = store.put({
                connId,
                fileId,
                index,
                data,
                isLast,
                receivedAt: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Get a chunk
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @param {number} index - Chunk index
     * @returns {Promise<Object|null>}
     */
    async getChunk(connId, fileId, index) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CHUNKS, 'readonly');
            const store = transaction.objectStore(STORE_CHUNKS);

            const request = store.get([connId, fileId, index]);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Get all chunks for a file
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @returns {Promise<Array>}
     */
    async getChunksForFile(connId, fileId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CHUNKS, 'readonly');
            const store = transaction.objectStore(STORE_CHUNKS);
            const index = store.index('connId_fileId');

            const chunks = [];
            const request = index.openCursor(IDBKeyRange.only([connId, fileId]));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    chunks.push(cursor.value);
                    cursor.continue();
                } else {
                    // Sort by index
                    chunks.sort((a, b) => a.index - b.index);
                    resolve(chunks);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Delete a chunk
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @param {number} index - Chunk index
     * @returns {Promise<void>}
     */
    async deleteChunk(connId, fileId, index) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_CHUNKS, 'readwrite');
            const store = transaction.objectStore(STORE_CHUNKS);

            const request = store.delete([connId, fileId, index]);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // =========================================================================
    // QUEUE OPERATIONS
    // =========================================================================

    /**
     * Add file to queue
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @param {number} order - Queue order
     * @returns {Promise<void>}
     */
    async addToQueue(connId, fileId, order) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_QUEUE, 'readwrite');
            const store = transaction.objectStore(STORE_QUEUE);

            const request = store.put({
                connId,
                fileId,
                order
            });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Get queue for a connection
     * @param {string} connId - Connection ID
     * @returns {Promise<Array>}
     */
    async getQueue(connId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_QUEUE, 'readonly');
            const store = transaction.objectStore(STORE_QUEUE);
            const index = store.index('connId');

            const queue = [];
            const request = index.openCursor(IDBKeyRange.only(connId));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    queue.push(cursor.value);
                    cursor.continue();
                } else {
                    // Sort by order
                    queue.sort((a, b) => a.order - b.order);
                    resolve(queue);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Remove from queue
     * @param {string} connId - Connection ID
     * @param {string} fileId - File ID
     * @returns {Promise<void>}
     */
    async removeFromQueue(connId, fileId) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_QUEUE, 'readwrite');
            const store = transaction.objectStore(STORE_QUEUE);

            const request = store.delete([connId, fileId]);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // =========================================================================
    // STORAGE UTILITIES
    // =========================================================================

    /**
     * Get storage usage estimate
     * @returns {Promise<Object>}
     */
    async getStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            return navigator.storage.estimate();
        }
        return { usage: 0, quota: 0, percentage: 0 };
    }

    /**
     * Clear all data for a connection
     * @param {string} connId - Connection ID
     * @returns {Promise<void>}
     */
    async clearConnectionData(connId) {
        await this.deleteConnection(connId);
    }

    /**
     * Clear all data (for testing/debugging)
     * @returns {Promise<void>}
     */
    async clearAll() {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(
                [STORE_CONNECTIONS, STORE_FILES, STORE_CHUNKS, STORE_QUEUE],
                'readwrite'
            );

            transaction.objectStore(STORE_CONNECTIONS).clear();
            transaction.objectStore(STORE_FILES).clear();
            transaction.objectStore(STORE_CHUNKS).clear();
            transaction.objectStore(STORE_QUEUE).clear();

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initialized = false;
        }
    }
}

// Singleton instance
export const storageManager = new StorageManager();
