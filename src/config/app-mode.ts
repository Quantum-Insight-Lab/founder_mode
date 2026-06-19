export type AppMode = 'founder' | 'closure';

/** @deprecated Use per-user product_mode from user_settings */
export type ProductMode = AppMode;

/** @deprecated Use getUserProductMode from services/product-mode.ts */
export function getAppMode(): AppMode {
  return 'founder';
}

/** @deprecated Use isClosureProductMode(mode) with user's product_mode */
export function isClosureMode(): boolean {
  return false;
}
