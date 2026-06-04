import './toast-notification.js';
import type { ToastNotification, ToastType } from './toast-notification.js';

const TOAST_DURATION_MS = 2000;
const EXIT_ANIMATION_MS = 200;

export class ToastManager {
  private static _current: ToastManager | null = null;
  private container: HTMLElement | null = null;
  private readonly activeToasts: Set<ToastNotification> = new Set();

  static instance(): ToastManager {
    if (ToastManager._current === null) {
      ToastManager._current = new ToastManager();
    }
    return ToastManager._current;
  }

  show(type: ToastType, message: string): ToastNotification {
    if (this.container === null) {
      this.container = this.createContainer();
      document.body.appendChild(this.container);
    }
    const toast = document.createElement('toast-notification') as ToastNotification;
    toast.type = type;
    toast.message = message;
    this.container.appendChild(toast);
    this.activeToasts.add(toast);

    toast.addEventListener(
      'toast-dismissed',
      () => {
        this.removeToast(toast);
      },
      { once: true },
    );

    setTimeout(() => {
      toast.dismiss();
    }, TOAST_DURATION_MS);

    return toast;
  }

  activeCount(): number {
    return this.activeToasts.size;
  }

  static reset(): void {
    const mgr = ToastManager._current;
    if (mgr !== null) {
      const container = document.querySelector('.toast-container');
      container?.remove();
    }
    ToastManager._current = null;
  }

  private removeToast(toast: ToastNotification): void {
    toast.remove();
    this.activeToasts.delete(toast);
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.setAttribute('role', 'region');
    container.setAttribute('data-testid', 'toast-container');
    container.style.position = 'fixed';
    container.style.top = '1rem';
    container.style.right = '1rem';
    container.style.left = 'auto';
    container.style.bottom = 'auto';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '0.5rem';
    container.style.pointerEvents = 'none';
    this.applyMobileStyles(container);
    window.addEventListener('resize', () => this.applyMobileStyles(container), { passive: true });
    return container;
  }

  private applyMobileStyles(container: HTMLElement): void {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      container.style.top = '0';
      container.style.left = '0';
      container.style.right = '0';
      container.style.paddingTop = 'env(safe-area-inset-top)';
      container.style.paddingLeft = '0.5rem';
      container.style.paddingRight = '0.5rem';
    } else {
      container.style.top = '1rem';
      container.style.right = '1rem';
      container.style.left = 'auto';
      container.style.paddingTop = '0';
      container.style.paddingLeft = '0';
      container.style.paddingRight = '0';
    }
  }
}

export function resetToastManager(): void {
  ToastManager.reset();
}

export function toast(type: ToastType, message: string): ToastNotification {
  return ToastManager.instance().show(type, message);
}

export const __TESTING__ = { TOAST_DURATION_MS, EXIT_ANIMATION_MS };
