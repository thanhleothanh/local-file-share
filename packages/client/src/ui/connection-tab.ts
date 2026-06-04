import type { DeviceDescriptor } from '@lfs/shared';
import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './device-row.js';
import './empty-state.js';

@customElement('connection-tab')
export class ConnectionTab extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 0.5rem 0;
    }
    :host([dim]) {
      opacity: 0.4;
      pointer-events: none;
    }
    .list {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      overflow: hidden;
    }
  `;

  @property({ attribute: false })
  devices: readonly DeviceDescriptor[] = [];

  @property({ type: String })
  localDeviceId = '';

  @property({ type: Boolean, reflect: true })
  dim = false;

  private isSelf(device: DeviceDescriptor): boolean {
    return device.deviceId === this.localDeviceId;
  }

  override render() {
    if (this.devices.length === 0) {
      return html`<empty-state message="No devices online"></empty-state>`;
    }
    return html`
      <div class="list" data-testid="device-list">
        ${this.devices.map(
          (device) => html`
            <device-row
              .device=${device}
              ?isSelf=${this.isSelf(device)}
              .busy=${device.connectedTo !== null}
            ></device-row>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'connection-tab': ConnectionTab;
  }
}
