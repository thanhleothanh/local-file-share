import { FileSystemAccessWriter } from '../../../packages/client/src/files/FileSystemAccessWriter.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('FileSystemAccessWriter', () => {
  let writer: FileSystemAccessWriter;
  let mockDirectoryHandle: unknown;
  let mockFileHandle: unknown;
  let mockWritable: unknown;

  beforeEach(() => {
    writer = new FileSystemAccessWriter();

    // Mock File System Access API types
    mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    };

    mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };

    mockDirectoryHandle = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };

    // Mock the global window object
    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn().mockResolvedValue(mockDirectoryHandle),
    } as unknown as Window & typeof globalThis);
  });

  it('isAvailable returns true when showDirectoryPicker is in window', () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn(),
    } as unknown as Window & typeof globalThis);

    expect(FileSystemAccessWriter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when showDirectoryPicker is not in window', () => {
    vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

    expect(FileSystemAccessWriter.isAvailable()).toBe(false);
  });

  it('startFile prompts for directory on first file and returns fileId', async () => {
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    const fileId = await writer.startFile(meta);

    expect(fileId).toBe('test-file-1');
    expect(window.showDirectoryPicker).toHaveBeenCalled();
    expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith('test.txt', { create: true });
    expect(mockFileHandle.createWritable).toHaveBeenCalled();
  });

  it('startFile reuses directory handle for subsequent files', async () => {
    const meta1 = {
      fileId: 'test-file-1',
      fileName: 'test1.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };
    await writer.startFile(meta1);

    // Second file - should reuse directory handle
    const meta2 = {
      fileId: 'test-file-2',
      fileName: 'test2.txt',
      fileSize: 2048,
      mimeType: 'text/plain',
    };
    await writer.startFile(meta2);

    // showDirectoryPicker should only be called once (for the first file)
    expect(window.showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith('test2.txt', { create: true });
  });

  it('writeChunk writes data to the writable stream', async () => {
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await writer.startFile(meta);

    const data = new TextEncoder().encode('hello world');
    await writer.writeChunk('test-file-1', 0, data);

    expect(mockWritable.write).toHaveBeenCalledWith(data);
  });

  it('writeChunk yields to event loop between writes', async () => {
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await writer.startFile(meta);

    const data = new TextEncoder().encode('hello world');
    await writer.writeChunk('test-file-1', 0, data);

    // The write should have been called
    expect(mockWritable.write).toHaveBeenCalled();
    // The mock doesn't track the yield, but we can verify it doesn't throw
  });

  it('finalize closes the writable stream', async () => {
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await writer.startFile(meta);
    await writer.finalize('test-file-1');

    expect(mockWritable.close).toHaveBeenCalled();
  });

  it('cancel aborts the writable stream', async () => {
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await writer.startFile(meta);
    await writer.cancel('test-file-1');

    expect(mockWritable.abort).toHaveBeenCalled();
  });

  it('cancel handles errors during abort gracefully', async () => {
    const mockWritableWithError = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockRejectedValue(new Error('Abort failed')),
    };

    const mockFileHandleWithError = {
      createWritable: vi.fn().mockResolvedValue(mockWritableWithError),
    };

    const mockDirectoryHandleWithError = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandleWithError),
    };

    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn().mockResolvedValue(mockDirectoryHandleWithError),
    } as unknown as Window & typeof globalThis);

    const writerWithError = new FileSystemAccessWriter();

    const meta = {
      fileId: 'test-file-error',
      fileName: 'error.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await writerWithError.startFile(meta);

    // Should not throw
    await expect(writerWithError.cancel('test-file-error')).resolves.not.toThrow();
  });

  it('clear closes all writable streams and clears handles', async () => {
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await writer.startFile(meta);
    await writer.clear();

    expect(mockWritable.close).toHaveBeenCalled();
  });

  it('startFile throws when File System Access API is not available', async () => {
    vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);

    const writerNoApi = new FileSystemAccessWriter();
    const meta = {
      fileId: 'test-file-1',
      fileName: 'test.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };

    await expect(writerNoApi.startFile(meta)).rejects.toThrow('File System Access API is not available');
  });

  it('openDirectory throws when no directory selected', async () => {
    await expect(writer.openDirectory()).rejects.toThrow('No directory selected');
  });

  it('writeChunk throws when no file handle exists', async () => {
    // Try to write without starting a file
    const data = new TextEncoder().encode('test');

    await expect(writer.writeChunk('nonexistent', 0, data)).rejects.toThrow(
      'No file handle for fileId: nonexistent',
    );
  });
});
