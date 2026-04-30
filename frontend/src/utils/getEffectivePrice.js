/**
 * Thin wrappers kept for legacy call sites that only need a card-level
 * price summary. Variant-aware pages should use `./variants.js` directly.
 */
import { startingPrice } from './variants.js';

/** Cheapest variant price for product cards. */
export const getCardPrice = (product) => startingPrice(product);
