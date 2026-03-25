import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
    {
        fullName: { type: String, default: "" },
        phone: { type: String, default: "" },
        addressLine1: { type: String, default: "" },
        addressLine2: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        zip: { type: String, default: "" },
        country: { type: String, default: "United States" },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: false,
        },
        googleId: {
            type: String,
            default: null,
        },
        profilePicture: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        phone: {
            type: String,
            default: null,
        },
        address: {
            type: addressSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

export default mongoose.model("User", userSchema);