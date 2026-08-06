import { totalStock } from '../utils/variants';

/**
 * "Out of Stock" pill for product cards.
 *
 * Shown only when a product has NO stock in ANY variant — a product with one
 * size left in one colour is still buyable and must not be marked unavailable,
 * so the test is the product-wide total rather than any per-variant state.
 *
 * Geometry deliberately mirrors the existing card badges (the Sale / New Arrival
 * tag and the % OFF tag): same pill radius, same padding, same uppercase weight.
 * Only the colour differs — those badges are promotional gradients, and reusing
 * one to say "you cannot buy this" would read as an offer. Solid neutral
 * charcoal instead, which is already the palette's "informational" register.
 *
 * Positioned bottom-right by default: top-left is the special tag, top-right the
 * wishlist control, bottom-left the compare toggle (or the discount badge), so
 * that corner is the one free of collisions on every card in the app.
 *
 * Purely decorative with respect to interaction — `pointerEvents: none` so it
 * can never intercept the card's click. An out-of-stock product's page stays
 * reachable, which is the point: that page is where sizes, restock and related
 * items live.
 */
const OutOfStockBadge = ({ product, compact = false, position }) => {
    if (totalStock(product) > 0) return null;

    const inset = compact ? '0.625rem' : '0.75rem';

    return (
        <span
            className="absolute uppercase text-white"
            style={{
                bottom: inset,
                right: inset,
                ...position,
                fontSize: compact ? '0.6rem' : '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                padding: compact ? '0.25rem 0.6rem' : '0.3rem 0.75rem',
                borderRadius: '999px',
                backgroundColor: 'rgba(31, 41, 55, 0.92)',
                backdropFilter: 'blur(2px)',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 3,
            }}
        >
            Out of Stock
        </span>
    );
};

export default OutOfStockBadge;
