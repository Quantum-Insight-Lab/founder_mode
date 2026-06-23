/**
 * Domain validators (pure logic, no I/O).
 */
import { invariant } from './errors.js';

/** Log date cannot be in the future (relative to user's today). */
export function validateLogDate(dateStr: string, todayStr: string): void {
  invariant(dateStr <= todayStr, 'Запись только за прошедшие дни', '004');
}
