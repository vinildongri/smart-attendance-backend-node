import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please enter name"],
        maxLength: [50, "Name cannot exceed 50 characters"],
    },
    rollNumber: {
        type: String,
        uppercase: true,
        trim: true,
        unique: true,
        sparse: true // Allows Admins/Faculty to exist without a roll number
    },
    email: {
        type: String,
        required: [true, "Please enter email address"],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            "Please enter a valid email address"
        ]
    },
    password: {
        type: String,
        minLength: [8, "Password must be longer than 8 characters"],
        select: false,
    },
    role: {
        type: String,
        enum: ['student', 'admin'],
        default: 'student'
    },
    // To store the mathematical face data from Python
    faceEncoding: {
        type: [Number],
        required: false,
    },
    profilePicture: {
        type: String
    },

    // Auth & Reset fields
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    isVerified: {
        type: Boolean,
        default: false
    },
    otp: String,
    otpExpire: Date,

}, {
    timestamps: true
});

// Encrypting Password Before Saving the user
UserSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 10);
});

// Return JWT Token
UserSchema.methods.getJwtToken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_TIME,
    });
};

// Compare user Password
UserSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate Reset Password token
UserSchema.methods.getResetPasswordToken = async function () {
    const resetToken = crypto.randomBytes(20).toString("hex");
    this.resetPasswordToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
    this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
    return resetToken;
};

// Generate a 6-digit OTP
UserSchema.methods.getOTP = function () {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.otp = crypto.createHash("sha256").update(otpCode).digest("hex");
    this.otpExpire = Date.now() + 15 * 60 * 1000;
    return otpCode;
};

export default mongoose.models.User || mongoose.model("User", UserSchema);