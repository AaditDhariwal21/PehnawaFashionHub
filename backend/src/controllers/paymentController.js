import squareClient, { getLocationId } from "../services/squareClient.js";
import Product from "../models/Products.js";
import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import { getShippingRate } from "../services/shippingService.js";
import { findVariant } from "../utils/variants.js";
import crypto from "crypto";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/* ══════════════════════════════════════════════════════════════
   POST /api/payments/create-checkout
   ══════════════════════════════════════════════════════════════ */
export const createCheckoutSession = async (req, res) => {
    try {
        const {
            cartItems,
            shippingAddress,
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

        const totalAmount = subtotal + SHIPPING;
        const idempotencyKey = crypto.randomUUID();

        /* ── 4. Create Square payment link ── */
        const locationId = await getLocationId();
        const response = await squareClient.checkout.paymentLinks.create({
            idempotencyKey,
            order: {
                locationId,
                lineItems,
            },
            checkoutOptions: {
                redirectUrl: `${FRONTEND_URL}/order-confirmation`,
                askForShippingAddress: false,
            },
        });

        const paymentLink = response.paymentLink;

        if (!paymentLink?.url) {
            return res.status(500).json({
                success: false,
                message: "Failed to create Square checkout session.",
            });
        }

        /* ── 5. Store pending order for later confirmation ── */
        await PendingOrder.create({
            userId: req.user.id,
            paymentLinkId: paymentLink.id,
            squareOrderId: paymentLink.orderId,
            cartItems: pendingCartItems,
            shippingAddress,
            subtotal,
            shippingCost: SHIPPING,
            totalAmount,
        });

        return res.json({
            success: true,
            checkoutUrl: paymentLink.url,
            squareOrderId: paymentLink.orderId,
        });
    } catch (error) {
        console.error("createCheckoutSession error:", error);
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
        const existingOrder = await Order.findOne({
            "paymentResult.squareOrderId": pending.squareOrderId,
        });
        if (existingOrder) {
            await PendingOrder.deleteOne({ _id: pending._id });
            return res.json({ success: true, order: existingOrder });
        }

        /* ── 3. Verify payment with Square API ── */
        let squareOrderResponse;
        try {
            squareOrderResponse = await squareClient.orders.get({
                orderId: pending.squareOrderId,
            });
        } catch (sqErr) {
            console.error("Square order fetch error:", sqErr);
            return res.status(500).json({
                success: false,
                message: "Unable to verify payment with Square.",
            });
        }

        const squareOrder = squareOrderResponse.order;
        const tenders = squareOrder?.tenders || [];

        if (tenders.length === 0) {
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

        const order = await Order.create({
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
            shippingCost: pending.shippingCost,
            totalAmount: pending.totalAmount,
            orderStatus: "Paid",
            isPaid: true,
            paidAt: new Date(),
        });

        /* ── 8. Clean up pending order ── */
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
