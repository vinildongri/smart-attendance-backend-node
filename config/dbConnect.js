import mongoose from "mongoose";

export const connectDatabase = () => {
    let DB_URI = "";

    if (process.env.NODE_ENV === "DEVELOPMENT") DB_URI = process.env.DB_LOCAL_URI;
    if (process.env.NODE_ENV === "PRODUCTION") DB_URI = process.env.DB_LOCAL_URI;

    // console.log(`hello ${DB_URI}`);

    try {
        mongoose.connect(DB_URI).then((con) => {
            console.log(`MongoDB Database Connected With HOST: ${con?.connection?.host}`);
        });
    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        process.exit(1); // Shut down the server on failed connection
    }
};