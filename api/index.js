/**
 * Vercel serverless entry: deployed as https://<project>.vercel.app/api
 * Express paths are relative to that base (e.g. POST …/api/calculate_surcharge).
 */
const app = require('../server/app');

module.exports = app;
