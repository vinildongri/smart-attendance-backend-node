export default (controllerFunc) => (req, res, next) =>
   Promise.resolve(controllerFunc(req, res, next)).catch(next); 