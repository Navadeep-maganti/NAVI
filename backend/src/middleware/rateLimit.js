/**
 * Lightweight in-memory fixed-window rate limiter per IP (or user id when authenticated).
 */
const createRateLimiter = ({ windowMs = 60_000, max = 60 } = {}) => {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now >= entry.resetAt) hits.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.user?.id ? `u:${req.user.id}` : `ip:${req.ip || "unknown"}`;
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again shortly.",
      });
    }
    return next();
  };
};

module.exports = { createRateLimiter };

