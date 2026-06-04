import type { DeviceDescriptor } from '@lfs/shared';
import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('device-row')
export class DeviceRow extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    :host(:last-child) {
      border-bottom: none;
    }
    .name {
      flex: 1;
      color: #e6e8ee;
    }
    .badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      background: rgba(91, 156, 255, 0.18);
      color: #5b9cff;
      border-radius: 999px;
    }
    button {
      background: #5b9cff;
      color: #fff;
      border: none;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    button[disabled] {
      background: rgba(91, 156, 255, 0.25);
      color: rgba(255, 255, 255, 0.45);
      cursor: not-allowed;
    }
    :host([dim]) {
      opacity: 0.4;
      pointer-events: none;
    }
  `;

  @property({ attribute: false })
  device: DeviceDescriptor | null = null;

  @property({ type: Boolean })
  isSelf = false;

  @property({ type: Boolean })
  dim = false;

  @property({ type: Boolean, reflect: true })
  busy = false;

  private onConnectClick(): void {
    if (this.device === null || this.isSelf || this.busy) return;
    this.dispatchEvent(
      new CustomEvent('connect-clicked', {
        detail: { deviceId: this.device.deviceId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (this.device === null) return html``;
    return html`
      <span class="name">${this.device.deviceName}</span>
      ${
        this.isSelf
          ? html`<span class="badge" data-testid="you-badge">You</span>`
          : html`<button
            data-testid="connect-button"
            ?disabled=${this.busy || this.device.connectedTo !== null}
            @click=${this.onConnectClick}
          >
            ${this.device.connectedTo !== null ? 'Busy' : 'Connect'}
          </button>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'device-row': DeviceRow;
  }
}
