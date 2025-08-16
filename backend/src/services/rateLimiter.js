const { RateLimiterMemory } = require('rate-limiter-flexible');

const rateLimiter = new RateLimiterMemory({
  points: 20, // 20 requests
  duration: 60, // per 60 seconds per IP/user
});

module.exports = (req, res, next) => {
  const key = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  rateLimiter.consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
    });
};
