import mongoose from "mongoose";

const sizeEntrySchema = new mongoose.Schema(
    {
        size: { type: String, required: true },
        stock: { type: Number, required: true, min: 0 },
        price: { type: Number, default: null }, // optional per-size price override
    },
    { _id: false }
);

const colorImageSchema = new mongoose.Schema(
    {
        colorName: { type: String, required: true },
        images: [
            {
                url: { type: String, required: true },
                publicId: { type: String, required: true },
            },
        ],
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
        shortDescription: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            required: true,
        },
        price: {
            type: Number, // baseMRP
            required: true,
        },
        sellingPrice: {
            type: Number, // discounted price (optional)
            default: null,
        },
        category: {
            type: String,
            required: true,
        },
        images: [
            {
                url: {
                    type: String,
                    required: true,
                },
                publicId: {
                    type: String,
                    required: true,
                },
            },
        ],
        colors: [colorImageSchema],
        sizes: [sizeEntrySchema],
        totalStock: {
            type: Number,
            default: 0,
        },
        weight: {
            type: Number,
            required: true,
        },
        specialTag: {
            type: String,
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
