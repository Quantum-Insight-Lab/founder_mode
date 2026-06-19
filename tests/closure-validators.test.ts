import { describe, it, expect } from 'vitest';
import { validateStepBranch } from '../src/domain/validators.js';
import { InvariantViolationError } from '../src/domain/errors.js';

describe('validateStepBranch (closure)', () => {
  it('throws when movement_branch=yes but required fields empty', () => {
    expect(() =>
      validateStepBranch({ movement_branch: 'yes', what_moved: '', tomorrow_step: '' })
    ).toThrow(InvariantViolationError);
  });

  it('throws when movement_branch=no but avoidance empty', () => {
    expect(() =>
      validateStepBranch({
        movement_branch: 'no',
        what_stopped: 'a',
        avoidance: '',
        tomorrow_step: 'b',
      })
    ).toThrow(/заполни/);
  });

  it('passes when movement_branch=no and all fields filled', () => {
    expect(() =>
      validateStepBranch({
        movement_branch: 'no',
        what_stopped: 'a',
        avoidance: 'b',
        tomorrow_step: 'c',
      })
    ).not.toThrow();
  });

  it('passes when movement_branch=partial', () => {
    expect(() =>
      validateStepBranch({
        movement_branch: 'partial',
        what_moved: 'a',
        why_partial: 'b',
        tomorrow_step: 'c',
      })
    ).not.toThrow();
  });
});
