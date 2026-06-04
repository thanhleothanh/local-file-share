import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ConnectionViewModel } from './ConnectionViewModel.js';
import type { FileEntry } from '../files/FileStateMachine.js';
import './file-row.js';

@customElement('files-tab')
export class FilesTab extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #e6e8ee;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .send-btn {
      background: #5b9cff;
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      display: none;
    }
    .send-btn:hover {
      background: #4a89e2;
    }
    .send-btn.visible {
      display: inline-block;
    }
    .disconnect-btn {
      background: #ef4444;
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      display: none;
    }
    .disconnect-btn:hover {
      background: #dc3545;
    }
    .disconnect-btn.visible {
      display: inline-block;
    }
    input[type='file'] {
      display: none;
    }
    .list {
      max-height: 400px;
      overflow-y: auto;
    }
    .empty {
      text-align: center;
      padding: 3rem 1rem;
      color: rgba(230, 232, 238, 0.4);
    }
    .empty-icon {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }
    /* Scrollbar styling */
    .list::-webkit-scrollbar {
      width: 6px;
    }
    .list::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.04);
      border-radius: 3px;
    }
    .list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }
    .list::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  `;

  @property({ attribute: false })
  viewModel: ConnectionViewModel | null = null;

  @property({ type: Boolean })
  connected: boolean = false;

  @state()
  private files: FileEntry[] = [];

  @state()
  private hasTransferring: boolean = false;

  private getProgressForFile(fileId: string): number | null {
    if (!this.viewModel) return null;
    
    const progressMap = this.viewModel.getFileProgressMap();
    const progress = progressMap.get(fileId);
    
    if (!progress) return null;
    
    // Calculate percentage
    if (progress.totalBytes > 0) {
      return Math.round((progress.bytesTransferred / progress.totalBytes) * 100);
    }
    return 0;
  }

  private getDirection(entry: FileEntry): 'sent' | 'received' {
    // Use the view model to determine if we sent this file
    if (this.viewModel) {
      return this.viewModel.isSentFile(entry.fileId) ? 'sent' : 'received';
    }
    return 'received';
  }

  private onSendClick(): void {
    const input = this.renderRoot?.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (input) {
      input.multiple = true;
      input.click();
    }
  }

  private onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      if (this.viewModel) {
        void this.viewModel.sendFiles(files);
      }
      input.value = '';
    }
  }

  private onFileAccept(event: CustomEvent<{ fileId: string }>): void {
    if (this.viewModel && event.detail?.fileId) {
      void this.viewModel.acceptFile(event.detail.fileId);
    }
  }

  private onFileReject(event: CustomEvent<{ fileId: string }>): void {
    if (this.viewModel && event.detail?.fileId) {
      void this.viewModel.rejectFile(event.detail.fileId);
    }
  }

  private onFileCancel(event: CustomEvent<{ fileId: string }>): void {
    if (this.viewModel && event.detail?.fileId) {
      void this.viewModel.cancelFile(event.detail.fileId);
    }
  }

  private onFileDismiss(event: CustomEvent<{ fileId: string }>): void {
    if (this.viewModel && event.detail?.fileId) {
      this.viewModel.dismissFile(event.detail.fileId);
    }
  }

  private renderFileRow(entry: FileEntry): unknown {
    const direction = this.getDirection(entry);
    const progress = this.getProgressForFile(entry.fileId);

    return html`
      <file-row
        .entry=${entry}
        .direction=${direction}
        .hasTransferring=${this.hasTransferring}
        .progress=${progress}
        @file-accept=${this.onFileAccept}
        @file-reject=${this.onFileReject}
        @file-cancel=${this.onFileCancel}
        @file-dismiss=${this.onFileDismiss}
      ></file-row>
    `;
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);

    // Update files and hasTransferring from view model if available
    if (this.viewModel) {
      const registry = this.viewModel.getFileRegistry();
      if (registry) {
        this.files = registry.getAll();
        this.hasTransferring = registry.getTransferringFiles().length > 0;
      }
    }
  }

  private onDisconnectClick(): void {
    if (this.viewModel) {
      void this.viewModel.disconnect();
    }
  }

  override render() {
    const showSendButton = this.connected;
    const showDisconnectButton = this.connected;

    return html`
      <div class="header">
        <h2 class="title">Files</h2>
        <div class="actions">
          <button
            class="send-btn ${showSendButton ? 'visible' : ''}"
            @click=${this.onSendClick}
            data-testid="send-file-btn"
          >Send File</button>
          <button
            class="disconnect-btn ${showDisconnectButton ? 'visible' : ''}"
            @click=${this.onDisconnectClick}
            data-testid="disconnect-btn"
          >Disconnect</button>
        </div>
        <input type="file" @change=${this.onFileSelected} />
      </div>
      <div class="list" data-testid="file-list">
        ${
          this.files.length > 0
            ? this.files.map((entry) => this.renderFileRow(entry))
            : html`
                <div class="empty" data-testid="empty-state">
                  <div class="empty-icon">📁</div>
                  <div>
                    ${this.connected
                      ? 'Tap + to send your first file'
                      : 'Connect a device to start sharing files'
                    }
                  </div>
                </div>
              `
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'files-tab': FilesTab;
  }
}
