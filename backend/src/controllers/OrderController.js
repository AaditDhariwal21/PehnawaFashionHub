import Order from "../models/Order.js";
import Product from "../models/Products.js";

const DEFAULT_SHIPPING_COST = 8;

/* ────────────────────────── 1. Create Order ────────────────────────── */
export const createOrder = async (req, res) => {
    try {
        const { items, shippingAddress, shippingCost: clientShippingCost } = req.body;
        const SHIPPING_COST =
            typeof clientShippingCost === "number" && clientShippingCost > 0
                ? clientShippingCost
                : DEFAULT_SHIPPING_COST;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: "No order items provided." });
        }
        if (!shippingAddress) {
            return res.status(400).json({ success: false, message: "Shipping address is required." });
        }

        /* ── Phase 1: Validate every product exists & has enough stock for the requested size ── */
        const resolved = []; // { product, qty, serverPrice }
        let subtotal = 0;

        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found: ${item.productId}`,
                });
            }

            const qty = Number(item.quantity) || 1;
            const requestedSize = item.size || "";

            /* Size-based stock validation */
            if (product.sizes && product.sizes.length > 0 && requestedSize) {
                const sizeEntry = product.sizes.find((s) => s.size === requestedSize);
                if (!sizeEntry) {
                    return res.status(400).json({
                        success: false,
                        message: `Size "${requestedSize}" is not available for "${product.name}".`,
                    });
                }
                if (sizeEntry.stock < qty) {
                    return res.status(400).json({
                        success: false,
                        message: sizeEntry.stock === 0
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

            resolved.push({
                product,
                qty,
                serverPrice: product.price,
                image: item.image || (product.images?.[0]?.url ?? ""),
                size: requestedSize,
            });

            subtotal += product.price * qty;
        }

        /* ── Phase 2: Deduct stock atomically (race-condition safe) ── */
        const deducted = [];

        for (const r of resolved) {
            let result;

            if (r.product.sizes && r.product.sizes.length > 0 && r.size) {
                result = await Product.updateOne(
                    {
                        _id: r.product._id,
                        sizes: { $elemMatch: { size: r.size, stock: { $gte: r.qty } } },
                    },
                    { $inc: { "sizes.$.stock": -r.qty, totalStock: -r.qty } }
                );
            } else if (r.product.totalStock != null) {
                result = await Product.updateOne(
                    { _id: r.product._id, totalStock: { $gte: r.qty } },
                    { $inc: { totalStock: -r.qty } }
                );
            } else {
                continue;
            }

            if (result.modifiedCount === 0) {
                /* Rollback previously deducted items */
                for (const d of deducted) {
                    if (d.size) {
                        await Product.updateOne(
                            { _id: d.productId, "sizes.size": d.size },
                            { $inc: { "sizes.$.stock": d.qty, totalStock: d.qty } }
                        );
                    } else {
                        await Product.updateOne(
                            { _id: d.productId },
                            { $inc: { totalStock: d.qty } }
                        );
                    }
                }
                const sizeLabel = r.size ? ` (${r.size})` : "";
                return res.status(400).json({
                    success: false,
                    message: `"${r.product.name}"${sizeLabel} just sold out. Please refresh and try again.`,
                });
            }

            deducted.push({ productId: r.product._id, size: r.size, qty: r.qty });
        }

        /* ── Phase 3: Build order items array ── */
        const orderItems = resolved.map((r) => ({
            productId: r.product._id,
            name: r.product.name,
            image: r.image,
            size: r.size,
            price: r.serverPrice,
            quantity: r.qty,
        }));

        const totalAmount = subtotal + SHIPPING_COST;

        /* ── Phase 4: Create order with Paid status ── */
        const order = await Order.create({
            user: req.user.id,
            items: orderItems,
            shippingAddress,
            subtotal,
            shippingCost: SHIPPING_COST,
            totalAmount,
            orderStatus: "Paid",
            isPaid: true,
            paidAt: new Date(),
        });

        return res.status(201).json({ success: true, order });
    } catch (error) {
        console.error("createOrder error:", error);
        return res.status(500).json({ success: false, message: "Server error creating order.", error: error.message });
    }
};

/* ────────────────────────── 2. Get My Orders ────────────────────────── */
export const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
        return res.json({ success: true, orders });
    } catch (error) {
        console.error("getMyOrders error:", error);
        return res.status(500).json({ success: false, message: "Server error fetching orders." });
    }
};

/* ────────────────────────── 3. Get All Orders (Admin) ────────────────────────── */
export const getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate("user", "name email")
            .sort({ createdAt: -1 });
        return res.json({ success: true, orders });
    } catch (error) {
        console.error("getAllOrders error:", error);
        return res.status(500).json({ success: false, message: "Server error fetching orders." });
    }
};

/* ────────────────────────── 4. Get Order By ID ────────────────────────── */
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate("user", "name email");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        /* Non-admin users may only view their own orders */
        if (req.user.role !== "admin" && order.user._id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorised to view this order." });
        }

        return res.json({ success: true, order });
    } catch (error) {
        console.error("getOrderById error:", error);
        return res.status(500).json({ success: false, message: "Server error fetching order." });
    }
};

/* ────────────────────────── 5. Update Order Status (Admin) ────────────────────────── */
export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ["Pending", "Paid", "Processing", "Shipped", "Delivered", "Cancelled"];

        if (!status || !allowed.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(", ")}` });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        order.orderStatus = status;

        if (status === "Paid" && !order.isPaid) {
            order.isPaid = true;
            order.paidAt = new Date();
        }

        await order.save();
        return res.json({ success: true, order });
    } catch (error) {
        console.error("updateOrderStatus error:", error);
        return res.status(500).json({ success: false, message: "Server error updating order status." });
    }
};

/* ────────────────────────── 6. Get Latest Paid Order ────────────────────────── */
/**
 * Returns the authenticated user's most recent paid order
 * created within the last 10 minutes. Used by the frontend to
 * poll for a webhook-created order after returning from Square.
 */
export const getLatestPaidOrder = async (req, res) => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        const order = await Order.findOne({
            user: req.user.id,
            isPaid: true,
            createdAt: { $gte: tenMinutesAgo },
        }).sort({ createdAt: -1 });

        if (!order) {
            return res.status(404).json({ success: false, message: "No recent paid order found." });
        }

        return res.json({ success: true, order });
    } catch (error) {
        console.error("getLatestPaidOrder error:", error);
        return res.status(500).json({ success: false, message: "Server error fetching order." });
    }
};
