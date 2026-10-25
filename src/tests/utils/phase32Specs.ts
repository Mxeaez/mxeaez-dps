import { BestSetupAssumptions } from '@/lib/fracturedArchive/presets';

/**
 * Phase 33: "Specs I bring" defaults to none. Tests written before phase 33 pin numbers with the old default
 * (Elder maul + 2 Eye of Ayak specs); they keep it as an explicit input through this helper.
 */
export const PHASE32_MY_SPECS: Pick<BestSetupAssumptions['mySpecs'], 'elderMaul' | 'ayak'> = { elderMaul: true, ayak: 2 };

export const withPhase32Specs = <T extends BestSetupAssumptions>(a: T): T => ({
  ...a, mySpecs: { ...a.mySpecs, ...PHASE32_MY_SPECS },
});
