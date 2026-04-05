import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import Attendance from "../models/Attendance.js";
import User from "../models/user.js";
import ErrorHandler from "../utils/errorHandler.js";

// 1. Mark Attendance (Called by Python AI or Admin) => /api/v1/attendance/mark
export const markAttendance = catchAsyncErrors(async (req, res, next) => {
    // The Python script will send the rollNumber it detected, plus the AI stats
    const { rollNumber, aiConfidenceScore, cameraLocation } = req.body;

    if (!rollNumber || !aiConfidenceScore) {
        return next(new ErrorHandler("Missing required AI data: rollNumber or aiConfidenceScore", 400));
    }

    // Step 1: Find the actual user ID using the roll number the AI provided
    const student = await User.findOne({ rollNumber });
    if (!student) {
        return next(new ErrorHandler(`No student found with Roll Number: ${rollNumber}`, 404));
    }

    // Step 2: Generate today's date in a standard "YYYY-MM-DD" format
    // (We do this on the server so students can't spoof their phone's timezone)
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];

    // Step 3: Check if the student was already marked present today
    const existingAttendance = await Attendance.findOne({
        student: student._id,
        date: formattedDate
    });

    if (existingAttendance) {
        return res.status(200).json({
            success: true,
            message: `${student.name} is already marked present for today.`,
            attendance: existingAttendance
        });
    }

    // Step 4: Create the new attendance record
    const attendance = await Attendance.create({
        student: student._id,
        date: formattedDate,
        aiConfidenceScore,
        cameraLocation,
        status: "Present"
    });

    res.status(201).json({
        success: true,
        message: `Attendance successfully marked for ${student.name}`,
        attendance
    });
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

// 6. Get Defaulters List (ADMIN)
export const getDefaulters = catchAsyncErrors(async (req, res, next) => {

    // Sometimes populate() hangs if the schema isn't perfectly linked
    const records = await Attendance.find().populate("student", "name rollNumber email");

    const studentStats = {};

    records.forEach(record => {
        if (!record.student) return;
        const sId = record.student._id.toString();

        if (!studentStats[sId]) {
            studentStats[sId] = {
                student: record.student,
                totalDays: 0,
                presentDays: 0
            };
        }

        studentStats[sId].totalDays += 1;
        if (["Present", "Excused", "Late"].includes(record.status)) {
            studentStats[sId].presentDays += 1;
        }
    });

    const defaulters = [];
    for (const key in studentStats) {
        const stat = studentStats[key];
        const percentage = (stat.presentDays / stat.totalDays) * 100;

        if (percentage < 75) {
            defaulters.push({
                studentId: stat.student._id,
                name: stat.student.name,
                rollNumber: stat.student.rollNumber,
                email: stat.student.email,
                totalDays: stat.totalDays,
                presentDays: stat.presentDays,
                percentage: percentage.toFixed(2) + "%"
            });
        }
    }

    res.status(200).json({
        success: true,
        count: defaulters.length,
        defaulters
    });
});

// 7. Export Attendance to CSV (ADMIN) => /api/v1/admin/attendance/export?date=2026-04-05
export const exportAttendanceCSV = catchAsyncErrors(async (req, res, next) => {
    const query = req.query.date ? { date: req.query.date } : {};

    const records = await Attendance.find(query)
        .populate("student", "name rollNumber")
        .sort({ date: -1 });

    if (records.length === 0) {
        return next(new ErrorHandler("No records found to export", 404));
    }

    // 1. Define CSV Column Headers
    let csvData = "Date,Roll Number,Student Name,Status,AI Score,Remarks\n";

    // 2. Map data to rows
    records.forEach((record) => {
        const date = record.date;
        // Check if student exists before accessing name/rollNumber to prevent crashes if a user was deleted
        const rollNumber = record.student ? record.student.rollNumber : "N/A";
        const name = record.student ? record.student.name : "Deleted User";
        const status = record.status;
        const aiScore = record.aiConfidenceScore ? record.aiConfidenceScore : "N/A";
        const remarks = record.adminRemarks || "";

        // Add row string
        csvData += `${date},${rollNumber},${name},${status},${aiScore},${remarks}\n`;
    });

    // 3. Set headers to trigger a file download in the browser/client
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=attendance_report.csv");

    // 4. Send the raw CSV text
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