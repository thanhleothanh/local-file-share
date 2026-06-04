import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('connected-card')
export class ConnectedCard extends LitElement {
  static override styles = css`
    :host {
      display: block;
      background: rgba(46, 204, 113, 0.12);
      border: 1px solid rgba(46, 204, 113, 0.4);
      border-radius: 12px;
      padding: 1.25rem;
    }
    .label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(46, 204, 113, 0.9);
      margin-bottom: 0.25rem;
    }
    .name {
      font-size: 1.4rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    button {
      background: #ef4444;
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    button[data-variant='cancel'] {
      background: rgba(255, 255, 255, 0.08);
      color: #e6e8ee;
    }
    button[data-variant='send'] {
      background: #5b9cff;
      color: #fff;
    }
    input[type='file'] {
      display: none;
    }
  `;

  @property({ type: String })
  peerName = '';

  @property({ type: String })
  mode: 'connected' | 'connecting' = 'connected';

  private onClick(): void {
    this.dispatchEvent(
      new CustomEvent(this.mode === 'connected' ? 'disconnect-clicked' : 'cancel-clicked', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onSendTestFileClick(): void {
    const input = this.renderRoot?.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (input) {
      input.click();
    }
  }

  private onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.dispatchEvent(
        new CustomEvent('file-selected', {
          detail: { file: input.files[0] },
          bubbles: true,
          composed: true,
        }),
      );
      // Reset input so the same file can be selected again
      input.value = '';
    }
  }

  override render() {
    const isConnecting = this.mode === 'connecting';

    return html`
      <div class="label" data-testid=${isConnecting ? 'connecting-label' : 'connected-label'}> 
        ${isConnecting ? 'Connecting to' : 'Connected to'}
      </div>
      <div class="name" data-testid="connected-peer-name">${this.peerName}</div>
      <div class="actions">
        ${
          isConnecting
            ? ''
            : html`
              <button
                data-testid="send-test-file"
                data-variant="send"
                @click=${this.onSendTestFileClick}
              >
                Send test file
              </button>
            `
        }
        <button
          data-testid=${isConnecting ? 'cancel-connect' : 'disconnect'}
          data-variant=${isConnecting ? 'cancel' : 'disconnect'}
          @click=${this.onClick}
        >
          ${isConnecting ? 'Cancel' : 'Disconnect'}
        </button>
      </div>
      <input type="file" @change=${this.onFileSelected} />
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'connected-card': ConnectedCard;
  }
}
