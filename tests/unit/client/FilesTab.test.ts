import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../packages/client/src/ui/files-tab';
import type { FileEntry } from '../../../packages/client/src/files/FileStateMachine.js';
import { FileRegistry } from '../../../packages/client/src/files/index.js';

class MockViewModel {
  private fileRegistry: FileRegistry = new FileRegistry();
  private sentFileIds: Set<string> = new Set();
  private fileProgressMap: Map<string, { bytesTransferred: number; totalBytes: number; isSender: boolean }> =
    new Map();

  getFileRegistry(): FileRegistry {
    return this.fileRegistry;
  }

  isSentFile(fileId: string): boolean {
    return this.sentFileIds.has(fileId);
  }

  getFileProgressMap(): Map<string, { bytesTransferred: number; totalBytes: number; isSender: boolean }> {
    return new Map(this.fileProgressMap);
  }

  markAsSent(fileId: string): void {
    this.sentFileIds.add(fileId);
  }

  updateProgress(fileId: string, bytes: number, total: number, isSender: boolean): void {
    this.fileProgressMap.set(fileId, { bytesTransferred: bytes, totalBytes: total, isSender });
  }
}

interface FilesTabEl extends HTMLElement {
  viewModel: MockViewModel | null;
  connected: boolean;
  updateComplete: Promise<unknown>;
}

describe('files-tab', () => {
  let el: FilesTabEl;
  const createEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
    fileId: `file-${Math.random().toString(36).slice(2)}`,
    fileName: 'test.txt',
    fileSize: 1024,
    state: 'PENDING',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    el = document.createElement('files-tab') as FilesTabEl;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(el);
  });

  it('shows not connected empty state', async () => {
    el.viewModel = new MockViewModel();
    el.connected = false;
    await el.updateComplete;
    const emptyState = el.shadowRoot?.querySelector('[data-testid="empty-state"]')?.textContent?.trim();
    expect(emptyState).toBe('Connect a device to start sharing files');
  });

  it('shows connected empty state', async () => {
    el.viewModel = new MockViewModel();
    el.connected = true;
    await el.updateComplete;
    const emptyState = el.shadowRoot?.querySelector('[data-testid="empty-state"]')?.textContent?.trim();
    expect(emptyState).toBe('Tap + to send your first file');
  });

  it('hides Send File button when not connected', async () => {
    el.viewModel = new MockViewModel();
    el.connected = false;
    await el.updateComplete;
    const sendBtn = el.shadowRoot?.querySelector('[data-testid="send-file-btn"]');
    expect(sendBtn).toBeFalsy();
  });

  it('shows Send File button when connected', async () => {
    el.viewModel = new MockViewModel();
    el.connected = true;
    await el.updateComplete;
    const sendBtn = el.shadowRoot?.querySelector('[data-testid="send-file-btn"]');
    expect(sendBtn).toBeTruthy();
  });

  it('renders file rows for each file', async () => {
    const vm = new MockViewModel();
    vm.getFileRegistry().add(createEntry({ fileName: 'file1.txt' }));
    vm.getFileRegistry().add(createEntry({ fileName: 'file2.txt' }));
    el.viewModel = vm;
    el.connected = true;
    await el.updateComplete;
    const fileRows = el.shadowRoot?.querySelectorAll('file-row');
    expect(fileRows?.length).toBe(2);
  });

  it('shows files sorted newest first', async () => {
    const vm = new MockViewModel();
    const older = createEntry({ fileName: 'older.txt', createdAt: Date.now() - 1000 });
    const newer = createEntry({ fileName: 'newer.txt', createdAt: Date.now() });
    vm.getFileRegistry().add(older);
    vm.getFileRegistry().add(newer);
    el.viewModel = vm;
    el.connected = true;
    await el.updateComplete;
    const fileRows = el.shadowRoot?.querySelectorAll('file-row');
    expect(fileRows?.length).toBe(2);
    const firstFilename = fileRows?.[0]?.shadowRoot?.querySelector('.filename')?.textContent?.trim();
    expect(firstFilename).toBe('newer.txt');
  });

  it('passes sent direction to file-row', async () => {
    const vm = new MockViewModel();
    const file = createEntry();
    vm.getFileRegistry().add(file);
    vm.markAsSent(file.fileId);
    el.viewModel = vm;
    el.connected = true;
    await el.updateComplete;
    const fileRow = el.shadowRoot?.querySelector('file-row') as HTMLElement;
    const direction = fileRow?.shadowRoot?.querySelector('[data-testid="direction"]')?.textContent?.trim();
    expect(direction).toBe('↑');
  });

  it('passes progress to file-row', async () => {
    const vm = new MockViewModel();
    const file = createEntry({ state: 'TRANSFERRING' });
    vm.getFileRegistry().add(file);
    vm.updateProgress(file.fileId, 512, 1024, true);
    el.viewModel = vm;
    el.connected = true;
    await el.updateComplete;
    const fileRow = el.shadowRoot?.querySelector('file-row') as HTMLElement;
    const progressFill = fileRow?.shadowRoot?.querySelector('[data-testid="progress-fill"]');
    expect(progressFill?.getAttribute('style')).toBe('width: 50%');
  });
});
