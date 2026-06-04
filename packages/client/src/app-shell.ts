import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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
    main {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
      text-align: center;
    }
    h1 {
      font-size: 1.75rem;
      margin: 0 0 0.5rem;
    }
    p {
      margin: 0;
      opacity: 0.7;
    }
  `;

  @state()
  private status: 'loading' | 'ready' = 'loading';

  override connectedCallback(): void {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent('app-ready', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <main>
        <div>
          <h1>Local File Share &mdash; coming soon</h1>
          <p>App shell loaded. Status: ${this.status}</p>
        </div>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
