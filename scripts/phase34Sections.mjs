/**
 * Phase 34: the Plan / Search tabs moved their explanations into sections closed by default. The older verify scripts
 * open them before reading what moved (they assert the same things as before).
 * - Plan: "Why this kit" (kit loadouts, potions, ring, alternatives, stats), "Spec plan" (team briefing table, Solo
 *   weapon list), "Per-phase details" (encounter table, routes), "Advanced (plan)" (route, potions note, raid items).
 * - Search: the drain box's "details" (sentence form, hit chances, budget, P(floor), per-boss table) and "Search
 *   details" (ranked at, best preset, evaluations, can't-hit list).
 */
export const PLAN_SECTIONS = ['plan-why-details', 'plan-spec-details', 'plan-phase-details'];
export const SEARCH_SECTIONS = ['spec-plan-details', 'search-details'];

/** Opens the given <details> sections (by data-testid) wherever they are on the page. */
export const openSections = async (page, ids = [...PLAN_SECTIONS, ...SEARCH_SECTIONS]) => {
  await page.evaluate((list) => list.forEach((id) => document.querySelectorAll(`details[data-testid="${id}"]`).forEach((d) => {
    // eslint-disable-next-line no-param-reassign
    d.open = true;
  })), ids);
};
