import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../packages/client/src/ui/file-row';
import type { FileEntry } from '../../../packages/client/src/files/FileStateMachine.js';

interface FileRowEl extends HTMLElement {
  entry: FileEntry | null;
  direction: 'sent' | 'received';
  hasTransferring: boolean;
  progress: number | null;
  updateComplete: Promise<unknown>;
}

describe('file-row', () => {
  let el: FileRowEl;
  const createEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
    fileId: 'test-file',
    fileName: 'test.txt',
    fileSize: 1024,
    state: 'PENDING',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    el = document.createElement('file-row') as FileRowEl;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(el);
  });

  it('renders filename and size', async () => {
    el.entry = createEntry();
    await el.updateComplete;
    const filename = el.shadowRoot?.querySelector('[data-testid="filename"]')?.textContent;
    const size = el.shadowRoot?.querySelector('[data-testid="size"]')?.textContent;
    expect(filename).toBe('test.txt');
    expect(size).toBe('1 KB');
  });

  it('shows sent direction', async () => {
    el.entry = createEntry();
    el.direction = 'sent';
    await el.updateComplete;
    const direction = el.shadowRoot?.querySelector('[data-testid="direction"]')?.textContent?.trim();
    expect(direction).toBe('↑');
  });

  it('shows received direction', async () => {
    el.entry = createEntry();
    el.direction = 'received';
    await el.updateComplete;
    const direction = el.shadowRoot?.querySelector('[data-testid="direction"]')?.textContent?.trim();
    expect(direction).toBe('↓');
  });

  it('shows Accept and Reject buttons for PENDING receiver', async () => {
    el.entry = createEntry({ state: 'PENDING' });
    el.direction = 'received';
    await el.updateComplete;
    const acceptBtn = el.shadowRoot?.querySelector('[data-testid="accept-btn"]');
    const rejectBtn = el.shadowRoot?.querySelector('[data-testid="reject-btn"]');
    expect(acceptBtn).toBeTruthy();
    expect(rejectBtn).toBeTruthy();
  });

  it('shows Cancel button for PENDING sender', async () => {
    el.entry = createEntry({ state: 'PENDING' });
    el.direction = 'sent';
    await el.updateComplete;
    const cancelBtn = el.shadowRoot?.querySelector('[data-testid="cancel-btn"]');
    expect(cancelBtn).toBeTruthy();
  });

  it('disables Accept when hasTransferring is true', async () => {
    el.entry = createEntry({ state: 'PENDING' });
    el.direction = 'received';
    el.hasTransferring = true;
    await el.updateComplete;
    const acceptBtn = el.shadowRoot?.querySelector('[data-testid="accept-btn"]') as HTMLButtonElement;
    expect(acceptBtn?.disabled).toBe(true);
  });

  it('shows Queued status', async () => {
    el.entry = createEntry({ state: 'QUEUED' });
    await el.updateComplete;
    const status = el.shadowRoot?.querySelector('.status-text')?.textContent;
    expect(status).toBe('Queued');
  });

  it('shows checkmark for COMPLETED', async () => {
    el.entry = createEntry({ state: 'COMPLETED' });
    await el.updateComplete;
    const checkmark = el.shadowRoot?.querySelector('[data-testid="checkmark"]')?.textContent;
    expect(checkmark).toBe('✓');
  });

  it('shows progress bar for TRANSFERRING with progress', async () => {
    el.entry = createEntry({ state: 'TRANSFERRING' });
    el.progress = 50;
    await el.updateComplete;
    const progressFill = el.shadowRoot?.querySelector('[data-testid="progress-fill"]');
    expect(progressFill?.getAttribute('style')).toBe('width: 50%');
  });

  it('shows dismiss button for REJECTED', async () => {
    el.entry = createEntry({ state: 'REJECTED' });
    await el.updateComplete;
    const dismissBtn = el.shadowRoot?.querySelector('[data-testid="dismiss-btn"]');
    expect(dismissBtn).toBeTruthy();
  });
});
