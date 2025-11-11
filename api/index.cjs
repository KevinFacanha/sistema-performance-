const serverless = require('serverless-http');
const app = require('../server/index.cjs');

module.exports = serverless(app);
