import express from "express";
import { authorizeRole, isAuthenticatedUser } from "../middlewares/auth.js";
import { allUsers, deleteUser, getUserDetails, getUserProfile, updatePassword, updateProfile, updateUser } from "../controllers/userController.js";

const router = express.Router();

router.route("/me").get(isAuthenticatedUser, getUserProfile);
router.route("/me/update").put(isAuthenticatedUser, updateProfile);
router.route("/password/update").put(isAuthenticatedUser, updatePassword);


router
    .route("/admin/users")
    .get(isAuthenticatedUser, authorizeRole('admin'), allUsers);


router
    .route("/admin/users/:id")
    .get(isAuthenticatedUser, authorizeRole('admin'), getUserDetails)
    .put(isAuthenticatedUser, authorizeRole('admin'), updateUser)
    .delete(isAuthenticatedUser, authorizeRole('admin'), deleteUser); 

export default router;