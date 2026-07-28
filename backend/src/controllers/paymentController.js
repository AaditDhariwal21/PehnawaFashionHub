import squareClient, { getLocationId } from "../services/squareClient.js";
import Product from "../models/Products.js";
import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import { getShippingRate } from "../services/shippingService.js";
import { findVariant } from "../utils/variants.js";
import PromoRedemption from "../models/PromoRedemption.js";
import {
    validatePromoForCart,
    reservePromoCode,
    releasePromoReservation,
    confirmPromoRedemption,
    toPromoLineItem,
} from "../services/promoService.js";
import {
    claimPendingOrder,
    findOrderBySquareOrderId,
    isDuplicateSquareOrderError,
    releasePendingOrderClaim,
    restoreStock,
    waitForOrderBySquareOrderId,
} from "../services/orderCreation.js";
import crypto from "crypto";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/* ══════════════════════════════════════════════════════════════
   POST /api/payments/create-checkout
   ══════════════════════════════════════════════════════════════ */
export const createCheckoutSession = async (req, res) => {
    /* Hoisted out of the try so the catch below can hand a claimed promo slot
       back if anything after the reservation fails. */
    let reservation = null;

    try {
        const {
            cartItems,
            shippingAddress,
            promoCode,
        } = req.body;

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty." });
        }
        if (!shippingAddress) {
            return res.status(400).json({ success: false, message: "Shipping address is required." });
        }

        /* ── 1. Resolve variants & recalculate subtotal server-side ── */
        const lineItems = [];
        let subtotal = 0;
        let totalWeightLbs = 0;
        const pendingCartItems = [];
        const promoLineItems = [];

        for (const ci of cartItems) {
            const product = await Product.findById(ci.productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found: ${ci.productId}`,
                });
            }

            const qty = Number(ci.quantity) || 1;
            const color = ci.color || "";
            const size = ci.size || "";

            const variant = findVariant(product, color, size);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Variant ${color || "?"} / ${size || "?"} not available for "${product.name}".`,
                });
            }
            if (variant.stock < qty) {
                return res.status(400).json({
                    success: false,
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
                image: ci.image || (product.images?.[0]?.url ?? ""),
                color,
                size,
                quantity: qty,
            });

            /* Promo scoping and discount maths run on server-resolved variant
               prices, gathered here so the promo service doesn't have to
               re-query every product. */
            promoLineItems.push(toPromoLineItem(product, variant.price, qty));
        }

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
           becomes able to *pay* the discounted amount. Reserving any later
           would let an over-subscribed code issue discounted payment links to
           more customers than it has uses, and charging them a discount they
           weren't entitled to is a refund liability. */
        let discountAmount = 0;
        let promoDetails = null;

        if (promoCode) {
            const validation = await validatePromoForCart({
                code: promoCode,
                userId: req.user.id,
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
                userId: req.user.id,
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

        const idempotencyKey = crypto.randomUUID();

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

        const response = await squareClient.checkout.paymentLinks.create({
            idempotencyKey,
            order: squareOrder,
            checkoutOptions: {
                redirectUrl: `${FRONTEND_URL}/order-confirmation`,
                askForShippingAddress: false,
            },
        });

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
        await PendingOrder.create({
            userId: req.user.id,
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
        });
    } catch (error) {
        console.error("createCheckoutSession error:", error);

        /* A claimed promo slot must not outlive a checkout that failed to
           reach the customer — otherwise a limited code bleeds uses on every
           Square or database error. */
        if (reservation) {
            try {
                await releasePromoReservation({ redemptionId: reservation._id });
            } catch (releaseErr) {
                console.error("createCheckoutSession promo release error:", releaseErr);
            }
        }

        return res.status(500).json({
            success: false,
            message: "Server error creating checkout session.",
            error: error.message,
        });
    }
};

/* ══════════════════════════════════════════════════════════════
   Helper: Atomic stock deduction with race-condition protection.
   Returns true if ALL items were successfully deducted.
   On failure, rolls back any items already deducted.
   ══════════════════════════════════════════════════════════════ */
const deductStockAtomically = async (resolved) => {
    const deducted = []; // track successful deductions for rollback

    for (const r of resolved) {
        const result = await Product.updateOne(
            {
                _id: r.product._id,
                variants: {
                    $elemMatch: {
                        color: r.color,
                        size: r.size,
                        stock: { $gte: r.qty },
                    },
                },
            },
            { $inc: { "variants.$.stock": -r.qty } }
        );

        if (result.modifiedCount === 0) {
            for (const d of deducted) {
                await Product.updateOne(
                    {
                        _id: d.productId,
                        variants: { $elemMatch: { color: d.color, size: d.size } },
                    },
                    { $inc: { "variants.$.stock": d.qty } }
                );
            }
            return {
                success: false,
                failedProduct: r.product.name,
                failedColor: r.color,
                failedSize: r.size,
            };
        }

        deducted.push({ productId: r.product._id, color: r.color, size: r.size, qty: r.qty });
    }

    return { success: true };
};

/* ══════════════════════════════════════════════════════════════
   POST /api/orders/verify-square-payment
   POST /api/orders/confirm-square-payment
   POST /api/payments/confirm

   Square Payment Links do NOT append query params to the
   redirect URL. The frontend passes squareOrderId (stored in
   sessionStorage before redirect) for precise lookup. Falls
   back to most-recent-for-user if not provided.
   ══════════════════════════════════════════════════════════════ */
export const confirmPayment = async (req, res) => {
    try {
        const { squareOrderId: clientSquareOrderId } = req.body || {};

        /* ── 1. Find the pending order — prefer exact match ── */
        let pending;
        if (clientSquareOrderId) {
            pending = await PendingOrder.findOne({
                userId: req.user.id,
                squareOrderId: clientSquareOrderId,
            });
        }
        if (!pending) {
            /* Fallback: most recent for this user */
            pending = await PendingOrder.findOne({ userId: req.user.id })
                .sort({ createdAt: -1 });
        }

        if (!pending) {
            return res.status(404).json({
                success: false,
                message: "No pending checkout found. The session may have expired.",
            });
        }

        /* ── 2. Idempotency: check if order already created for this Square order ── */
        const existingOrder = await findOrderBySquareOrderId(pending.squareOrderId);
        if (existingOrder) {
            await PendingOrder.deleteOne({ _id: pending._id });
            return res.json({ success: true, order: existingOrder });
        }

        /* ── 2b. Take the processing lease before doing any real work ──
           The check above is not sufficient on its own: the Square webhooks fire
           for this same payment at roughly the moment the customer is redirected
           here, and everything between that check and Order.create takes long
           enough for two triggers to both pass it. Claiming here means the loser
           stops before making a Square call or touching stock. */
        const claimed = await claimPendingOrder(pending._id);
        if (!claimed) {
            /* Another trigger is mid-flight. Give it a moment and return the
               order it creates, so losing the race is invisible to the customer. */
            const order = await waitForOrderBySquareOrderId(pending.squareOrderId);
            if (order) {
                await PendingOrder.deleteOne({ _id: pending._id });
                return res.json({ success: true, order });
            }
            return res.status(409).json({
                success: false,
                code: "ORDER_IN_PROGRESS",
                message: "Your payment is still being processed. This will update shortly.",
            });
        }

        /* ── 3. Verify payment with Square API ── */
        let squareOrderResponse;
        try {
            squareOrderResponse = await squareClient.orders.get({
                orderId: pending.squareOrderId,
            });
        } catch (sqErr) {
            console.error("Square order fetch error:", sqErr);
            /* Transient — release the lease so the retry this implies isn't
               blocked waiting for it to expire. */
            await releasePendingOrderClaim(pending._id);
            return res.status(500).json({
                success: false,
                message: "Unable to verify payment with Square.",
            });
        }

        const squareOrder = squareOrderResponse.order;
        const tenders = squareOrder?.tenders || [];

        if (tenders.length === 0) {
            /* This response explicitly asks the customer to try again, so the
               lease must not still be held when they do. */
            await releasePendingOrderClaim(pending._id);
            return res.status(400).json({
                success: false,
                message: "Payment has not been completed yet. Please try again.",
            });
        }

        /* ── 4. Verify paid amount matches expected total ── */
        const paidAmountCents = Number(squareOrder.totalMoney?.amount ?? 0);
        const expectedCents = Math.round(pending.totalAmount * 100);

        if (Math.abs(paidAmountCents - expectedCents) > 1) {
            console.error(
                `[confirmPayment] Amount mismatch: Square charged ${paidAmountCents}¢, expected ${expectedCents}¢ (order ${pending.squareOrderId})`
            );
            return res.status(400).json({
                success: false,
                message: "Payment amount does not match order total. Please contact support.",
            });
        }

        /* ── 5. Resolve products + variant prices ── */
        const resolved = [];

        for (const ci of pending.cartItems) {
            const product = await Product.findById(ci.productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found: ${ci.productId}`,
                });
            }

            const variant = findVariant(product, ci.color, ci.size);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Variant ${ci.color} / ${ci.size} no longer exists for "${product.name}".`,
                });
            }

            resolved.push({
                product,
                qty: ci.quantity,
                price: variant.price,
                image: ci.image,
                color: ci.color || "",
                size: ci.size || "",
            });
        }

        /* ── 6. Deduct stock atomically (race-condition safe) ── */
        const stockResult = await deductStockAtomically(resolved);
        if (!stockResult.success) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock for "${stockResult.failedProduct}" (${stockResult.failedColor} / ${stockResult.failedSize}). It may have just sold out.`,
            });
        }

        /* ── 7. Create the order ── */
        const orderItems = resolved.map((r) => ({
            productId: r.product._id,
            name: r.product.name,
            image: r.image,
            color: r.color,
            size: r.size,
            price: r.price,
            quantity: r.qty,
        }));

        const squarePaymentId = tenders[0]?.id || "";

        let order;
        try {
            order = await Order.create({
                user: req.user.id,
                items: orderItems,
                shippingAddress: pending.shippingAddress,
                paymentMethod: "Square",
                paymentResult: {
                    squareOrderId: pending.squareOrderId,
                    squarePaymentId,
                    status: "COMPLETED",
                },
                subtotal: pending.subtotal,
                discountAmount: pending.discountAmount || 0,
                promo: pending.promo?.code ? pending.promo : undefined,
                shippingCost: pending.shippingCost,
                totalAmount: pending.totalAmount,
                orderStatus: "Paid",
                isPaid: true,
                paidAt: new Date(),
            });
        } catch (createErr) {
            /* Whatever went wrong, stock has been deducted for an order that
               does not exist. Give it back first. */
            await restoreStock(resolved);

            /* Backstop fired: the unique index on paymentResult.squareOrderId
               rejected this insert because another trigger got there first,
               despite the lease. Return the order that did win.

               Deliberately narrow — a collision on the other unique index
               (orderId) is a real fault, not a duplicate payment, and must not
               be reported to the customer as "already processing" when no order
               exists. Letting it throw surfaces it and lets the retry succeed
               with a freshly generated id. */
            if (isDuplicateSquareOrderError(createErr)) {
                const winner = await findOrderBySquareOrderId(pending.squareOrderId);
                await PendingOrder.deleteOne({ _id: pending._id });
                if (winner) {
                    return res.json({ success: true, order: winner });
                }
                return res.status(409).json({
                    success: false,
                    code: "ORDER_IN_PROGRESS",
                    message: "Your payment is still being processed. This will update shortly.",
                });
            }

            /* Release the lease so the customer's retry isn't blocked. */
            await releasePendingOrderClaim(pending._id);
            throw createErr;
        }

        /* ── 8. Promote the promo reservation to a confirmed redemption.
           Idempotent, because the Square webhook races this handler for the
           same order — whichever arrives second is a no-op. */
        await confirmPromoRedemption({
            squareOrderId: pending.squareOrderId,
            orderId: order._id,
        });

        /* ── 9. Clean up pending order ── */
        await PendingOrder.deleteOne({ _id: pending._id });

        return res.status(201).json({ success: true, order });
    } catch (error) {
        console.error("confirmPayment error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error confirming payment.",
            error: error.message,
        });
    }
};
