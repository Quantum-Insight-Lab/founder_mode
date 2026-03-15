/**
 * Domain errors for invariant violations (pure, no observability deps)
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InvariantViolationError extends DomainError {
  constructor(
    message: string,
    public readonly invariantId: string
  ) {
    super(message, `INVARIANT_${invariantId}`);
    this.name = 'InvariantViolationError';
  }
}

export function invariant(condition: boolean, message: string, invariantId: string): asserts condition {
  if (!condition) {
    throw new InvariantViolationError(message, invariantId);
  }
}
