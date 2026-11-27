const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  startSafeSession,
  getActiveSafeSession,
  endSafeSession,
} = require("../controllers/safeSessionController");

const router = express.Router();

router.post("/", protect, startSafeSession);
router.get("/active", protect, getActiveSafeSession);
router.patch("/:id/end", protect, endSafeSession);

module.exports = router;

