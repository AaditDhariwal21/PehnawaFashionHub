import Order from "../models/Order.js";

/**
 * Orders are created exclusively by the Square payment flow — see
 * createCheckoutSession()/confirmPayment() in paymentController.js and the
 * payment.updated handler in webhookController.js. There is deliberately no
 * direct "create an order" endpoint here: the removed one marked orders Paid
 * and decremented inventory without any payment verification, so any
 * authenticated customer could mint free, fully-paid orders. If a manual
 * (phone/offline) order path is ever needed, it must be admin-gated and record
 * how the payment was actually taken.
 */

/* ────────────────────────── 1. Get My Orders ────────────────────────── */
export const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
        return res.json({ success: true, orders });
    } catch (error) {
        console.error("getMyOrders error:", error);
        return res.status(500).json({ success: false, message: "Server error fetching orders." });
    }
};

/* ────────────────────────── 2. Get All Orders (Admin) ────────────────────────── */
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

/* ────────────────────────── 3. Get Order By ID ────────────────────────── */
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

/* ────────────────────────── 4. Update Order Status (Admin) ────────────────────────── */
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

/* ────────────────────────── 5. Get Latest Paid Order ────────────────────────── */
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
