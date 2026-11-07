import User from "../models/Users.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Sign Up - Register a new user
export const signup = async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, email, and password",
            });
        }

        /* Strings only. An object such as {"$ne": null} would otherwise reach
           User.findOne() as a query operator. */
        if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string"
            || name.length > 100 || email.length > 254 || password.length > 200) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid name, email, and password",
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists",
            });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
        });


        await newUser.save();

        // Generate JWT token
        const token = jwt.sign(
            { id: newUser._id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Return success response (exclude password)
        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                phone: newUser.phone,
                address: newUser.address || {},
            },
            token,
        });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during registration",
        });
    }
};

// Login - Authenticate existing user
export const login = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide email and password",
            });
        }

        /* Strings only. With an object here, {"email": {"$regex": "^a"}} would
           match accounts by pattern, and the bcrypt work done only on a match
           turned response time into an oracle for which emails exist. */
        if (typeof email !== "string" || typeof password !== "string"
            || email.length > 254 || password.length > 200) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Return success response (exclude password)
        res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.address || {},
            },
            token,
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during login",
        });
    }
};

// Update Profile - Update user name and phone
export const updateProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (name !== undefined) user.name = name;
        if (phone !== undefined) user.phone = phone;

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.address || {},
            },
        });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during profile update",
        });
    }
};

// Logout - Clear httpOnly cookie
export const logoutUser = async (req, res) => {
    res.cookie("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge: 0,
    });
    res.status(200).json({ success: true, message: "Logged out successfully" });
};
