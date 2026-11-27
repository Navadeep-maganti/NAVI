const express = require("express");
const protect = require("../middleware/authMiddleware");
const { predictLocationRisk, learnMyBehaviorProfile, analyzeMyBehavior, assessMySafety } = require("../controllers/mlController");

const router = express.Router();

router.post("/location-risk", protect, predictLocationRisk);
router.post("/behavior-profile/learn", protect, learnMyBehaviorProfile);
router.post("/behavior/analyze", protect, analyzeMyBehavior);
router.post("/safety-assessment", protect, assessMySafety);

module.exports = router;
