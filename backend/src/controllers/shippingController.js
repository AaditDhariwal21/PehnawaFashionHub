import { getShippingRate } from "../services/shippingService.js";
import Product from "../models/Products.js";

/**
 * POST /api/shipping/rates
 *
 * Body: { name, phone, address, city, state, zip, cartItems? }
 *   cartItems: [{ productId, quantity }]
 * Returns: { success, shippingCost, service, estimatedDays }
 */
export const calculateShippingRate = async (req, res) => {
    try {
        const { name, phone, address, city, state, zip, cartItems } = req.body;

        if (!address || !city || !state || !zip) {
            return res.status(400).json({
                success: false,
                message: "address, city, state, and zip are required.",
            });
        }

        /* ── Calculate total cart weight from product records ── */
        let totalWeightGrams = 0;

        if (Array.isArray(cartItems) && cartItems.length > 0) {
            const productIds = cartItems.map((ci) => ci.productId);
            const products = await Product.find(
                { _id: { $in: productIds } },
                { weight: 1 }
            ).lean();

            const weightMap = {};
            for (const p of products) {
                weightMap[p._id.toString()] = p.weight || 0;
            }

            for (const ci of cartItems) {
                const w = weightMap[ci.productId] || 0;
                totalWeightGrams += w * (ci.quantity || 1);
            }
        }

        const rate = await getShippingRate(
            { name, phone, address, city, state, zip },
            totalWeightGrams
        );

        return res.json({
            success: true,
            shippingCost: rate.shippingCost,
            service: rate.service,
            estimatedDays: rate.estimatedDays,
        });
    } catch (error) {
        console.error("calculateShippingRate error:", error);
        return res.status(500).json({
            success: true,
            shippingCost: 8,
            service: "Flat Rate",
            estimatedDays: null,
        });
    }
};
