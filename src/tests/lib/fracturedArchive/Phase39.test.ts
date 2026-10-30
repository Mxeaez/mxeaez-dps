import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '..', '..', 'app', 'components', 'bestSetup');
const read = (f: string) => readFileSync(join(dir, f), 'utf-8');

describe('phase 39: carriers and route up front', () => {
  test('the carriers box is rendered by the Plan tab inputs, not by the Assumptions Advanced box', () => {
    const best = read('BestSetup.tsx');
    expect(best).not.toContain('data-testid="team-specs"');
    expect(best).not.toContain('bs-team-lightbearer');
    expect(best).toContain('<TeamCarriersBox');
    const box = read('TeamCarriersBox.tsx');
    expect(box).toContain('data-testid="team-specs"');
    expect(box).toContain('data-testid="team-carriers-toggle"');
    const plan = read('PlanView.tsx');
    expect(plan.indexOf('{carriersBox}')).toBeGreaterThan(plan.indexOf('data-testid="plan-inputs"'));
    expect(plan.indexOf('{carriersBox}')).toBeLessThan(plan.indexOf('data-testid="plan-advanced"'));
  });

  test('the route select is in the plan inputs, before the Advanced (plan) box', () => {
    const plan = read('PlanView.tsx');
    const route = plan.indexOf('data-testid="plan-route"');
    expect(route).toBeGreaterThan(plan.indexOf('data-testid="plan-inputs"'));
    expect(route).toBeLessThan(plan.indexOf('data-testid="plan-advanced"'));
  });
});
