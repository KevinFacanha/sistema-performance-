const serverless = require('serverless-http');
const app = require('../server/index.cjs');

module.exports = (req, res) => serverless(app)(req, res);
