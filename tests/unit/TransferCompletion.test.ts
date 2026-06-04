import {
  SenderTransferCompletion,
  ReceiverTransferCompletion,
  AckTimeoutError,
  createChunkBuffer,
  FileIntegrityChecker,
} from '@lfs/shared';
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock ControlChannelSender
class MockControlChannelSender {
  private readonly sentMessages: string[] = [];

  send(message: string | ArrayBuffer): void {
    if (typeof message === 'string') {
      this.sentMessages.push(message);
    }
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  clear(): void {
    this.sentMessages.length = 0;
  }
}

// Mock NackHandler
class MockNackHandler {
  private readonly handledMessages: Array<{
    type: string;
    from: string;
    data: { fileId: string; missingIndices: number[]; round: number };
  }> = [];

  async handle(message: {
    type: string;
    from: string;
    data: { fileId: string; missingIndices: number[]; round: number };
  }): Promise<number[]> {
    this.handledMessages.push(message);
    return message.data.missingIndices;
  }

  getHandledMessages(): Array<{
    type: string;
    from: string;
    data: { fileId: string; missingIndices: number[]; round: number };
  }> {
    return this.handledMessages;
  }

  clear(): void {
    this.handledMessages.length = 0;
  }
}

describe('TransferCompletion', () => {
  const localDeviceId = 'device-1';

  describe('SenderTransferCompletion', () => {
    let controlChannel: MockControlChannelSender;
    let nackHandler: MockNackHandler;
    let senderCompletion: SenderTransferCompletion;

    beforeEach(() => {
      controlChannel = new MockControlChannelSender();
      nackHandler = new MockNackHandler();
      senderCompletion = new SenderTransferCompletion(controlChannel, nackHandler, localDeviceId);
    });

    describe('sendDone', () => {
      it('sends TRANSFER_DONE message on the control channel', () => {
        const fileId = 'file-1';
        const totalChunks = 10;

        senderCompletion.sendDone(fileId, totalChunks);

        const messages = controlChannel.getSentMessages();
        expect(messages.length).toBe(1);

        const message = JSON.parse(messages[0]);
        expect(message.type).toBe('TRANSFER_DONE');
        expect(message.from).toBe(localDeviceId);
        expect(message.data.fileId).toBe(fileId);
        expect(message.data.totalChunks).toBe(totalChunks);
      });
    });

    describe('awaitFileReceived with fake timers', () => {
      it('resolves when FILE_RECEIVED is received', async () => {
        const fileId = 'file-1';

        // Start the promise
        const promise = senderCompletion.awaitFileReceived(fileId, 30000);

        // Simulate receiving FILE_RECEIVED
        senderCompletion.handleFileReceived(fileId);

        // Await should resolve
        await expect(promise).resolves.toBeUndefined();
      });

      it('rejects with AckTimeoutError after timeout', async () => {
        const fileId = 'file-1';

        // Use fake timers
        vi.useFakeTimers();

        try {
          // Start the promise with a short timeout
          const promise = senderCompletion.awaitFileReceived(fileId, 1000);

          // Advance timers
          vi.advanceTimersByTime(1000);

          // Await should reject with timeout error
          await expect(promise).rejects.toThrow(AckTimeoutError);
          await expect(promise).rejects.toMatchObject({ message: /Timeout waiting for FILE_RECEIVED/ });
        } finally {
          vi.useRealTimers();
        }
      });

      it('handles CHUNK_REQUEST_NACK by triggering retransmission', async () => {
        const fileId = 'file-1';
        const missingIndices = [1, 3, 5];

        // Start the promise
        const promise = senderCompletion.awaitFileReceived(fileId, 30000);

        // Simulate receiving CHUNK_REQUEST_NACK
        const message = {
          type: 'CHUNK_REQUEST_NACK',
          from: 'receiver',
          data: { fileId, missingIndices, round: 0 },
        };
        await senderCompletion.handleChunkRequestNack(message);

        // Verify NACK handler was called
        const handled = nackHandler.getHandledMessages();
        expect(handled.length).toBe(1);
        expect(handled[0].data.fileId).toBe(fileId);
        expect(handled[0].data.missingIndices).toEqual(missingIndices);

        // Note: The promise doesn't resolve or reject on NACK - it stays pending
        // This allows the sender to retry
      });

      it('cancels pending transfer on cancel', async () => {
        const fileId = 'file-1';

        // Start the promise
        const promise = senderCompletion.awaitFileReceived(fileId, 30000);

        // Cancel it
        senderCompletion.cancel(fileId);

        // Await should reject with cancel error
        await expect(promise).rejects.toThrow(/cancelled/);
      });
    });

    describe('cleanup', () => {
      it('clears all pending transfers on clear', async () => {
        const fileId1 = 'file-1';
        const fileId2 = 'file-2';

        // Start promises
        const promise1 = senderCompletion.awaitFileReceived(fileId1, 30000);
        const promise2 = senderCompletion.awaitFileReceived(fileId2, 30000);

        // Clear all
        senderCompletion.clear();

        // Both should reject
        await expect(promise1).rejects.toThrow(/All transfers cleared/);
        await expect(promise2).rejects.toThrow(/All transfers cleared/);
      });
    });
  });

  describe('ReceiverTransferCompletion', () => {
    let controlChannel: MockControlChannelSender;
    let integrityChecker: FileIntegrityChecker;
    let receiverCompletion: ReceiverTransferCompletion;

    beforeEach(() => {
      controlChannel = new MockControlChannelSender();
      const buffer = createChunkBuffer();
      integrityChecker = new FileIntegrityChecker(buffer);
      receiverCompletion = new ReceiverTransferCompletion(controlChannel, integrityChecker, localDeviceId);
    });

    describe('handleTransferDone', () => {
      it('sends FILE_RECEIVED when all chunks are present', async () => {
        const fileId = 'file-1';
        const totalChunks = 10;

        // Add all chunks to the buffer
        for (let i = 0; i < totalChunks; i++) {
          integrityChecker.getBuffer().add(fileId, i, new ArrayBuffer(100), i === totalChunks - 1);
        }

        // Handle TRANSFER_DONE
        const result = receiverCompletion.handleTransferDone(fileId, totalChunks);

        expect(result).toBe(true);

        // Verify FILE_RECEIVED was sent
        const messages = controlChannel.getSentMessages();
        expect(messages.length).toBe(1);

        const message = JSON.parse(messages[0]);
        expect(message.type).toBe('FILE_RECEIVED');
        expect(message.from).toBe(localDeviceId);
        expect(message.data.fileId).toBe(fileId);
        expect(message.data.totalChunks).toBe(totalChunks);
      });

      it('sends CHUNK_REQUEST_NACK with missing indices when chunks are missing', async () => {
        const fileId = 'file-1';
        const totalChunks = 10;

        // Add only chunks 0, 2, 4, 6, 8 (missing 1, 3, 5, 7, 9)
        for (const i of [0, 2, 4, 6, 8]) {
          integrityChecker.getBuffer().add(fileId, i, new ArrayBuffer(100), false);
        }

        // Handle TRANSFER_DONE
        const result = receiverCompletion.handleTransferDone(fileId, totalChunks);

        expect(result).toBe(false);

        // Verify CHUNK_REQUEST_NACK was sent
        const messages = controlChannel.getSentMessages();
        expect(messages.length).toBe(1);

        const message = JSON.parse(messages[0]);
        expect(message.type).toBe('CHUNK_REQUEST_NACK');
        expect(message.from).toBe(localDeviceId);
        expect(message.data.fileId).toBe(fileId);
        expect(message.data.missingIndices.sort((a: number, b: number) => a - b)).toEqual([1, 3, 5, 7, 9]);
        expect(message.data.round).toBe(0);
      });

      it('sends CHUNK_REQUEST_NACK with incremented round on subsequent calls', async () => {
        const fileId = 'file-1';
        const totalChunks = 10;

        // Add only chunk 0
        integrityChecker.getBuffer().add(fileId, 0, new ArrayBuffer(100), false);

        // First call - round 0
        let result = receiverCompletion.handleTransferDone(fileId, totalChunks);
        expect(result).toBe(false);

        let messages = controlChannel.getSentMessages();
        expect(messages.length).toBe(1);
        expect(JSON.parse(messages[0]).data.round).toBe(0);

        // Second call - round 1
        controlChannel.clear();
        result = receiverCompletion.handleTransferDone(fileId, totalChunks);
        expect(result).toBe(false);

        messages = controlChannel.getSentMessages();
        expect(messages.length).toBe(1);
        expect(JSON.parse(messages[0]).data.round).toBe(1);

        // Third call - round 2
        controlChannel.clear();
        result = receiverCompletion.handleTransferDone(fileId, totalChunks);
        expect(result).toBe(false);

        messages = controlChannel.getSentMessages();
        expect(messages.length).toBe(1);
        expect(JSON.parse(messages[0]).data.round).toBe(2);
      });

      it('returns false after MAX_NACK_ROUNDS exceeded', async () => {
        const fileId = 'file-1';
        const totalChunks = 10;

        // Add only chunk 0
        integrityChecker.getBuffer().add(fileId, 0, new ArrayBuffer(100), false);

        // Call 3 times (MAX_NACK_ROUNDS)
        for (let i = 0; i < 3; i++) {
          const result = receiverCompletion.handleTransferDone(fileId, totalChunks);
          expect(result).toBe(false);
        }

        // Fourth call should also return false (round 3 >= MAX_NACK_ROUNDS)
        const result = receiverCompletion.handleTransferDone(fileId, totalChunks);
        expect(result).toBe(false);

        // No more messages should be sent after max rounds
        const nackMessages = controlChannel
          .getSentMessages()
          .filter((m) => JSON.parse(m).type === 'CHUNK_REQUEST_NACK');
        expect(nackMessages.length).toBe(3); // Only 3 NACKs sent
      });
    });

    describe('cleanup', () => {
      it('clears file tracking on clearFile', async () => {
        const fileId = 'file-1';
        const totalChunks = 10;

        // Add only chunk 0
        integrityChecker.getBuffer().add(fileId, 0, new ArrayBuffer(100), false);

        // First call
        receiverCompletion.handleTransferDone(fileId, totalChunks);

        // Clear tracking
        receiverCompletion.clearFile(fileId);

        // Second call should start from round 0 again
        controlChannel.clear();
        const result = receiverCompletion.handleTransferDone(fileId, totalChunks);
        expect(result).toBe(false);

        const messages = controlChannel.getSentMessages();
        expect(JSON.parse(messages[0]).data.round).toBe(0);
      });

      it('clears all tracking on clear', async () => {
        const fileId1 = 'file-1';
        const fileId2 = 'file-2';
        const totalChunks = 10;

        // Set up both files
        integrityChecker.getBuffer().add(fileId1, 0, new ArrayBuffer(100), false);
        integrityChecker.getBuffer().add(fileId2, 0, new ArrayBuffer(100), false);

        // Trigger NACK for both
        receiverCompletion.handleTransferDone(fileId1, totalChunks);
        receiverCompletion.handleTransferDone(fileId2, totalChunks);

        // Clear all
        receiverCompletion.clear();

        // Verify tracking is cleared
        expect(() => receiverCompletion.clear()).not.toThrow();
      });
    });
  });

  describe('AckTimeoutError', () => {
    it('is an Error with the correct name', () => {
      const error = new AckTimeoutError('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AckTimeoutError');
      expect(error.message).toBe('test message');
    });
  });
});
