/**
 * Express 4 does not catch promises rejected inside a route handler. Without
 * this wrapper a single failed query becomes an unhandled rejection, which
 * terminates the process on modern Node. Every async handler goes through it
 * so failures reach the error middleware and come back as JSON instead.
 */
module.exports = function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
};
