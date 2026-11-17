import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/version';

describe('version', () => {
  it('matches package.json (APP_VERSION + ".0")', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(pkg.version).toBe(`${APP_VERSION}.0`);
  });
});
