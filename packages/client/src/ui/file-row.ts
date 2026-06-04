import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { FileEntry } from '../files/FileStateMachine.js';
import type { FileState } from '../files/FileStateMachine.js';

export type FileDirection = 'sent' | 'received';

@customElement('file-row')
export class FileRow extends LitElement {
  static override styles = css`
    :host {
      display: block;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 0.5rem;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .direction {
      font-size: 1.2rem;
      width: 24px;
      text-align: center;
      flex-shrink: 0;
    }
    .direction.sent {
      color: #5b9cff;
    }
    .direction.received {
      color: #2ecc71;
    }
    .info {
      flex: 1;
      min-width: 0;
    }
    .filename {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0.25rem;
    }
    .size {
      font-size: 0.85rem;
      color: rgba(230, 232, 238, 0.6);
    }
    .state {
      font-size: 0.85rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .state.PENDING {
      color: #f5a623;
    }
    .state.QUEUED {
      color: #e7aa46;
    }
    .state.TRANSFERRING {
      color: #5b9cff;
    }
    .state.COMPLETED {
      color: #2ecc71;
    }
    .state.REJECTED {
      color: #ef4444;
    }
    .state.FAILED {
      color: #ef4444;
    }
    .state.CANCELLED {
      color: rgba(255, 255, 255, 0.5);
    }
    .progress-container {
      flex: 1;
      min-width: 100px;
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 0.25rem;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #5b9cff, #2ecc71);
      border-radius: 3px;
      transition: width 0.2s ease;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    button {
      background: rgba(255, 255, 255, 0.1);
      color: #e6e8ee;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 0.375rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.accept {
      background: #2ecc71;
      border-color: #2ecc71;
    }
    button.accept:hover:not(:disabled) {
      background: #27ae60;
    }
    button.reject {
      background: #ef4444;
      border-color: #ef4444;
    }
    button.reject:hover:not(:disabled) {
      background: #dc3545;
    }
    button.cancel {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.4);
      color: #ef4444;
    }
    button.cancel:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.4);
    }
    .checkmark {
      color: #2ecc71;
      font-size: 1.2rem;
      flex-shrink: 0;
    }
    .status-text {
      font-size: 0.85rem;
      color: rgba(230, 232, 238, 0.6);
      flex-shrink: 0;
    }
    .dismiss {
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 0.15s ease;
    }
    .dismiss:hover {
      opacity: 1;
    }
  `;

  @property({ attribute: false })
  entry: FileEntry | null = null;

  @property({ type: String })
  direction: FileDirection = 'received';

  @property({ type: Boolean })
  hasTransferring = false;

  @property({ type: Number })
  progress: number | null = null; // 0-100

  private renderDirection(): string {
    return this.direction === 'sent' ? '↑' : '↓';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private getStateLabel(state: FileState): string {
    const labels: Record<FileState, string> = {
      PENDING: 'Pending',
      QUEUED: 'Queued',
      TRANSFERRING: 'Transferring',
      COMPLETED: 'Completed',
      REJECTED: 'Rejected',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    };
    return labels[state] ?? state;
  }

  private onAccept(): void {
    if (!this.entry) return;
    this.dispatchEvent(
      new CustomEvent('file-accept', {
        detail: { fileId: this.entry.fileId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onReject(): void {
    if (!this.entry) return;
    this.dispatchEvent(
      new CustomEvent('file-reject', {
        detail: { fileId: this.entry.fileId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onCancel(): void {
    if (!this.entry) return;
    this.dispatchEvent(
      new CustomEvent('file-cancel', {
        detail: { fileId: this.entry.fileId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onDismiss(): void {
    if (!this.entry) return;
    this.dispatchEvent(
      new CustomEvent('file-dismiss', {
        detail: { fileId: this.entry.fileId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderStateBadges(state: FileState): unknown {
    switch (state) {
      case 'PENDING':
        return this.direction === 'received'
          ? html`
              <div class="actions">
                <button
                  class="accept"
                  ?disabled=${this.hasTransferring}
                  @click=${this.onAccept}
                  data-testid="accept-btn"
                >Accept</button>
                <button
                  class="reject"
                  @click=${this.onReject}
                  data-testid="reject-btn"
                >Reject</button>
              </div>
            `
          : html`
              <div class="actions">
                <button
                  class="cancel"
                  @click=${this.onCancel}
                  data-testid="cancel-btn"
                >Cancel</button>
              </div>
            `;
      case 'QUEUED':
        return html`<div class="status-text">Queued</div>`;
      case 'TRANSFERRING':
        return this.direction === 'received'
          ? html`<div class="status-text">Receiving</div>`
          : html`
              <div class="actions">
                <button
                  class="cancel"
                  @click=${this.onCancel}
                  data-testid="cancel-btn"
                >Cancel</button>
              </div>
            `;
      case 'COMPLETED':
        return html`<div class="checkmark" data-testid="checkmark">✓</div>`;
      case 'REJECTED':
      case 'FAILED':
      case 'CANCELLED':
        return html`
          <div class="actions">
            <span
              class="dismiss"
              @click=${this.onDismiss}
              data-testid="dismiss-btn"
            >✕</span>
          </div>
        `;
      default:
        return null;
    }
  }

  override render() {
    if (!this.entry) {
      return html``;
    }

    const state = this.entry.state as FileState;

    return html`
      <div class="row">
        <span class="direction ${this.direction}" data-testid="direction">
          ${this.renderDirection()}
        </span>
        <div class="info">
          <div class="filename" data-testid="filename">${this.entry.fileName}</div>
          <div class="size" data-testid="size">${this.formatSize(this.entry.fileSize)}</div>
        </div>
        <div class="state ${state}" data-testid="state">
          ${this.getStateLabel(state)}
        </div>
        ${
          state === 'TRANSFERRING' && this.progress !== null
            ? html`
                <div class="progress-container">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      style=${`width: ${this.progress}%`}
                      data-testid="progress-fill"
                    ></div>
                  </div>
                </div>
              `
            : null
        }
        ${this.renderStateBadges(state)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'file-row': FileRow;
  }
}
