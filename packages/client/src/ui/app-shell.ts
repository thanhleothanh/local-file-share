import { ConnectionState } from '@lfs/shared';
import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ConnectionViewModel, ConnectionViewModelState } from './ConnectionViewModel.js';
import './connected-card.js';
import './connection-tab.js';
import './file-progress.js';
import './incoming-prompt.js';

export type ActiveTab = 'connection' | 'files';

@customElement('app-shell')
export class AppShell extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0b1220;
      color: #e6e8ee;
    }
    .tabs {
      display: flex;
      gap: 1.5rem;
      padding: 1rem 1.5rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    button.tab {
      background: none;
      border: none;
      color: rgba(230, 232, 238, 0.6);
      font-size: 0.95rem;
      padding: 0.5rem 0.25rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    button.tab[aria-selected='true'] {
      color: #e6e8ee;
      border-bottom-color: #5b9cff;
    }
    button.tab[disabled] {
      color: rgba(230, 232, 238, 0.3);
      cursor: not-allowed;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot.connected {
      background: #2ecc71;
    }
    .dot.disconnected {
      background: #f5a623;
    }
    main {
      padding: 1rem 1.5rem;
    }
  `;

  @state()
  private activeTab: ActiveTab = 'connection';

  @state()
  private vmState: ConnectionViewModelState | null = null;

  @property({ attribute: false })
  viewModel: ConnectionViewModel | null = null;

  @state()
  private connected = false;

  private vmUnsub: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.viewModel) {
      this.vmState = this.viewModel.getState();
      this.vmUnsub = this.viewModel.subscribe((state) => {
        this.vmState = state;
      });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.vmUnsub) {
      this.vmUnsub();
      this.vmUnsub = null;
    }
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has('viewModel') && this.viewModel) {
      if (this.vmUnsub) this.vmUnsub();
      this.vmState = this.viewModel.getState();
      this.vmUnsub = this.viewModel.subscribe((state) => {
        this.vmState = state;
      });
    }
  }

  private selectTab(tab: ActiveTab): void {
    if (tab === 'files' && !this.connected) return;
    this.activeTab = tab;
  }

  private async handleFileSelected(event: CustomEvent<{ file: File }>): Promise<void> {
    const file = event.detail.file;
    if (!file || !this.viewModel) return;

    try {
      await this.viewModel.sendFile(file);
    } catch (error) {
      console.error('[AppShell] Failed to send file:', error);
    }
  }

  override render() {
    const state = this.vmState;
    const devices = state?.devices ?? [];
    const localId = state?.localDeviceId ?? '';
    const serverConnected = state?.serverConnected ?? false;
    const connectionState = state?.connectionState ?? ConnectionState.IDLE;
    const connectedDeviceId = state?.connectedDeviceId ?? null;
    const connectingToDeviceId = state?.connectingToDeviceId ?? null;
    const incomingRequest = state?.incomingRequest ?? null;
    const fileProgress = state?.fileProgress ?? null;
    this.connected = connectionState === ConnectionState.CONNECTED && connectedDeviceId !== null;
    return html`
      <nav class="tabs" role="tablist">
        <button
          class="tab"
          role="tab"
          aria-selected=${this.activeTab === 'connection'}
          data-testid="tab-connection"
          @click=${() => this.selectTab('connection')}
        >
          Connection
          <span class="dot ${serverConnected ? 'connected' : 'disconnected'}" data-testid="server-dot"></span>
        </button>
        <button
          class="tab"
          role="tab"
          aria-selected=${this.activeTab === 'files'}
          data-testid="tab-files"
          ?disabled=${!this.connected}
          @click=${() => this.selectTab('files')}
        >
          Files
        </button>
      </nav>
      <main>
        ${
          this.activeTab === 'connection'
            ? this.renderConnectionTab(
                devices,
                localId,
                serverConnected,
                connectionState,
                connectedDeviceId,
                connectingToDeviceId,
                incomingRequest,
                fileProgress,
              )
            : html`<p>Files tab</p>`
        }
      </main>
    `;
  }

  private renderConnectionTab(
    devices: ConnectionViewModelState['devices'],
    localId: string,
    serverConnected: boolean,
    connectionState: ConnectionState,
    connectedDeviceId: string | null,
    connectingToDeviceId: string | null,
    incomingRequest: ConnectionViewModelState['incomingRequest'],
    fileProgress: ConnectionViewModelState['fileProgress'],
  ) {
    if (!this.viewModel) {
      return html`<connection-tab
        .devices=${devices}
        .localDeviceId=${localId}
        ?dim=${!serverConnected}
      ></connection-tab>`;
    }
    const peer = (id: string): string => devices.find((d) => d.deviceId === id)?.deviceName ?? 'Unknown';
    return html`
      ${
        incomingRequest !== null
          ? html`<incoming-prompt
            .fromDeviceName=${incomingRequest.fromDeviceName}
            @accept-incoming=${() => this.viewModel?.acceptIncoming()}
            @reject-incoming=${() => this.viewModel?.rejectIncoming()}
          ></incoming-prompt>`
          : null
      }
      ${
        connectionState === ConnectionState.CONNECTING && connectingToDeviceId !== null
          ? html`<connected-card
            .peerName=${peer(connectingToDeviceId)}
            mode="connecting"
            @cancel-clicked=${() => this.viewModel?.cancelOutgoing()}
          ></connected-card>`
          : null
      }
      ${
        connectionState === ConnectionState.CONNECTED && connectedDeviceId !== null
          ? html`<connected-card
            .peerName=${peer(connectedDeviceId)}
            mode="connected"
            @disconnect-clicked=${() => this.viewModel?.disconnect()}
            @file-selected=${(ev: CustomEvent<{ file: File }>) => this.handleFileSelected(ev)}
          ></connected-card>`
          : null
      }
      ${
        connectionState === ConnectionState.IDLE
          ? html`<connection-tab
            .devices=${devices}
            .localDeviceId=${localId}
            ?dim=${!serverConnected}
            @connect-clicked=${(ev: CustomEvent<{ deviceId: string }>) =>
              this.viewModel?.requestConnect(ev.detail.deviceId)}
          ></connection-tab>`
          : null
      }
      ${
        fileProgress !== null
          ? html`<file-progress
            .bytesTransferred=${fileProgress.bytesTransferred}
            .totalBytes=${fileProgress.totalBytes}
            .fileName=${fileProgress.fileName}
            .isSender=${fileProgress.isSender}
            .showOpenFolder=${fileProgress.showOpenFolder}
            @open-folder-clicked=${() => this.viewModel?.openDownloadsFolder()}
          ></file-progress>`
          : null
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
