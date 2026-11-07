import squareClient, { getLocationId } from "../services/squareClient.js";
import Product from "../models/Products.js";
import PendingOrder from "../models/PendingOrder.js";
import { getShippingRate } from "../services/shippingService.js";
import { findVariant, variantImage } from "../utils/variants.js";
import PromoRedemption from "../models/PromoRedemption.js";
import {
    validatePromoForCart,
    reservePromoCode,
    releasePromoReservation,
    toPromoLineItem,
    normalizeCode,
} from "../services/promoService.js";
import {
    finalizePendingOrder,
    findOrderBySquareOrderId,
    waitForOrderBySquareOrderId,
} from "../services/orderCreation.js";
import {
    validateCartItems,
    validateShippingAddress,
    validateEmail,
    validateCheckoutAttemptId,
    validatePromoCodeInput,
    fingerprint,
} from "../utils/checkoutValidation.js";
import { generateGuestToken, hashGuestToken } from "../utils/guestAccess.js";
import crypto from "crypto";

/* Read per request rather than at import time: ES module imports are
   evaluated before index.js runs its own body, so a module-level read could
   see the variable before .env has been loaded. */
const frontendUrl = () => process.env.FRONTEND_URL || "http://localhost:5173";

const validationError = (res, result, code = "VALIDATION_ERROR") =>
    res.status(400).json({
        success: false,
        code,
        ...(result.field ? { field: result.field } : {}),
        message: result.message,
    });

const summaryOf = (doc) => ({
    subtotal: doc.subtotal,
    discountAmount: doc.discountAmount || 0,
    shippingCost: doc.shippingCost,
    totalAmount: doc.totalAmount,
    promoCode: doc.promo?.code ?? null,
});

/**
 * Answer a create-checkout request whose checkoutAttemptId was seen before —
 * a retry after a network failure, a double-submit, a back-button return from
 * Square. The customer gets the payment link they already have instead of a
 * second one, so they cannot end up with two payable links (and two charges)
 * for one intended order.
 *
 * Only an identical request from the same owner is replayed. Anything else
 * means the client reused a key for a different checkout and must start a new
 * attempt.
 */
const replayCheckout = async (existing, { guest, ownerUserId, requestFingerprint }) => {
    const sameOwner = guest
        ? existing.isGuest === true
        : !!existing.userId && existing.userId.toString() === ownerUserId;

    if (!sameOwner || existing.requestFingerprint !== requestFingerprint) {
        return {
            status: 409,
            body: {
                success: false,
                code: "CHECKOUT_CHANGED",
                message: "Your checkout details changed. Please press Pay again.",
            },
        };
    }

    if (existing.linkDeactivatedAt || !existing.checkoutUrl) {
        return {
            status: 409,
            body: {
                success: false,
                code: "CHECKOUT_EXPIRED",
                message: "This checkout session expired. Please press Pay again.",
            },
        };
    }

    if (await findOrderBySquareOrderId(existing.squareOrderId)) {
        return {
            status: 409,
            body: {
                success: false,
                code: "ORDER_ALREADY_PLACED",
                message: "This order has already been paid for.",
            },
        };
    }

    const body = {
        success: true,
        checkoutUrl: existing.checkoutUrl,
        squareOrderId: existing.squareOrderId,
        summary: summaryOf(existing),
    };

    /* The guest's original token was in the response that never arrived (or
       is held by another tab). Issue a fresh one; only the latest works. */
    if (guest) {
        const guestToken = generateGuestToken();
        await PendingOrder.updateOne(
            { _id: existing._id },
            { $set: { "guest.accessTokenHash": hashGuestToken(guestToken) } }
        );
        body.guestToken = guestToken;
    }

    return { status: 200, body };
};

/**
 * Another request with the same checkoutAttemptId is creating this checkout
 * right now (a double tap that arrived simultaneously). Wait briefly for its
 * record to appear and answer as a replay of it, so the customer sees one
 * checkout rather than an error.
 */
const replayWhenAvailable = async (attemptId, ctx) => {
    for (let i = 0; i < 20; i += 1) {
        const winner = await PendingOrder.findOne({ checkoutAttemptId: attemptId });
        if (winner) return replayCheckout(winner, ctx);
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
        status: 409,
        body: {
            success: false,
            code: "CHECKOUT_IN_PROGRESS",
            message: "Your checkout is already being prepared. Please wait a moment and try again.",
        },
    };
};

/** Square refused because an identical request is still in flight. */
const isSquareIdempotencyInFlight = (error) =>
    (error?.errors || error?.body?.errors || []).some((e) => e?.code === "IDEMPOTENCY_KEY_REUSED");

/* ══════════════════════════════════════════════════════════════
   POST /api/payments/create-checkout        (signed-in customer)
   POST /api/payments/guest/create-checkout  (guest; req.guestCheckout set
                                              by prepareGuestCheckout)
   ══════════════════════════════════════════════════════════════ */
export const createCheckoutSession = async (req, res) => {
    /* Hoisted out of the try so the catch below can hand a claimed promo slot
       back if anything after the reservation fails. */
    let reservation = null;

    const guest = req.guestCheckout || null;
    const ownerUserId = guest ? null : req.user.id;

    try {
        const body = req.body || {};

        /* ── 0. Validate and whitelist every input. Nothing below reads
               req.body directly. ── */
        const cart = validateCartItems(body.cartItems);
        if (!cart.ok) return validationError(res, cart);

        const address = validateShippingAddress(body.shippingAddress);
        if (!address.ok) return validationError(res, address);

        const attempt = validateCheckoutAttemptId(body.checkoutAttemptId);
        if (!attempt.ok) return validationError(res, attempt);

        const promoInput = validatePromoCodeInput(body.promoCode);
        if (!promoInput.ok) return validationError(res, promoInput);
        const promoCode = promoInput.value;

        /* Contact email: the guest's is required (prepareGuestCheckout). An
           account customer's is pre-filled with the account email and may be
           changed for this order; absent, the account email is used. */
        let contactEmail = guest?.email ?? null;
        if (!guest) {
            const provided = body.contactEmail;
            if (provided !== undefined && provided !== null && provided !== "") {
                const email = validateEmail(provided, { field: "contactEmail" });
                if (!email.ok) return validationError(res, email);
                contactEmail = email.value;
            } else {
                const fallback = validateEmail(req.user.email);
                contactEmail = fallback.ok ? fallback.value : null;
            }
        }

        const source = body.checkoutSource === "buyNow" ? "buyNow" : "cart";

        const requestFingerprint = fingerprint({
            owner: guest ? `guest:${guest.emailKey}` : `user:${ownerUserId}`,
            items: cart.value,
            address: address.value,
            contactEmail,
            promo: promoCode ? normalizeCode(promoCode) : null,
            source,
        });

        /* ── Idempotent replay ── */
        if (attempt.value) {
            const existing = await PendingOrder.findOne({ checkoutAttemptId: attempt.value });
            if (existing) {
                const replay = await replayCheckout(existing, { guest, ownerUserId, requestFingerprint });
                return res.status(replay.status).json(replay.body);
            }
        }

        /* ── 1. Resolve variants & recalculate subtotal server-side ── */
        const lineItems = [];
        let subtotal = 0;
        let totalWeightLbs = 0;
        const pendingCartItems = [];
        const promoLineItems = [];

        for (const ci of cart.value) {
            const product = await Product.findById(ci.productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    code: "PRODUCT_UNAVAILABLE",
                    message: "An item in your cart is no longer available. Please remove it and try again.",
                });
            }

            const qty = ci.quantity;
            const { color, size } = ci;

            const variant = findVariant(product, color, size);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    code: "VARIANT_UNAVAILABLE",
                    message: `Variant ${color || "?"} / ${size || "?"} not available for "${product.name}".`,
                });
            }
            if (variant.stock < qty) {
                return res.status(400).json({
                    success: false,
                    code: "INSUFFICIENT_STOCK",
                    message: variant.stock === 0
                        ? `"${product.name}" (${color} / ${size}) is out of stock.`
                        : `Insufficient stock for "${product.name}" (${color} / ${size}). Available: ${variant.stock}, Requested: ${qty}`,
                });
            }

            subtotal += variant.price * qty;
            totalWeightLbs += (product.weight || 0) * qty;

            lineItems.push({
                name: `${product.name}${color ? ` — ${color}` : ""}${size ? ` (${size})` : ""}`,
                quantity: String(qty),
                basePriceMoney: {
                    amount: BigInt(Math.round(variant.price * 100)),
                    currency: "USD",
                },
            });

            pendingCartItems.push({
                productId: product._id,
                image: variantImage(product, color),
                color,
                size,
                quantity: qty,
            });

            /* Promo scoping and discount maths run on server-resolved variant
               prices, gathered here so the promo service doesn't have to
               re-query every product. */
            promoLineItems.push(toPromoLineItem(product, variant.price, qty));
        }

        subtotal = Math.round(subtotal * 100) / 100;
        const shippingAddress = address.value;

        /* ── 2. Calculate shipping server-side (never trust client) ── */
        const shippingResult = await getShippingRate(
            {
                name: shippingAddress.fullName,
                phone: shippingAddress.phone,
                address: shippingAddress.addressLine1,
                city: shippingAddress.city,
                state: shippingAddress.state,
                zip: shippingAddress.zipCode,
            },
            totalWeightLbs
        );
        const SHIPPING = shippingResult.shippingCost;

        /* ── 3. Add shipping as a line item ── */
        lineItems.push({
            name: "Shipping",
            quantity: "1",
            basePriceMoney: {
                amount: BigInt(Math.round(SHIPPING * 100)),
                currency: "USD",
            },
        });

        /* ── 4. Re-validate the promo code and claim a usage slot ──
           The "Apply" check in the UI was advisory only: the cart may have
           changed since, so the rules are re-run here from scratch against
           server-resolved prices. This is also where the slot is consumed —
           not at order creation — because this is the moment a customer
           becomes able to *pay* the discounted amount. A guest's per-customer
           limits apply to their checkout email. */
        let discountAmount = 0;
        let promoDetails = null;

        if (promoCode) {
            const validation = await validatePromoForCart({
                code: promoCode,
                userId: ownerUserId,
                guestEmail: guest?.email ?? null,
                lineItems: promoLineItems,
            });

            if (!validation.ok) {
                return res.status(400).json({
                    success: false,
                    code: validation.code,
                    message: validation.message,
                });
            }

            const reserved = await reservePromoCode({
                promo: validation.promo,
                userId: ownerUserId,
                guestEmail: guest?.email ?? null,
                discountAmount: validation.discountAmount,
                squareOrderId: null,
            });

            if (!reserved.ok) {
                return res.status(400).json({
                    success: false,
                    code: reserved.code,
                    message: reserved.message,
                });
            }

            reservation = reserved.redemption;
            discountAmount = validation.discountAmount;
            promoDetails = {
                promoCodeId: validation.promo._id,
                code: validation.promo.code,
                discountType: validation.promo.discountType,
            };
        }

        const totalAmount = Math.round((subtotal - discountAmount + SHIPPING) * 100) / 100;

        /* The discount is capped at the eligible subtotal, so shipping always
           remains payable and this can't reach zero — but a payment link for
           $0 would be rejected by Square, so fail loudly rather than sending
           a malformed order. */
        if (totalAmount <= 0) {
            if (reservation) await releasePromoReservation({ redemptionId: reservation._id });
            return res.status(400).json({
                success: false,
                message: "Order total must be greater than zero.",
            });
        }

        /* Derived from the client's attempt id when there is one, so even a
           request that slips past the replay check (two arriving at once) asks
           Square for the same link rather than a second one. */
        const idempotencyKey = attempt.value
            ? crypto.createHash("sha256").update(`pehnawa-checkout:${attempt.value}`).digest("hex").slice(0, 45)
            : crypto.randomUUID();

        /* ── 5. Create Square payment link ──
           The discount goes to Square as an order-level fixed amount rather
           than a percentage, so Square charges exactly the figure computed
           above. It must be represented here: the confirmation and webhook
           paths both assert that the amount Square captured equals
           PendingOrder.totalAmount, and would otherwise reject every
           discounted order. */
        const squareOrder = {
            locationId: await getLocationId(),
            lineItems,
        };

        if (discountAmount > 0) {
            squareOrder.discounts = [
                {
                    uid: "PROMO",
                    name: `Promo ${promoDetails.code}`,
                    amountMoney: {
                        amount: BigInt(Math.round(discountAmount * 100)),
                        currency: "USD",
                    },
                    scope: "ORDER",
                },
            ];
        }

        let response;
        try {
            response = await squareClient.checkout.paymentLinks.create({
                idempotencyKey,
                order: squareOrder,
                checkoutOptions: {
                    redirectUrl: `${frontendUrl()}/order-confirmation`,
                    askForShippingAddress: false,
                },
            });
        } catch (squareErr) {
            if (!attempt.value || !isSquareIdempotencyInFlight(squareErr)) throw squareErr;
            if (reservation) await releasePromoReservation({ redemptionId: reservation._id });
            reservation = null;
            const replay = await replayWhenAvailable(attempt.value, { guest, ownerUserId, requestFingerprint });
            return res.status(replay.status).json(replay.body);
        }

        const paymentLink = response.paymentLink;

        if (!paymentLink?.url) {
            if (reservation) await releasePromoReservation({ redemptionId: reservation._id });
            return res.status(500).json({
                success: false,
                message: "Failed to create Square checkout session.",
            });
        }

        /* Bind the reservation to the Square order now that we have its id —
           this is the key that lets the confirmation and webhook paths find
           and confirm it later. */
        if (reservation) {
            await PromoRedemption.updateOne(
                { _id: reservation._id },
                { $set: { squareOrderId: paymentLink.orderId } }
            );
        }

        /* ── 6. Store pending order for later confirmation ── */
        const guestToken = guest ? generateGuestToken() : null;

        try {
            await PendingOrder.create({
                ...(guest ? {} : { userId: ownerUserId }),
                isGuest: !!guest,
                ...(contactEmail ? { contactEmail } : {}),
                ...(guest
                    ? { guest: { emailKey: guest.emailKey, accessTokenHash: hashGuestToken(guestToken) } }
                    : {}),
                ...(attempt.value ? { checkoutAttemptId: attempt.value } : {}),
                requestFingerprint,
                checkoutUrl: paymentLink.url,
                source,
                paymentLinkId: paymentLink.id,
                squareOrderId: paymentLink.orderId,
                cartItems: pendingCartItems,
                shippingAddress,
                subtotal,
                discountAmount,
                promo: promoDetails ?? undefined,
                shippingCost: SHIPPING,
                totalAmount,
            });
        } catch (createErr) {
            /* Two identical requests raced past the replay check and both
               reached this insert. Square's idempotency key gave both the same
               link, so whichever unique index caught it (the attempt id or the
               payment link id), the winner's record already describes this
               checkout: hand back our duplicate promo slot and replay it. */
            const collidedOn = Object.keys(createErr?.keyPattern ?? {});
            const isAttemptCollision = createErr?.code === 11000 && attempt.value
                && (collidedOn.includes("checkoutAttemptId") || collidedOn.includes("paymentLinkId"));
            if (!isAttemptCollision) throw createErr;

            if (reservation) await releasePromoReservation({ redemptionId: reservation._id });
            reservation = null;

            const replay = await replayWhenAvailable(attempt.value, { guest, ownerUserId, requestFingerprint });
            return res.status(replay.status).json(replay.body);
        }

        return res.json({
            success: true,
            checkoutUrl: paymentLink.url,
            squareOrderId: paymentLink.orderId,
            /* Server-computed breakdown — the authoritative figures the
               customer is about to be charged. */
            summary: {
                subtotal,
                discountAmount,
                shippingCost: SHIPPING,
                totalAmount,
                promoCode: promoDetails?.code ?? null,
            },
            /* Guest only: the private token that proves this order is theirs.
               Returned once, never stored in plain form. */
            ...(guestToken ? { guestToken } : {}),
        });
    } catch (error) {
        console.error("createCheckoutSession error:", error?.message || error);

        /* A claimed promo slot must not outlive a checkout that failed to
           reach the customer — otherwise a limited code bleeds uses on every
           Square or database error. */
        if (reservation) {
            try {
                await releasePromoReservation({ redemptionId: reservation._id });
            } catch (releaseErr) {
                console.error("createCheckoutSession promo release error:", releaseErr?.message);
            }
        }

        return res.status(500).json({
            success: false,
            message: "Server error creating checkout session.",
        });
    }
};

/* ══════════════════════════════════════════════════════════════
   POST /api/orders/verify-square-payment
   POST /api/orders/confirm-square-payment
   POST /api/payments/confirm
   POST /api/orders/guest/confirm   (guest; owner = private token)

   Square Payment Links do NOT append query params to the
   redirect URL. The frontend passes squareOrderId (stored before
   the redirect) for precise lookup. Falls back to the owner's
   most recent checkout if not provided.

   The actual work — verifying the payment with Square and
   creating the order — is finalizePendingOrder(), shared with the
   webhook and the sweeper. This handler only finds the checkout
   and translates the outcome into an HTTP response.
   ══════════════════════════════════════════════════════════════ */
export const confirmPayment = async (req, res) => {
    /* Guests get the whitelisted view of their order; account customers get
       the order document, exactly as before. */
    const present = req.presentOrder || ((order) => order);

    try {
        const rawSquareOrderId = req.body?.squareOrderId;
        const clientSquareOrderId = typeof rawSquareOrderId === "string" && rawSquareOrderId.length <= 64
            ? rawSquareOrderId
            : null;

        const ownerFilter = req.guestPendingFilter || { userId: req.user.id };

        /* ── 1. Find the pending order — prefer exact match ── */
        let pending = null;
        if (clientSquareOrderId) {
            pending = await PendingOrder.findOne({ ...ownerFilter, squareOrderId: clientSquareOrderId })
                .select("+guest.accessTokenHash");
        }
        if (!pending) {
            /* Fallback: most recent for this owner */
            pending = await PendingOrder.findOne(ownerFilter)
                .sort({ createdAt: -1 })
                .select("+guest.accessTokenHash");
        }

        if (!pending) {
            return res.status(404).json({
                success: false,
                message: "No pending checkout found. The session may have expired.",
            });
        }

        const result = await finalizePendingOrder(pending, { trigger: "confirm" });

        switch (result.outcome) {
            case "created":
                return res.status(201).json({
                    success: true,
                    order: present(result.order),
                    /* Surfaced so the confirmation page could mention a delay if
                       it ever needs to; the order itself carries the detail for
                       the admin. */
                    fulfillmentHold: result.fulfillmentHold,
                });

            case "exists":
                return res.json({ success: true, order: present(result.order) });

            case "in_progress": {
                /* Another trigger is mid-flight. Give it a moment and return the
                   order it creates, so losing the race is invisible to the
                   customer. */
                const order = await waitForOrderBySquareOrderId(pending.squareOrderId);
                if (order) {
                    await PendingOrder.deleteOne({ _id: pending._id });
                    return res.json({ success: true, order: present(order) });
                }
                return res.status(409).json({
                    success: false,
                    code: "ORDER_IN_PROGRESS",
                    message: "Your payment is still being processed. This will update shortly.",
                });
            }

            case "not_paid":
                return res.status(400).json({
                    success: false,
                    code: "PAYMENT_NOT_COMPLETED",
                    message: "Payment has not been completed yet. Please try again.",
                });

            case "amount_mismatch":
                return res.status(400).json({
                    success: false,
                    message: "Payment amount does not match order total. Please contact support.",
                });

            case "square_error":
                return res.status(500).json({
                    success: false,
                    message: "Unable to verify payment with Square.",
                });

            case "product_missing":
                return res.status(404).json({ success: false, message: result.message });

            default:
                throw new Error(`Unexpected finalize outcome: ${result.outcome}`);
        }
    } catch (error) {
        console.error("confirmPayment error:", error?.message || error);
        return res.status(500).json({
            success: false,
            message: "Server error confirming payment.",
        });
    }
};
