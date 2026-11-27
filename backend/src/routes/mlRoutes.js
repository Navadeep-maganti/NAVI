const express = require("express");
const protect = require("../middleware/authMiddleware");
const { predictLocationRisk, learnMyBehaviorProfile, analyzeMyBehavior } = require("../controllers/mlController");

const router = express.Router();

router.post("/location-risk", protect, predictLocationRisk);
router.post("/behavior-profile/learn", protect, learnMyBehaviorProfile);
router.post("/behavior/analyze", protect, analyzeMyBehavior);

module.exports = router;
