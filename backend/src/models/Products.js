import mongoose from "mongoose";

const sizeEntrySchema = new mongoose.Schema(
    {
        size: { type: String, required: true },
        stock: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
        },
        category: {
            type: String,
            required: true,
        },
        images: [
            {
                url: {
                    type: String, // Cloudinary secure URL for display
                    required: true,
                },
                publicId: {
                    type: String, // Cloudinary public ID for management/deletion
                    required: true,
                },
            },
        ],
        sizes: [sizeEntrySchema],
        totalStock: {
            type: Number,
            default: 0,
        },
        weight: {
            type: Number, // lbs – standard US weight unit for shipping
            required: true,
        },
        specialTag: {
            type: String, // e.g., "New Arrival", "Best Seller", "Sale"
            default: null,
        },
        isCategoryCover: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

/* Recompute totalStock from sizes before every save */
productSchema.pre("save", function () {
    if (this.sizes && this.sizes.length > 0) {
        this.totalStock = this.sizes.reduce((sum, s) => sum + s.stock, 0);
    }
});

export default mongoose.model("Product", productSchema);