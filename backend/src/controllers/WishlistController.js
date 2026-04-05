import Wishlist from "../models/Wishlist.js";

// GET /api/wishlist — fetch user's wishlist with populated product data
export const getWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id }).populate({
            path: "products",
            select: "name price images category specialTag totalStock",
        });

        res.status(200).json({
            success: true,
            products: wishlist ? wishlist.products : [],
        });
    } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch wishlist.",
            error: error.message,
        });
    }
};

// POST /api/wishlist — add a product to wishlist
export const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "productId is required.",
            });
        }

        let wishlist = await Wishlist.findOne({ user: req.user.id });

        if (!wishlist) {
            wishlist = new Wishlist({ user: req.user.id, products: [productId] });
        } else {
            // Prevent duplicates
            if (wishlist.products.includes(productId)) {
                return res.status(200).json({
                    success: true,
                    message: "Product already in wishlist.",
                });
            }
            wishlist.products.push(productId);
        }

        await wishlist.save();

        res.status(200).json({
            success: true,
            message: "Product added to wishlist.",
        });
    } catch (error) {
        console.error("Error adding to wishlist:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add to wishlist.",
            error: error.message,
        });
    }
};

// DELETE /api/wishlist/:productId — remove a product from wishlist
export const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;

        const wishlist = await Wishlist.findOne({ user: req.user.id });

        if (!wishlist) {
            return res.status(200).json({
                success: true,
                message: "Wishlist is empty.",
            });
        }

        wishlist.products = wishlist.products.filter(
            (id) => id.toString() !== productId
        );

        await wishlist.save();

        res.status(200).json({
            success: true,
            message: "Product removed from wishlist.",
        });
    } catch (error) {
        console.error("Error removing from wishlist:", error);
        res.status(500).json({
            success: false,
            message: "Failed to remove from wishlist.",
            error: error.message,
        });
    }
};
