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

  override render() {
    const isConnecting = this.mode === 'connecting';
    return html`
      <div class="label" data-testid=${isConnecting ? 'connecting-label' : 'connected-label'}>
        ${isConnecting ? 'Connecting to' : 'Connected to'}
      </div>
      <div class="name" data-testid="connected-peer-name">${this.peerName}</div>
      <button
        data-testid=${isConnecting ? 'cancel-connect' : 'disconnect'}
        data-variant=${isConnecting ? 'cancel' : 'disconnect'}
        @click=${this.onClick}
      >
        ${isConnecting ? 'Cancel' : 'Disconnect'}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'connected-card': ConnectedCard;
  }
}
