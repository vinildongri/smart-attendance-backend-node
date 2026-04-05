import ErrorHandler from "../utils/errorHandler.js";

export default (err, req, res, next) => {

    let error = { ...err };
    error.message = err.message;

    // MongoDB duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const value = err.keyValue[field];
        error = new ErrorHandler(`${field} "${value}" is already registered`, 400);
    }

    // Mongoose validation error
    if (err.name === "ValidationError") {
        const messages = Object.values(err.errors).map(val => val.message);
        error = new ErrorHandler(messages.join(", "), 400);
    }

    // Invalid JWT
    if (err.name === "JsonWebTokenError") {
        error = new ErrorHandler("JSON Web Token is invalid. Try again.", 400);
    }

    // Expired JWT
    if (err.name === "TokenExpiredError") {
        error = new ErrorHandler("JSON Web Token has expired. Try again.", 400);
    }

    // DEVELOPMENT MODE → Full technical details
    if (process.env.NODE_ENV === "DEVELOPMENT") {
        // console.log(process.env.NODE_ENV);
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.message,
            name: err.name,
            stack: err.stack,
            error: err
        });
    }

    // PRODUCTION MODE → Clean message only
    if (process.env.NODE_ENV === "PRODUCTION") {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }

};