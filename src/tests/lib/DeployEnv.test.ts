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

  test('getCdnImage keeps apostrophes literal (phase 25) and leaves other characters as they are', () => {
    process.env.NEXT_PUBLIC_CDN_URL = 'https://dps.mxeaez.com/cdn';
    const { getCdnImage } = loadUtils();
    expect(getCdnImage("equipment/Tumeken's shadow.png")).toBe("https://dps.mxeaez.com/cdn/equipment/Tumeken's shadow.png");
    expect(getCdnImage('equipment/Tumeken%27s shadow.png')).toBe("https://dps.mxeaez.com/cdn/equipment/Tumeken's shadow.png");
    expect(getCdnImage('equipment/%2724-carat%27 sword.png')).toBe("https://dps.mxeaez.com/cdn/equipment/'24-carat' sword.png");
    expect(getCdnImage('monsters/The Maiden of Sugadinti (70% health).png'))
      .toBe('https://dps.mxeaez.com/cdn/monsters/The Maiden of Sugadinti (70% health).png');
    expect(getCdnImage('equipment/Rada%20s.png')).toBe('https://dps.mxeaez.com/cdn/equipment/Rada%20s.png');
  });

  test('SHORTLINKS_DISABLED reflects NEXT_PUBLIC_DISABLE_SHORTLINKS', () => {
    expect(loadUtils().SHORTLINKS_DISABLED).toBe(false);
    process.env.NEXT_PUBLIC_DISABLE_SHORTLINKS = 'false';
    expect(loadUtils().SHORTLINKS_DISABLED).toBe(false);
    process.env.NEXT_PUBLIC_DISABLE_SHORTLINKS = 'true';
    expect(loadUtils().SHORTLINKS_DISABLED).toBe(true);
  });
});
