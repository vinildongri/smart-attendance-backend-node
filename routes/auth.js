import express from "express";
import {  forgotPassword, loginUser, logout, registerUser, resendOTP, resetPassword, verifyOTP } from "../controllers/authControllers.js";
import {  isAuthenticatedUser } from "../middlewares/auth.js";

const router = express.Router();

router.route("/register").post(registerUser);
router.route("/verify-otp").post(verifyOTP);
router.route("/resend-otp").post(resendOTP);
router.route("/login").post(loginUser);
router.route("/logout").get(isAuthenticatedUser, logout);

router.route("/password/forgot").post(forgotPassword);
router.route("/password/reset/:token").put(resetPassword);

export default router;