import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import Attendance from "../models/Attendance.js";
import User from "../models/user.js";
import ErrorHandler from "../utils/errorHandler.js";

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

// 1. Mark Attendance (Called by Frontend) => /api/v1/attendance/mark
export const markAttendanceWithAI = catchAsyncErrors(async (req, res, next) => {
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: "No photos uploaded." });
    }

    try {
        // --- 1. PREPARE DATA ---
        const formData = new FormData();
        files.forEach((file) => {
            formData.append('images', fs.createReadStream(file.path));
        });

        // --- 2. CALL PYTHON API (HTTP instead of Spawn) ---
        const pythonApiUrl = process.env.PYTHON_API_URL;

        // This line replaces all the old 'pythonProcess' logic
        const response = await axios.post(pythonApiUrl, formData, {
            headers: { ...formData.getHeaders() }
        });

        // Clean up uploaded files from Node server disk immediately after sending
        files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });

        // --- 3. PROCESS RESULTS ---
        const { recognizedStudents } = response.data;
        const recognizedRollNumbers = recognizedStudents.map(student => student.rollNumber);

        if (recognizedRollNumbers.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No recognized faces found in the uploaded images.",
                recognizedStudents: []
            });
        }

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        const newlyMarkedStudents = [];

        // --- 4. DATABASE UPDATES ---
        for (const rollNumber of recognizedRollNumbers) {
            const student = await User.findOne({ rollNumber });

            if (student) {
                const existingAttendance = await Attendance.findOne({
                    student: student._id,
                    date: formattedDate
                });

                if (!existingAttendance) {
                    await Attendance.create({
                        student: student._id,
                        date: formattedDate,
                        aiConfidenceScore: 100,
                        cameraLocation: "Manual Upload - Bulk Photos",
                        status: "Present"
                    });
                }
                newlyMarkedStudents.push({ name: student.name, rollNumber: student.rollNumber });
            }
        }

        res.status(200).json({
            success: true,
            message: `Successfully processed images.`,
            recognizedStudents: newlyMarkedStudents
        });

    } catch (error) {
        // Clean up files if an error occurs during the API call
        files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });

        console.error("AI processing or Database Error:", error);
        res.status(500).json({
            success: false,
            message: "AI processing failed. Ensure the Python server is running."
        });
    }
});

// 2. Get Logged-in Student's Attendance => /api/v1/attendance/me
export const getMyAttendance = catchAsyncErrors(async (req, res, next) => {
    // Find all attendance records for the currently logged-in user
    // We sort by date descending (newest first)
    const attendanceHistory = await Attendance.find({ student: req.user._id })
        .sort({ date: -1 });

    res.status(200).json({
        success: true,
        totalPresent: attendanceHistory.length,
        attendanceHistory
    });
});

// 3. Get All Attendance (ADMIN ONLY) => /api/v1/admin/attendance
export const getAllAttendance = catchAsyncErrors(async (req, res, next) => {
    // If the admin passes a date query (e.g., ?date=2026-04-05), filter by it.
    // Otherwise, return everything.
    const query = req.query.date ? { date: req.query.date } : {};

    // .populate() is the Mongoose magic! It swaps the student ID for their actual Name and Roll Number
    const attendanceRecords = await Attendance.find(query)
        .populate("student", "name rollNumber batch")
        .sort({ timeMarked: -1 });

    res.status(200).json({
        success: true,
        count: attendanceRecords.length,
        attendanceRecords
    });
});

// 4. Update Attendance Status (ADMIN ONLY) => /api/v1/admin/attendance/:id
export const updateAttendance = catchAsyncErrors(async (req, res, next) => {
    const { status, adminRemarks } = req.body;

    // Validate input
    if (!status) {
        return next(new ErrorHandler("Please provide a valid status.", 400));
    }

    const allowedStatuses = ["Present", "Absent", "Late", "Half-Day", "Excused"];
    if (!allowedStatuses.includes(status)) {
        return next(new ErrorHandler(`Invalid status. Allowed values are: ${allowedStatuses.join(", ")}`, 400));
    }

    // Find and update the record
    const attendance = await Attendance.findByIdAndUpdate(
        req.params.id,
        { status, adminRemarks },
        { new: true, runValidators: true }
    );

    if (!attendance) {
        return next(new ErrorHandler("Attendance record not found.", 404));
    }

    res.status(200).json({
        success: true,
        message: "Attendance status updated successfully.",
        attendance
    });
});

// 5. Get Student Analytics (ADMIN) => /api/v1/admin/attendance/stats/:studentId
export const getStudentStats = catchAsyncErrors(async (req, res, next) => {
    const { studentId } = req.params;

    const records = await Attendance.find({ student: studentId });

    if (!records || records.length === 0) {
        return next(new ErrorHandler("No attendance records found for this student.", 404));
    }

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    records.forEach(record => {
        if (record.status === "Present" || record.status === "Excused") presentCount++;
        else if (record.status === "Absent") absentCount++;
        else if (record.status === "Late" || record.status === "Half-Day") lateCount++;
    });

    const totalDays = records.length;
    // Calculate percentage (treating 'Late' as a full day present for this basic math, adjust if needed)
    const attendancePercentage = ((presentCount + lateCount) / totalDays) * 100;

    res.status(200).json({
        success: true,
        studentId,
        totalDays,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        percentage: attendancePercentage.toFixed(2) + "%"
    });
});


// 6. Get Defaulters List (ADMIN) => /api/v1/admin/attendance/defaulters
export const getDefaulters = catchAsyncErrors(async (req, res, next) => {

    // 1. Fetch ALL students and ALL attendance records independently
    const [students, records] = await Promise.all([
        User.find({ role: "student" }).select("name rollNumber email _id"),
        Attendance.find().select("student status date") // No populate needed, much faster!
    ]);

    // 2. Calculate the TRUE Total Working Days for the school
    const uniqueDates = new Set();
    records.forEach(rec => uniqueDates.add(rec.date));
    const totalWorkingDays = uniqueDates.size;

    // If no classes have happened yet, there are no defaulters
    if (totalWorkingDays === 0) {
        return res.status(200).json({ success: true, count: 0, defaulters: [] });
    }

    // 3. Initialize stats for EVERY active student, ensuring nobody is skipped
    const studentStats = {};
    students.forEach(student => {
        studentStats[student._id.toString()] = {
            student: student,
            presentDays: 0
        };
    });

    // 4. Count Present/Late days
    records.forEach(record => {
        if (!record.student) return;
        const sId = record.student.toString();

        // If the student exists and was present/late, increment their count
        if (studentStats[sId] && ["Present", "Excused", "Late", "Half-Day"].includes(record.status)) {
            studentStats[sId].presentDays += 1;
        }
    });

    // 5. Filter for Defaulters (< 75%) against the GLOBAL working days
    const defaulters = [];
    for (const key in studentStats) {
        const stat = studentStats[key];
        const percentage = (stat.presentDays / totalWorkingDays) * 100;

        if (percentage < 75) {
            defaulters.push({
                studentId: stat.student._id,
                name: stat.student.name,
                rollNumber: stat.student.rollNumber,
                email: stat.student.email,
                totalDays: totalWorkingDays,
                presentDays: stat.presentDays,
                percentage: percentage.toFixed(2) + "%"
            });
        }
    }

    // 6. Sort so the absolute worst attendance (0%) shows up at the top
    defaulters.sort((a, b) => parseFloat(a.percentage) - parseFloat(b.percentage));

    res.status(200).json({
        success: true,
        count: defaulters.length,
        defaulters
    });
});

// 7. Export Attendance to CSV or JSON (ADMIN) => /api/v1/admin/attendance/export?date=2026-04-05&format=json
export const exportAttendanceCSV = catchAsyncErrors(async (req, res, next) => {
    const { date, format } = req.query;
    const query = date ? { date } : {};

    const records = await Attendance.find(query)
        .populate("student", "name rollNumber")
        .sort({ date: -1 });

    if (records.length === 0) {
        return next(new ErrorHandler("No records found for this date", 404));
    }

    // --- CASE 1: FRONTEND TABLE PREVIEW (JSON) ---
    if (format === 'json') {
        const formattedRecords = records.map(record => ({
            date: record.date,
            rollNumber: record.student ? record.student.rollNumber : "N/A",
            name: record.student ? record.student.name : "Deleted User",
            status: record.status,
            aiScore: record.aiConfidenceScore || "N/A",
            remarks: record.adminRemarks || ""
        }));

        return res.status(200).json({
            success: true,
            records: formattedRecords
        });
    }

    // --- CASE 2: ACTUAL DOWNLOAD (CSV) ---
    let csvData = "Date,Roll Number,Student Name,Status,AI Score,Remarks\n";

    records.forEach((record) => {
        const rDate = record.date;
        const roll = record.student ? record.student.rollNumber : "N/A";
        const name = record.student ? record.student.name : "Deleted User";
        const status = record.status;
        const aiScore = record.aiConfidenceScore || "N/A";
        const remarks = record.adminRemarks || "";

        csvData += `${rDate},${roll},${name},${status},${aiScore},${remarks}\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=attendance_${date || 'report'}.csv`);

    res.status(200).send(csvData);
});


// 8. Admin Dashboard Stats => /api/v1/admin/attendance/dashboard
export const getDashboardStats = catchAsyncErrors(async (req, res, next) => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // 1. Get Total Students (Assuming your User model has a role field. If not, remove the filter)
    const totalStudents = await User.countDocuments({ role: "student" });

    // 2. Fetch all attendance records for TODAY
    const todaysRecords = await Attendance.find({ date: today });

    // 3. Calculate today's stats
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    todaysRecords.forEach(record => {
        if (record.status === "Present") present++;
        else if (record.status === "Late" || record.status === "Half-Day") late++;
        else if (record.status === "Absent") absent++;
        else if (record.status === "Excused") excused++;
    });

    // Calculate how many students haven't been scanned by the camera or marked manually yet
    const unmarked = totalStudents - todaysRecords.length;

    // 4. Get the 5 most recent check-ins for the live feed
    const recentCheckins = await Attendance.find({ date: today })
        .sort({ _id: -1 }) // Sort by newest first
        .limit(5)
        .populate("student", "name rollNumber");

    // 5. Send the compiled dashboard data
    res.status(200).json({
        success: true,
        date: today,
        summary: {
            totalStudents,
            present,
            late,
            absent,
            excused,
            unmarked: unmarked > 0 ? unmarked : 0 // Prevents negative numbers if there are duplicate records
        },
        recentCheckins
    });
});



// Get Attendance Analytics for ALL students - ADMIN  => /api/v1/admin/attendance/stats
export const getAllStudentsStats = catchAsyncErrors(async (req, res, next) => {
    // 1. Fetch ALL active students and ALL attendance records in parallel
    const [students, records] = await Promise.all([
        User.find({ role: "student" }).select("name rollNumber _id"),
        Attendance.find().select("student status date")
    ]);

    if (!students || students.length === 0) {
        return next(new ErrorHandler("No students found in the database.", 404));
    }

    const uniqueDates = new Set();
    records.forEach(rec => uniqueDates.add(rec.date));
    const totalWorkingDays = uniqueDates.size;

    const statsMap = new Map();
    students.forEach(student => {
        statsMap.set(student._id.toString(), {
            studentId: student._id,
            name: student.name,
            rollNumber: student.rollNumber,
            present: 0,
            late: 0,
        });
    });

    records.forEach(record => {
        if (!record.student) return; // Skip if student was deleted

        const studentId = record.student.toString();

        if (statsMap.has(studentId)) {
            const stat = statsMap.get(studentId);

            if (record.status === "Present" || record.status === "Excused") {
                stat.present++;
            } else if (record.status === "Late" || record.status === "Half-Day") {
                stat.late++;
            }
        }
    });

    const finalStats = [];

    statsMap.forEach(stat => {
        const absent = totalWorkingDays - (stat.present + stat.late);

        const percentage = totalWorkingDays > 0
            ? (((stat.present + stat.late) / totalWorkingDays) * 100).toFixed(2)
            : "0.00";

        finalStats.push({
            studentId: stat.studentId,
            name: stat.name,
            rollNumber: stat.rollNumber,
            present: stat.present,
            absent: absent > 0 ? absent : 0, // Fallback to prevent negative numbers
            late: stat.late,
            percentage: parseFloat(percentage),
            percentageString: `${percentage}%`
        });
    });

    finalStats.sort((a, b) => b.percentage - a.percentage);

    res.status(200).json({
        success: true,
        totalWorkingDays,
        totalStudents: finalStats.length,
        stats: finalStats
    });
});