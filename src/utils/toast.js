/**
 * Toast Notifications Module
 * Stacked, fade-in/fade-out notifications for success, error, info, and warning
 * messages. Replaces inline tab alerts to avoid layout shifting.
 */

const TOAST_DURATION_MS = 2000;
const FADE_MS = 200;
const MOBILE_BREAKPOINT = 768;

const ICONS = {
  error: '✕',
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
};

const VALID_TYPES = Object.keys(ICONS);

/**
 * Toast Manager
 * Singleton that owns the toast container and renders toasts on demand.
 * The container is created lazily on the first toast so it does not appear
 * in the DOM when no toasts are active.
 */
export class ToastManager {
  constructor() {
    this.container = null;
  }

  /**
   * Show a toast.
   * @param {string} message - Message text
   * @param {'error'|'success'|'info'|'warning'} [type='error']
   */
  show(message, type = 'error') {
    if (!message) return;
    const safeType = VALID_TYPES.includes(type) ? type : 'error';
    this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${safeType}`;
    toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[safeType];

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);

    // Newest on top of the stack (visually closest to the corner).
    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    setTimeout(() => this.dismiss(toast), TOAST_DURATION_MS);
  }

  /**
   * Dismiss a toast with a fade-out.
   * @param {HTMLElement} toast
   */
  dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-leaving');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, FADE_MS);
  }

  ensureContainer() {
    if (this.container && document.body.contains(this.container)) return;
    this.container = document.createElement('div');
    this.container.id = 'toastContainer';
    this.container.className = 'toast-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(this.container);
  }
}

export const toastManager = new ToastManager();
