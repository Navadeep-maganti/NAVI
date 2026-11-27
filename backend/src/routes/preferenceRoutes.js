const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  updatePreferences,
  getPreferences,
} = require("../controllers/preferenceController");

router.post("/", protect, updatePreferences);

router.get("/", protect, getPreferences);

module.exports = router;