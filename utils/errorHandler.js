 class ErrorHadler extends Error {
    constructor(message, statusCode){
        super(message);
        this.statusCode = statusCode;
    }

    // Create a stack property
    // Error.captureStackTrace(this, this.constructor);
 };

 export default ErrorHadler;