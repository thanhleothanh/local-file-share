import './app-shell.js';
import { Logger } from '@lfs/shared';
import { runCleanStateHook } from './cleanState.js';
import { DeviceIdentity, WebSocketAutoReconnect, WebSocketClient } from './signaling/index.js';

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

async function bootstrap(): Promise<void> {
  try {
    await runCleanStateHook();
  } catch (err) {
    console.warn('[bootstrap] clean-state hook failed', err);
  }

  const logger = new Logger('bootstrap');
  const identity = new DeviceIdentity();
  const client = new WebSocketClient({
    url: WS_URL,
    identityProvider: () => identity.getOrCreate(),
    logger: {
      info: (msg, ctx) => logger.info(msg, ctx as Record<string, unknown> | undefined),
      warn: (msg, ctx) => logger.warn(msg, ctx as Record<string, unknown> | undefined),
      error: (msg, ctx) => logger.error(msg, ctx as Record<string, unknown> | undefined),
    },
  });
  const reconnect = new WebSocketAutoReconnect({ client });
  reconnect.start();
  client.connect();
  document.documentElement.dataset.lfsReady = 'true';
}

void bootstrap();
