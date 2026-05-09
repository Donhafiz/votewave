const authRoutes = require('./auth');
const electionRoutes = require('./elections');
const candidateRoutes = require('./candidates');
const voteRoutes = require('./votes');
const userRoutes = require('./users');
const aiRoutes = require('./ai');
const adminRoutes = require('./admin');
const paymentRoutes = require('./payment');

module.exports = {
  authRoutes,
  electionRoutes,
  candidateRoutes,
  voteRoutes,
  userRoutes,
  aiRoutes,
  adminRoutes,
  paymentRoutes,
};
