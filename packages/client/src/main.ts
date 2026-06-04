import './ui/app-shell.js';
import { Logger } from '@lfs/shared';
import { runCleanStateHook } from './cleanState.js';
import { DeviceIdentity, WebSocketAutoReconnect, WebSocketClient } from './signaling/index.js';
import { ConnectionViewModel } from './ui/ConnectionViewModel.js';
import { toast } from './ui/toast-manager.js';

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

async function bootstrap(): Promise<void> {
  try {
    await runCleanStateHook();
  } catch (err) {
    console.warn('[bootstrap] clean-state hook failed', err);
  }

  const logger = new Logger('bootstrap');
  const identity = new DeviceIdentity();
  const { deviceId, deviceName } = identity.getOrCreate();
  const client = new WebSocketClient({
    url: WS_URL,
    identityProvider: () => ({ deviceId, deviceName }),
    logger: {
      info: (msg, ctx) => logger.info(msg, ctx as Record<string, unknown> | undefined),
      warn: (msg, ctx) => logger.warn(msg, ctx as Record<string, unknown> | undefined),
      error: (msg, ctx) => logger.error(msg, ctx as Record<string, unknown> | undefined),
    },
  });
  const reconnect = new WebSocketAutoReconnect({ client });
  const viewModel = new ConnectionViewModel({ client, localDeviceId: deviceId, localDeviceName: deviceName });
  viewModel.attach();
  reconnect.start();
  client.connect();

  const shell = document.querySelector('app-shell') as
    | (HTMLElement & { viewModel?: ConnectionViewModel })
    | null;
  if (shell) {
    shell.viewModel = viewModel;
  }

  interface LfsGlobals {
    toast: typeof toast;
    viewModel: ConnectionViewModel;
  }
  const w = window as unknown as { lfs: LfsGlobals };
  w.lfs = { toast, viewModel };

  document.documentElement.dataset.lfsReady = 'true';
}

void bootstrap();
