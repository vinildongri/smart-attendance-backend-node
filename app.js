import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import errorMiddleware from "./middlewares/errors.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import attendanceRoutes from "./routes/attendance.js";
import { connectDatabase } from "./config/dbConnect.js";

// Handle Uncaught exceptions
process.on("uncaughtException", (err) => {
  console.log(`ERROR: ${err}`);
  console.log("Shutting down Server due to Uncaught Exception");
  process.exit(1);
});

dotenv.config();

const app = express();

connectDatabase();

app.use(cookieParser());

app.use(cors({
  origin: [
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.options(/.*/, cors());

app.use(express.json());

app.use("/api/v1", authRoutes);
app.use("/api/v1", userRoutes);
app.use("/api/v1", attendanceRoutes);

app.use(errorMiddleware);

const server = app.listen(process.env.PORT, () => {
  console.log(`Server started on PORT: ${process.env.PORT} in ${process.env.NODE_ENV} mode`);
});

// Handle Unhandled Promise Rejections
process.on("unhandledRejection", (err) => {
  console.log(`ERROR: ${err}`);
  console.log("Shutting down Server due to Unhandled Promise Rejection");
  server.close(() => {
    process.exit(1);
  });
});