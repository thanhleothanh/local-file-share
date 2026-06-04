import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('empty-state')
export class EmptyState extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
      color: rgba(230, 232, 238, 0.6);
    }
    p {
      margin: 0;
      font-size: 0.95rem;
    }
  `;

  @property({ type: String })
  message = '';

  override render() {
    return html`<p data-testid="empty-state">${this.message}</p>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'empty-state': EmptyState;
  }
}
