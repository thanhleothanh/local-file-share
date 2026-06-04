import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

@customElement('toast-notification')
export class ToastNotification extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      max-width: 360px;
      pointer-events: auto;
      font-size: 0.9rem;
      line-height: 1.4;
      animation: toast-enter 200ms ease;
    }

    :host([data-state='exiting']) {
      animation: toast-exit 200ms ease forwards;
    }

    :host([data-variant='error']) {
      background: #5c1f1f;
      border-left: 4px solid #ef4444;
      color: #fca5a5;
    }
    :host([data-variant='success']) {
      background: #14532d;
      border-left: 4px solid #22c55e;
      color: #86efac;
    }
    :host([data-variant='info']) {
      background: #0e4f5c;
      border-left: 4px solid #06b6d4;
      color: #67e8f9;
    }
    :host([data-variant='warning']) {
      background: #5c3a0e;
      border-left: 4px solid #f97316;
      color: #fdba74;
    }

    .icon {
      flex: 0 0 auto;
      font-size: 1.1rem;
      font-weight: 700;
    }

    p.toast-message {
      margin: 0;
      flex: 1 1 auto;
    }

    @keyframes toast-enter {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes toast-exit {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(-8px);
      }
    }
  `;

  @property({ type: String, reflect: true, attribute: 'data-variant' })
  type: ToastType = 'info';

  @property({ type: String })
  message = '';

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', this.type === 'error' ? 'alert' : 'status');
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has('type')) {
      this.setAttribute('role', this.type === 'error' ? 'alert' : 'status');
    }
  }

  dismiss(): void {
    if (this.getAttribute('data-state') === 'exiting') return;
    this.setAttribute('data-state', 'exiting');
    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('toast-dismissed', { bubbles: true, composed: true }));
    }, 200);
  }

  override render() {
    const icons: Record<ToastType, string> = {
      error: '\u2715',
      success: '\u2713',
      info: '\u2139',
      warning: '\u26A0',
    };
    return html`
      <span class="icon" data-testid="toast-icon" aria-hidden="true">${icons[this.type]}</span>
      <p class="toast-message">${this.message}</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'toast-notification': ToastNotification;
  }
}
