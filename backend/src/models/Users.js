import mongoose from "mongoose";

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
    },
    { timestamps: true }
);

export default mongoose.model("User", userSchema);