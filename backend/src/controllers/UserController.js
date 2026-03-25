import User from "../models/Users.js";

/**
 * GET /api/users/me
 * Fetch the authenticated user's full profile (including address).
 */
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                profilePicture: user.profilePicture,
                address: user.address || {},
            },
        });
    } catch (error) {
        console.error("getMe Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching profile",
            error: error.message,
        });
    }
};

/**
 * PUT /api/users/address
 * Update the authenticated user's address.
 */
export const updateAddress = async (req, res) => {
    try {
        const {
            fullName,
            phone,
            addressLine1,
            addressLine2,
            city,
            state,
            zip,
            country,
        } = req.body;

        /* ── Validation ── */
        const errors = [];

        if (fullName !== undefined && typeof fullName !== "string") {
            errors.push("fullName must be a string");
        }
        if (addressLine1 !== undefined && typeof addressLine1 !== "string") {
            errors.push("addressLine1 must be a string");
        }
        if (city !== undefined && typeof city !== "string") {
            errors.push("city must be a string");
        }
        if (state !== undefined && typeof state !== "string") {
            errors.push("state must be a string");
        }
        if (zip !== undefined && typeof zip !== "string") {
            errors.push("zip must be a string");
        }

        // Phone format validation (basic: digits, spaces, dashes, parens, plus)
        if (phone !== undefined && phone.trim() !== "") {
            const phoneRegex = /^[+]?[\d\s\-().]{7,20}$/;
            if (!phoneRegex.test(phone.trim())) {
                errors.push("Phone number format is invalid");
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: errors.join(", "),
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        /* Build address update – only set provided fields */
        const addressUpdate = {};
        if (fullName !== undefined) addressUpdate.fullName = fullName.trim();
        if (phone !== undefined) addressUpdate.phone = phone.trim();
        if (addressLine1 !== undefined) addressUpdate.addressLine1 = addressLine1.trim();
        if (addressLine2 !== undefined) addressUpdate.addressLine2 = addressLine2.trim();
        if (city !== undefined) addressUpdate.city = city.trim();
        if (state !== undefined) addressUpdate.state = state.trim();
        if (zip !== undefined) addressUpdate.zip = zip.trim();
        if (country !== undefined) addressUpdate.country = country.trim();

        user.address = { ...(user.address?.toObject?.() || user.address || {}), ...addressUpdate };
        await user.save();

        res.status(200).json({
            success: true,
            message: "Address updated successfully",
            address: user.address,
        });
    } catch (error) {
        console.error("updateAddress Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error updating address",
            error: error.message,
        });
    }
};
