import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../packages/client/src/ui/app-shell';
import { ConnectionState } from '@lfs/shared';
import type {
  ConnectionViewModel,
  ConnectionViewModelState,
} from '../../../packages/client/src/ui/ConnectionViewModel';

class FakeViewModel {
  private state: ConnectionViewModelState = {
    devices: [],
    serverConnected: false,
    connectionState: ConnectionState.IDLE,
    connectedDeviceId: null,
    connectingToDeviceId: null,
    localDeviceId: 'me',
    localDeviceName: 'Me',
  };
  private readonly listeners = new Set<(s: ConnectionViewModelState) => void>();
  getState(): ConnectionViewModelState {
    return this.state;
  }
  subscribe(fn: (s: ConnectionViewModelState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  setState(next: Partial<ConnectionViewModelState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn(this.state);
  }
  attach(): void {}
  detach(): void {}
  isSelf(): boolean {
    return false;
  }
}

interface AppShellEl extends HTMLElement {
  viewModel: ConnectionViewModel | null;
  updateComplete: Promise<unknown>;
}

describe('app-shell', () => {
  let el: AppShellEl;
  beforeEach(async () => {
    el = document.createElement('app-shell') as AppShellEl;
    document.body.appendChild(el);
    await el.updateComplete;
  });
  afterEach(() => el.remove());

  it('renders Connection tab as default', async () => {
    const conn = el.shadowRoot?.querySelector('[data-testid="tab-connection"]') as HTMLButtonElement | null;
    expect(conn?.getAttribute('aria-selected')).toBe('true');
    const files = el.shadowRoot?.querySelector('[data-testid="tab-files"]') as HTMLButtonElement | null;
    expect(files?.getAttribute('aria-selected')).toBe('false');
  });

  it('disables the Files tab when not connected', () => {
    const files = el.shadowRoot?.querySelector('[data-testid="tab-files"]') as HTMLButtonElement | null;
    expect(files?.disabled).toBe(true);
  });

  it('server dot is amber (disconnected) when no view model', () => {
    const dot = el.shadowRoot?.querySelector('[data-testid="server-dot"]');
    expect(dot?.classList.contains('disconnected')).toBe(true);
  });

  it('wires the viewModel property and updates state', async () => {
    const vm = new FakeViewModel();
    el.viewModel = vm as unknown as ConnectionViewModel;
    await el.updateComplete;
    vm.setState({ serverConnected: true, devices: [] });
    await el.updateComplete;
    const dot = el.shadowRoot?.querySelector('[data-testid="server-dot"]');
    expect(dot?.classList.contains('connected')).toBe(true);
  });

  it('shows ConnectionTab content with dim when server is disconnected', async () => {
    const vm = new FakeViewModel();
    el.viewModel = vm as unknown as ConnectionViewModel;
    await el.updateComplete;
    const tab = el.shadowRoot?.querySelector('connection-tab');
    expect(tab?.hasAttribute('dim')).toBe(true);
  });
});
