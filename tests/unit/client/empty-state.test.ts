import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../packages/client/src/ui/empty-state';

describe('empty-state', () => {
  let el: HTMLElement & { message: string };

  beforeEach(async () => {
    const node = document.createElement('empty-state') as HTMLElement & { message: string };
    node.setAttribute('message', 'No devices online');
    document.body.appendChild(node);
    await (node as unknown as { updateComplete: Promise<void> }).updateComplete;
    el = node;
  });

  afterEach(() => {
    el.remove();
  });

  it('renders the provided message', () => {
    const text = el.shadowRoot?.querySelector('[data-testid="empty-state"]')?.textContent;
    expect(text).toContain('No devices online');
  });
});
