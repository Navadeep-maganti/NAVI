const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const protect = require("../src/middleware/authMiddleware");
const { requireAdminKey } = require("../src/controllers/areaRiskController");
const { createRateLimiter } = require("../src/middleware/rateLimit");

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

test("protect rejects missing and invalid JWTs with 401 and accepts valid JWT", () => {
  process.env.JWT_SECRET = "test-secret-key-123";

  const resMissing = makeRes();
  let nextCalled = false;
  protect({ headers: {} }, resMissing, () => {
    nextCalled = true;
  });
  assert.equal(resMissing.statusCode, 401);
  assert.equal(nextCalled, false);

  const resBad = makeRes();
  protect({ headers: { authorization: "Bearer invalid.jwt.token" } }, resBad, () => {
    nextCalled = true;
  });
  assert.equal(resBad.statusCode, 401);
  assert.equal(nextCalled, false);

  const token = jwt.sign({ id: "user123" }, process.env.JWT_SECRET);
  const reqGood = { headers: { authorization: `Bearer ${token}` } };
  const resGood = makeRes();
  protect(reqGood, resGood, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(reqGood.user.id, "user123");
});

test("requireAdminKey rejects missing or wrong X-Admin-Key with 403 and allows matching key", () => {
  process.env.ADMIN_API_KEY = "super-admin-key";

  const resMissing = makeRes();
  let nextCalled = false;
  requireAdminKey({ headers: {} }, resMissing, () => {
    nextCalled = true;
  });
  assert.equal(resMissing.statusCode, 403);
  assert.equal(nextCalled, false);

  const resWrong = makeRes();
  requireAdminKey({ headers: { "x-admin-key": "wrong-key" } }, resWrong, () => {
    nextCalled = true;
  });
  assert.equal(resWrong.statusCode, 403);
  assert.equal(nextCalled, false);

  const resValid = makeRes();
  requireAdminKey({ headers: { "x-admin-key": "super-admin-key" } }, resValid, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("rate limiter returns 429 after exceeding max requests in window", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const req = { ip: "127.0.0.1" };
  let passed = 0;

  for (let i = 0; i < 3; i += 1) {
    const res = makeRes();
    limiter(req, res, () => {
      passed += 1;
    });
    if (i === 2) assert.equal(res.statusCode, 429);
  }
  assert.equal(passed, 2);
});

