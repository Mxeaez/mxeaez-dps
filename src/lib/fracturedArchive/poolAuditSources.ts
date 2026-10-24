import { ItemRef } from '@/lib/fracturedArchive/presets';
import { SPEC_SHIELD, SPEC_WEAPONS } from '@/lib/fracturedArchive/specs';

/**
 * Phase 25: inputs of the pool audit (poolAudit.ts) shared by its Jest test and scripts/auditPool.mjs.
 * - Upstream files whose item-name string literals count as "has an effect".
 * - Items used outside the search pools / presets: the drain spec weapons and their shields (specs.ts).
 */
export const AUDIT_SOURCE_FILES = ['src/lib/PlayerVsNPCCalc.ts', 'src/lib/BaseCalc.ts', 'src/lib/Equipment.ts'];

export const AUDIT_EXTRA_REFS: ItemRef[] = [
  ...Object.values(SPEC_WEAPONS).map((w) => w.item),
  ...Object.values(SPEC_SHIELD),
  'Lightbearer',
];
