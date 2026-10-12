import { expect, test as base, type BrowserContext } from '@playwright/test';

/**
 * Collect Content-Security-Policy violations in every page of a context: the browser's console report
 * ("Refused to ...") and the securitypolicyviolation event. Only the production build ships the policy,
 * so this is a no-op against the dev server and a hard check against `vite preview` and the live site.
 */
export function watchCsp(context: BrowserContext): string[] {
  const violations: string[] = [];
  void context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`KEYFALL_CSP_VIOLATION ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  context.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('KEYFALL_CSP_VIOLATION') || /Content Security Policy|Refused to (load|apply|execute|connect|create)/.test(text)) {
      violations.push(text);
    }
  });
  return violations;
}

/** `test` with an automatic guard: any CSP violation in the test's context fails it. */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use) => {
      const violations = watchCsp(context);
      await use();
      expect(violations, 'Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});
