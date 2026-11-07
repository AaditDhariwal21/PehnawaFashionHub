import { isGuestCheckoutEnabled } from "../middlewares/GuestCheckoutMiddleware.js";

/**
 * GET /api/config
 *
 * Public, non-secret settings the storefront needs to know at runtime. This is
 * what makes GUEST_CHECKOUT_ENABLED (set on Render) the ONE switch for guest
 * checkout: the frontend asks here instead of carrying its own copy of the
 * flag baked in at build time, so turning the feature on or off takes effect
 * as soon as Render restarts the service — no Vercel rebuild, and the two
 * sides can never disagree.
 *
 * Only ever add values that are safe for anyone to read.
 */
export const getPublicConfig = (req, res) => {
    /* Always fresh: a cached "on" must not outlive the switch being turned off. */
    res.set("Cache-Control", "no-store");
    return res.json({
        success: true,
        config: {
            guestCheckoutEnabled: isGuestCheckoutEnabled(),
        },
    });
};
