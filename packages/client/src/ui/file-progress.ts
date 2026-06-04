import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('file-progress')
export class FileProgress extends LitElement {
  static override styles = css`
    :host {
      display: block;
      margin-top: 1rem;
    }
    .container {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 0.5rem;
    }
    .label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.25rem;
      font-size: 0.85rem;
      color: rgba(230, 232, 238, 0.7);
    }
    .bar-container {
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .bar {
      height: 100%;
      background: linear-gradient(90deg, #5b9cff, #2ecc71);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .open-folder {
      display: inline-block;
      margin-top: 0.5rem;
      color: #5b9cff;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: underline;
    }
    .open-folder:hover {
      color: #7bc4ff;
    }
  `;

  @property({ type: Number })
  bytesTransferred = 0;

  @property({ type: Number })
  totalBytes = 0;

  @property({ type: String })
  fileName = '';

  @property({ type: Boolean })
  showOpenFolder = false;

  @property({ type: Boolean })
  isSender = false;

  private get progressPercent(): number {
    if (this.totalBytes === 0) return 0;
    return (this.bytesTransferred / this.totalBytes) * 100;
  }

  private get labelText(): string {
    const transferredInKB = Math.round(this.bytesTransferred / 1024);
    const totalInKB = Math.round(this.totalBytes / 1024);
    return `${this.isSender ? 'Sending' : 'Receiving'} ${this.fileName} (${transferredInKB} / ${totalInKB} KB)`;
  }

  private onOpenFolderClick(): void {
    this.dispatchEvent(
      new CustomEvent('open-folder-clicked', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="container">
        <div class="label">
          <span>${this.labelText}</span>
          <span>${Math.round(this.progressPercent)}%</span>
        </div>
        <div class="bar-container">
          <div class="bar" style="width: ${this.progressPercent}%" data-testid="progress-bar"></div>
        </div>
        ${
          this.showOpenFolder
            ? html`
          <button class="open-folder" @click=${this.onOpenFolderClick} data-testid="open-folder">
            Open downloads folder
          </button>
        `
            : ''
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'file-progress': FileProgress;
  }
}
