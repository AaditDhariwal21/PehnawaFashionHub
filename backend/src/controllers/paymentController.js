import squareClient, { getLocationId } from "../services/squareClient.js";
import Product from "../models/Products.js";
import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import crypto from "crypto";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const DEFAULT_SHIPPING = 8;

/* ══════════════════════════════════════════════════════════════
   POST /api/payments/create-checkout
   ══════════════════════════════════════════════════════════════ */
export const createCheckoutSession = async (req, res) => {
    try {
        const {
            cartItems,
            shippingAddress,
            shippingCost: clientShippingCost,
        } = req.body;

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty." });
        }
        if (!shippingAddress) {
            return res.status(400).json({ success: false, message: "Shipping address is required." });
        }

        const SHIPPING =
            typeof clientShippingCost === "number" && clientShippingCost > 0
                ? clientShippingCost
                : DEFAULT_SHIPPING;

        /* ── 1. Resolve products & recalculate subtotal server-side ── */
        const lineItems = [];
        let subtotal = 0;
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
            const requestedSize = ci.size || "";

            /* Size-based stock validation */
            if (product.sizes && product.sizes.length > 0 && requestedSize) {
                const sizeEntry = product.sizes.find((s) => s.size === requestedSize);
                if (!sizeEntry || sizeEntry.stock < qty) {
                    return res.status(400).json({
                        success: false,
                        message: !sizeEntry
                            ? `Size "${requestedSize}" not available for "${product.name}".`
                            : sizeEntry.stock === 0
                                ? `"${product.name}" (${requestedSize}) is out of stock.`
                                : `Insufficient stock for "${product.name}" (${requestedSize}). Available: ${sizeEntry.stock}, Requested: ${qty}`,
                    });
                }
            } else if (product.totalStock != null && product.totalStock < qty) {
                return res.status(400).json({
                    success: false,
                    message: product.totalStock === 0
                        ? `"${product.name}" is out of stock.`
                        : `Insufficient stock for "${product.name}". Available: ${product.totalStock}, Requested: ${qty}`,
                });
            }

            subtotal += product.price * qty;

            lineItems.push({
                name: product.name,
                quantity: String(qty),
                basePriceMoney: {
                    amount: BigInt(Math.round(product.price * 100)),
                    currency: "USD",
                },
            });

            pendingCartItems.push({
                productId: product._id,
                image: ci.image || (product.images?.[0]?.url ?? ""),
                size: ci.size || "",
                quantity: qty,
            });
        }

        /* ── 2. Add shipping as a line item ── */
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

        /* ── 3. Create Square payment link ── */
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

        /* ── 4. Store pending order for later confirmation ── */
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
   POST /api/orders/verify-square-payment
   POST /api/orders/confirm-square-payment
   POST /api/payments/confirm

   Square Payment Links do NOT append query params to the
   redirect URL. Instead, the backend looks up the most recent
   PendingOrder for the authenticated user and verifies
   payment by checking for tenders on the Square order.
   ══════════════════════════════════════════════════════════════ */
export const confirmPayment = async (req, res) => {
    try {
        /* ── 1. Find the most recent pending order for this user ── */
        const pending = await PendingOrder.findOne({ userId: req.user.id })
            .sort({ createdAt: -1 });

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
            /* Already confirmed — just return the existing order */
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

        /*
         * Square SDK returns { order: { state, tenders, ... } }
         * Checkout orders remain in "OPEN" state after payment.
         * A successful payment attaches a "tender" to the order.
         */
        const squareOrder = squareOrderResponse.order;
        const tenders = squareOrder?.tenders || [];

        if (tenders.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Payment has not been completed yet. Please try again.",
            });
        }

        /* ── 4. Validate stock & resolve products ── */
        const resolved = [];

        for (const ci of pending.cartItems) {
            const product = await Product.findById(ci.productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found: ${ci.productId}`,
                });
            }

            const requestedSize = ci.size || "";

            if (product.sizes && product.sizes.length > 0 && requestedSize) {
                const sizeEntry = product.sizes.find((s) => s.size === requestedSize);
                if (!sizeEntry || sizeEntry.stock < ci.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for "${product.name}" (${requestedSize}).`,
                    });
                }
            } else if (product.totalStock != null && product.totalStock < ci.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${product.name}".`,
                });
            }

            resolved.push({
                product,
                qty: ci.quantity,
                image: ci.image,
                size: requestedSize,
            });
        }

        /* ── 5. Deduct stock per size atomically ── */
        for (const r of resolved) {
            if (r.product.sizes && r.product.sizes.length > 0 && r.size) {
                await Product.updateOne(
                    { _id: r.product._id, "sizes.size": r.size },
                    { $inc: { "sizes.$.stock": -r.qty, totalStock: -r.qty } }
                );
            } else if (r.product.totalStock != null) {
                await Product.updateOne(
                    { _id: r.product._id },
                    { $inc: { totalStock: -r.qty } }
                );
            }
        }

        /* ── 6. Create the order ── */
        const orderItems = resolved.map((r) => ({
            productId: r.product._id,
            name: r.product.name,
            image: r.image,
            size: r.size,
            price: r.product.price,
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

        /* ── 7. Clean up pending order ── */
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
