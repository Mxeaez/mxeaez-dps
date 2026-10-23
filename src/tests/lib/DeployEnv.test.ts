import {
  afterEach, beforeEach, describe, expect, jest, test,
} from '@jest/globals';

// mxeaez fork (phase 10): deploy-time env switches in src/utils.ts. Both are read when the module loads, so each
// test sets process.env and then loads a fresh copy of the module.
type Utils = typeof import('@/utils');

const loadUtils = (): Utils => {
  let mod: Utils | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('@/utils');
  });
  return mod as Utils;
};

describe('deploy env switches', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CDN_URL;
    delete process.env.NEXT_PUBLIC_DISABLE_SHORTLINKS;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  test('getCdnImage uses NEXT_PUBLIC_CDN_URL when set', () => {
    process.env.NEXT_PUBLIC_CDN_URL = '/cdn';
    expect(loadUtils().getCdnImage('monsters/Archive Guardian.png')).toBe('/cdn/monsters/Archive Guardian.png');
  });

  test('getCdnImage falls back to the upstream bucket when unset', () => {
    expect(loadUtils().getCdnImage('equipment/Obligator.png'))
      .toBe('https://tools.runescape.wiki/osrs-dps/cdn/equipment/Obligator.png');
  });

  test('SHORTLINKS_DISABLED reflects NEXT_PUBLIC_DISABLE_SHORTLINKS', () => {
    expect(loadUtils().SHORTLINKS_DISABLED).toBe(false);
    process.env.NEXT_PUBLIC_DISABLE_SHORTLINKS = 'false';
    expect(loadUtils().SHORTLINKS_DISABLED).toBe(false);
    process.env.NEXT_PUBLIC_DISABLE_SHORTLINKS = 'true';
    expect(loadUtils().SHORTLINKS_DISABLED).toBe(true);
  });
});
