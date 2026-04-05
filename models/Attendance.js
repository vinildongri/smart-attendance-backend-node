import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema({
    // 1. RELATIONAL MAPPING: Link directly to the User database
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // 2. NORMALIZED DATE: Storing "YYYY-MM-DD" makes searching 100x faster
    date: {
        type: String,
        required: true
    },
    // The exact millisecond they walked past the camera
    timeMarked: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        // Update this array to include all the statuses you want to allow
        enum: ["Present", "Late", "Absent", "Half-Day", "Excused"],
        default: "Absent"
    },
    adminRemarks: {
        type: String,
        default: ""
    },
    // 3. INDUSTRY STANDARD: Always log AI metrics! If a student says "I was there but the system missed me," you need the AI's confidence score to debug it.
    aiConfidenceScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    // In case you add more cameras later
    cameraLocation: {
        type: String,
        default: "Classroom A1"
    }
}, {
    timestamps: true
});

// 4. THE MAGIC LOCK: This is a Compound Index.
// It tells MongoDB: "A student can only have ONE attendance record per day."
// If the AI accidentally scans the student's face twice in the same class, the database will block the second scan automatically.
AttendanceSchema.index({ student: 1, date: 1 }, { unique: true });

export default mongoose.models.Attendance || mongoose.model("Attendance", AttendanceSchema);