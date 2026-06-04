import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('incoming-prompt')
export class IncomingPrompt extends LitElement {
  static override styles = css`
    :host {
      display: block;
      background: rgba(91, 156, 255, 0.12);
      border: 1px solid rgba(91, 156, 255, 0.4);
      border-radius: 12px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    p {
      margin: 0 0 0.75rem;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
    }
    button {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: none;
      font-weight: 500;
      cursor: pointer;
    }
    .accept {
      background: #22c55e;
      color: #fff;
    }
    .reject {
      background: rgba(255, 255, 255, 0.08);
      color: #e6e8ee;
    }
  `;

  @property({ type: String })
  fromDeviceName = '';

  private onAccept(): void {
    this.dispatchEvent(new CustomEvent('accept-incoming', { bubbles: true, composed: true }));
  }

  private onReject(): void {
    this.dispatchEvent(new CustomEvent('reject-incoming', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <p data-testid="incoming-prompt-text">
        <strong>${this.fromDeviceName}</strong> wants to connect
      </p>
      <div class="actions">
        <button class="reject" data-testid="reject-incoming" @click=${this.onReject}>
          Reject
        </button>
        <button class="accept" data-testid="accept-incoming" @click=${this.onAccept}>
          Accept
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'incoming-prompt': IncomingPrompt;
  }
}
