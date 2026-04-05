import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import User from "../models/user.js";
import ErrorHandler from "../utils/errorHandler.js";

// Get Current user profile => /api/v1/me
export const getUserProfile = catchAsyncErrors(async (req, res, next) => {
    const user = await User.findById(req?.user?._id);

    res.status(200).json({
        success: true,
        user,
    });
});

// Update User Profile =>/api/v1/me/update
export const updateProfile = catchAsyncErrors(async (req, res, next) => {
    const newUserData = {
        name: req.body.name,
        email: req.body.email,
    };

    // Include rollNumber so users can fix typos after registration
    if (req.body.rollNumber) {
        newUserData.rollNumber = req.body.rollNumber;
    }

    // Include profilePicture if they upload a new one
    if (req.body.profilePicture) {
        newUserData.profilePicture = req.body.profilePicture;
    }

    const user = await User.findByIdAndUpdate(req.user._id, newUserData, {
        new: true,
        runValidators: true
    });

    res.status(200).json({
        success: true,
        user,
    });
});

// Update Password => /api/v1/password/update
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
    const { oldPassword, password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
        return next(new ErrorHandler("Please provide both new password and confirm password", 400));
    }

    if (password !== confirmPassword) {
        return next(new ErrorHandler("Passwords do not match. Please check your entries.", 400));
    }

    const user = await User.findById(req?.user?._id).select("+password");

    if (!user) {
        return next(new ErrorHandler("User not found", 404));
    }

    // Check previous Password
    const isPasswordMatched = await user.comparePassword(oldPassword);

    if (!isPasswordMatched) {
        return next(new ErrorHandler("Old Password is incorrect", 400));
    }

    user.password = password;
    await user.save();

    res.status(200).json({
        success: true,
    });
});

// Get all users - ADMIN => /api/v1/admin/users
export const allUsers = catchAsyncErrors(async (req, res, next) => {
    const users = await User.find();

    res.status(200).json({
        success: true,
        users,
    });
});

// Get User Details - ADMIN => /api/v1/admin/users/:id
export const getUserDetails = catchAsyncErrors(async (req, res, next) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        return next(new ErrorHandler(`User not found with this id: ${req.params.id} `, 404));
    }

    res.status(200).json({
        success: true,
        user,
    });
});

// Update User Details - ADMIN => /api/v1/admin/users/:id
export const updateUser = catchAsyncErrors(async (req, res, next) => {
    const newUserData = {
        name: req.body.name,
        email: req.body.email,
        role: req.body.role,
    };

    // Admins can manually assign or fix roll numbers
    if (req.body.rollNumber !== undefined) {
        newUserData.rollNumber = req.body.rollNumber;
    }

    // Admins can manually verify a user if the OTP system fails for them
    if (req.body.isVerified !== undefined) {
        newUserData.isVerified = req.body.isVerified;
    }

    // Admins can reset the AI face data if the student needs to take a new reference photo
    if (req.body.resetFaceEncoding === true) {
        newUserData.faceEncoding = []; 
    }

    const user = await User.findByIdAndUpdate(req.params.id, newUserData, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        success: true,
        user,
    });
});

// Delete User - ADMIN => /api/v1/admin/users/:id
export const deleteUser = catchAsyncErrors(async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return next(new ErrorHandler(`User not found with this id: ${req.params.id}`, 404));
    }

    await user.deleteOne();

    res.status(200).json({
        success: true,
        message: "User deleted successfully"
    });
});