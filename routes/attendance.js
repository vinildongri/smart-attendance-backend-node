import express from "express";
import multer from 'multer';
import { getMyAttendance, getAllAttendance, updateAttendance, getStudentStats, exportAttendanceCSV, getDefaulters, getDashboardStats, markAttendanceWithAI, getAllStudentsStats } from "../controllers/attendanceController.js";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";

const router = express.Router();
// const upload = multer({ dest: 'uploads/' });
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// router.route("/attendance/mark").post(markAttendanceWithAI);
router.post('/attendance/mark', upload.array('photos', 9), markAttendanceWithAI);
router.route("/attendance/me").get(isAuthenticatedUser, getMyAttendance);

// FIXED: Changed to singular "authorizeRole" here as well
router.route("/admin/attendance").get(isAuthenticatedUser, authorizeRole("admin"), getAllAttendance);

router.route("/admin/attendance/:id")
    .put(isAuthenticatedUser, authorizeRole("admin"), updateAttendance);

router.route("/admin/attendance/defaulters")
    .get(isAuthenticatedUser, authorizeRole("admin"), getDefaulters);

router.route("/admin/attendance/export")
    .get(isAuthenticatedUser, authorizeRole("admin"), exportAttendanceCSV);

router.route("/admin/attendance/stats/:studentId")
    .get(isAuthenticatedUser, authorizeRole("admin"), getStudentStats);

router.route("/admin/attendance/stats")
    .get(isAuthenticatedUser, authorizeRole("admin"), getAllStudentsStats);


router.route("/admin/attendance/dashboard")
    .get(isAuthenticatedUser, authorizeRole("admin"), getDashboardStats);


export default router;