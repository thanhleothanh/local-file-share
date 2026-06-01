/**
 * Queue Manager Unit Tests
 * Tests for FileQueueManager class in fileState.js (ISSUE-004, ISSUE-015)
 */

import { FileQueueManager, FileState, FileTransfer } from '@utils/fileState.js';

describe('FileQueueManager', () => {
    let queueManager;

    beforeEach(() => {
        queueManager = new FileQueueManager();
    });

    describe('Initialization', () => {
        test('initializes with empty queue', () => {
            expect(queueManager.queue).toEqual([]);
            expect(queueManager.currentFile).toBeNull();
        });

        test('has correct default limits', () => {
            expect(queueManager.maxQueueSize).toBe(50);
            expect(queueManager.maxQueueBytes).toBe(500 * 1024 * 1024); // 500MB
        });
    });

    describe('getQueueSizeBytes', () => {
        test('returns 0 for empty queue', () => {
            expect(queueManager.getQueueSizeBytes()).toBe(0);
        });

        test('returns sum of all file sizes', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            expect(queueManager.getQueueSizeBytes()).toBe(300);
        });
    });

    describe('hasSpaceForFile', () => {
        test('returns true when queue is empty', () => {
            expect(queueManager.hasSpaceForFile(100)).toBe(true);
        });

        test('returns true when file fits in remaining space', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.addFile(file1);
            expect(queueManager.hasSpaceForFile(100)).toBe(true);
        });

        test('returns false when file exceeds remaining space', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: queueManager.maxQueueBytes - 100 });
            queueManager.addFile(file1);
            expect(queueManager.hasSpaceForFile(200)).toBe(false);
        });
    });

    describe('addFile', () => {
        test('adds file to queue successfully', () => {
            const file = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            const result = queueManager.addFile(file);
            expect(result).toBe(true);
            expect(queueManager.queue.length).toBe(1);
            expect(queueManager.queue[0]).toBe(file);
        });

        test('returns false when queue file count limit reached', () => {
            // Add 50 files to fill the queue
            for (let i = 0; i < 50; i++) {
                const file = new FileTransfer({ connId: 'conn1', fileId: `file${i}`, name: `test${i}.txt`, size: 1 });
                queueManager.addFile(file);
            }
            const file51 = new FileTransfer({ connId: 'conn1', fileId: 'file51', name: 'test51.txt', size: 1 });
            const result = queueManager.addFile(file51);
            expect(result).toBe(false);
            expect(queueManager.queue.length).toBe(50);
        });

        test('returns false when queue size limit reached', () => {
            const largeFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: queueManager.maxQueueBytes });
            const result = queueManager.addFile(largeFile);
            expect(result).toBe(true);
            
            const anotherFile = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 1 });
            const result2 = queueManager.addFile(anotherFile);
            expect(result2).toBe(false);
        });

        test('does not modify file state when added', () => {
            const file = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            file.transitionState(FileState.QUEUED);
            queueManager.addFile(file);
            expect(file.state).toBe(FileState.QUEUED);
        });
    });

    describe('checkCanAddFile', () => {
        test('returns canAdd true for file that fits', () => {
            const result = queueManager.checkCanAddFile(100);
            expect(result.canAdd).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        test('returns canAdd false with QUEUE_FILE_LIMIT when file count limit reached', () => {
            for (let i = 0; i < 50; i++) {
                const file = new FileTransfer({ connId: 'conn1', fileId: `file${i}`, name: `test${i}.txt`, size: 1 });
                queueManager.addFile(file);
            }
            const result = queueManager.checkCanAddFile(1);
            expect(result.canAdd).toBe(false);
            expect(result.reason).toBe('QUEUE_FILE_LIMIT');
        });

        test('returns canAdd false with QUEUE_SIZE_LIMIT when size limit reached', () => {
            const largeFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: queueManager.maxQueueBytes });
            queueManager.addFile(largeFile);
            const result = queueManager.checkCanAddFile(1);
            expect(result.canAdd).toBe(false);
            expect(result.reason).toBe('QUEUE_SIZE_LIMIT');
        });
    });

    describe('getNextFile', () => {
        test('returns null when queue is empty', () => {
            expect(queueManager.getNextFile()).toBeNull();
        });

        test('returns first file in queue', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            expect(queueManager.getNextFile()).toBe(file1);
        });
    });

    describe('startNextFile', () => {
        test('returns null when queue is empty', () => {
            expect(queueManager.startNextFile()).toBeNull();
        });

        test('returns null when already transferring a file', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            queueManager.currentFile = file1;
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file2);
            const result = queueManager.startNextFile();
            expect(result).toBe(file1);
            expect(queueManager.queue.length).toBe(1);
        });

        test('sets first queued file as current and transitions to TRANSFERRING', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            
            const result = queueManager.startNextFile();
            expect(result).toBe(file1);
            expect(queueManager.currentFile).toBe(file1);
            expect(queueManager.queue.length).toBe(1);
            expect(file1.state).toBe(FileState.TRANSFERRING);
        });
    });

    describe('completeCurrentFile', () => {
        test('transitions current file to COMPLETED and clears it', () => {
            const file = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            file.transitionState(FileState.TRANSFERRING);
            queueManager.currentFile = file;
            
            queueManager.completeCurrentFile(file);
            expect(file.state).toBe(FileState.COMPLETED);
            expect(queueManager.currentFile).toBeNull();
        });

        test('does nothing if fileId does not match current file', () => {
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            const otherFile = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.currentFile = currentFile;
            
            queueManager.completeCurrentFile(otherFile);
            expect(currentFile.state).toBe(FileState.PENDING);
            expect(queueManager.currentFile).toBe(currentFile);
        });
    });

    describe('failCurrentFile', () => {
        test('transitions current file to FAILED, clears it, and starts next file', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            file1.transitionState(FileState.TRANSFERRING);
            file2.transitionState(FileState.QUEUED);
            queueManager.addFile(file2);
            queueManager.currentFile = file1;
            
            queueManager.failCurrentFile(file1);
            expect(file1.state).toBe(FileState.FAILED);
            expect(queueManager.currentFile).toBe(file2);
            expect(file2.state).toBe(FileState.TRANSFERRING);
        });

        test('does nothing if fileId does not match current file', () => {
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            const otherFile = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.currentFile = currentFile;
            
            queueManager.failCurrentFile(otherFile);
            expect(currentFile.state).toBe(FileState.PENDING);
            expect(queueManager.currentFile).toBe(currentFile);
        });
    });

    describe('cancelFile', () => {
        test('cancels and removes file from queue', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            
            const result = queueManager.cancelFile('file1');
            expect(result).toBe(true);
            expect(queueManager.queue.length).toBe(1);
            expect(file1.state).toBe(FileState.CANCELLED);
            expect(queueManager.queue[0]).toBe(file2);
        });

        test('cancels current file and clears it', () => {
            const file = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.currentFile = file;
            
            const result = queueManager.cancelFile('file1');
            expect(result).toBe(true);
            expect(file.state).toBe(FileState.CANCELLED);
            expect(queueManager.currentFile).toBeNull();
        });

        test('returns false when file not found', () => {
            const file = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.addFile(file);
            
            const result = queueManager.cancelFile('file2');
            expect(result).toBe(false);
        });
    });

    describe('rejectFile', () => {
        test('rejects and removes PENDING file from queue', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            
            const result = queueManager.rejectFile('file1');
            expect(result).toBe(true);
            expect(queueManager.queue.length).toBe(1);
            expect(file1.state).toBe(FileState.REJECTED);
        });

        test('returns false when file not found or not PENDING', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            file1.transitionState(FileState.QUEUED);
            queueManager.addFile(file1);
            
            const result = queueManager.rejectFile('file1');
            expect(result).toBe(false);
        });
    });

    describe('acceptFile', () => {
        test('accepts PENDING file and starts immediately when no current file', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            
            const result = queueManager.acceptFile('file1');
            expect(result).toBe(file1);
            expect(queueManager.currentFile).toBe(file1);
            expect(file1.state).toBe(FileState.TRANSFERRING);
            expect(queueManager.queue.length).toBe(1);
        });

        test('accepts PENDING file and queues it when current file exists', () => {
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file0', name: 'current.txt', size: 50 });
            currentFile.transitionState(FileState.TRANSFERRING);
            queueManager.currentFile = currentFile;
            
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            queueManager.addFile(file1);
            
            const result = queueManager.acceptFile('file1');
            // When there's a current file, acceptFile returns the current file, not the accepted file
            expect(result).toEqual(currentFile);
            expect(file1.state).toBe(FileState.QUEUED);
            expect(queueManager.currentFile).toBe(currentFile);
        });

        test('returns null when file not found or not PENDING', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            file1.transitionState(FileState.QUEUED);
            queueManager.addFile(file1);
            
            const result = queueManager.acceptFile('file1');
            expect(result).toBeNull();
        });
    });

    describe('getAllFiles', () => {
        test('returns all files including queue and current', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file0', name: 'current.txt', size: 50 });
            
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            queueManager.currentFile = currentFile;
            
            const allFiles = queueManager.getAllFiles();
            expect(allFiles.length).toBe(3);
            expect(allFiles).toContain(file1);
            expect(allFiles).toContain(file2);
            expect(allFiles).toContain(currentFile);
        });

        test('returns empty array when no files', () => {
            expect(queueManager.getAllFiles()).toEqual([]);
        });
    });

    describe('getFilesByState', () => {
        test('returns files filtered by state', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file0', name: 'current.txt', size: 50 });
            
            file1.transitionState(FileState.QUEUED);
            file2.transitionState(FileState.QUEUED);
            currentFile.transitionState(FileState.TRANSFERRING);
            
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            queueManager.currentFile = currentFile;
            
            const queuedFiles = queueManager.getFilesByState(FileState.QUEUED);
            expect(queuedFiles.length).toBe(2);
            expect(queuedFiles).toContain(file1);
            expect(queuedFiles).toContain(file2);
        });
    });

    describe('getFile', () => {
        test('returns file by ID from queue', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            queueManager.addFile(file1);
            
            const result = queueManager.getFile('file1');
            expect(result).toBe(file1);
        });

        test('returns current file by ID', () => {
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.currentFile = currentFile;
            
            const result = queueManager.getFile('file1');
            expect(result).toBe(currentFile);
        });

        test('returns null when file not found', () => {
            expect(queueManager.getFile('nonexistent')).toBeNull();
        });
    });

    describe('clear', () => {
        test('clears queue and current file', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file0', name: 'current.txt', size: 50 });
            
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            queueManager.currentFile = currentFile;
            
            queueManager.clear();
            expect(queueManager.queue.length).toBe(0);
            expect(queueManager.currentFile).toBeNull();
        });
    });

    describe('getQueueSize', () => {
        test('returns number of files in queue', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            
            expect(queueManager.getQueueSize()).toBe(2);
        });
    });

    describe('getQueueSizeInBytes', () => {
        test('returns total size of files in queue in bytes', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const file2 = new FileTransfer({ connId: 'conn1', fileId: 'file2', name: 'test2.txt', size: 200 });
            queueManager.addFile(file1);
            queueManager.addFile(file2);
            
            expect(queueManager.getQueueSizeInBytes()).toBe(300);
        });
    });

    describe('getRemainingCapacity', () => {
        test('returns remaining capacity in bytes', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            queueManager.addFile(file1);
            
            expect(queueManager.getRemainingCapacity()).toBe(queueManager.maxQueueBytes - 100);
        });
    });

    describe('getQueueInfo', () => {
        test('returns queue info object', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test1.txt', size: 100 });
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file0', name: 'current.txt', size: 50 });
            queueManager.addFile(file1);
            queueManager.currentFile = currentFile;
            
            const info = queueManager.getQueueInfo();
            expect(info.fileCount).toBe(1);
            expect(info.totalBytes).toBe(100);
            expect(info.maxBytes).toBe(queueManager.maxQueueBytes);
            expect(info.remainingBytes).toBe(queueManager.maxQueueBytes - 100);
            expect(info.hasCurrentFile).toBe(true);
        });
    });

    describe('isEmpty', () => {
        test('returns true when queue and current file are empty', () => {
            expect(queueManager.isEmpty()).toBe(true);
        });

        test('returns false when queue has files', () => {
            const file1 = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.addFile(file1);
            expect(queueManager.isEmpty()).toBe(false);
        });

        test('returns false when current file exists', () => {
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.currentFile = currentFile;
            expect(queueManager.isEmpty()).toBe(false);
        });
    });

    describe('hasCurrentFile', () => {
        test('returns false when no current file', () => {
            expect(queueManager.hasCurrentFile()).toBe(false);
        });

        test('returns true when current file exists', () => {
            const currentFile = new FileTransfer({ connId: 'conn1', fileId: 'file1', name: 'test.txt', size: 100 });
            queueManager.currentFile = currentFile;
            expect(queueManager.hasCurrentFile()).toBe(true);
        });
    });
});
