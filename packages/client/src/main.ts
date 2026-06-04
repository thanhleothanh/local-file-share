import './app-shell.js';
import { runCleanStateHook } from './cleanState.js';

async function bootstrap(): Promise<void> {
  try {
    await runCleanStateHook();
  } catch (err) {
    console.warn('[bootstrap] clean-state hook failed', err);
  }
  document.documentElement.dataset.lfsReady = 'true';
}

void bootstrap();
