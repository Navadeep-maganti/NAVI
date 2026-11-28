const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  predictLocationRisk,
  learnMyBehaviorProfile,
  adaptMyBehaviorProfile,
  getMyBehaviorProfile,
  analyzeMyBehavior,
  assessMySafety,
  respondToTravelPrompt,
  getTravelModeStatus,
} = require("../controllers/mlController");

const router = express.Router();

router.post("/location-risk", protect, predictLocationRisk);
router.get("/behavior-profile", protect, getMyBehaviorProfile);
router.post("/behavior-profile/learn", protect, learnMyBehaviorProfile);
router.post("/behavior-profile/adapt", protect, adaptMyBehaviorProfile);
router.post("/behavior/analyze", protect, analyzeMyBehavior);
router.post("/safety-assessment", protect, assessMySafety);
router.get("/travel-mode", protect, getTravelModeStatus);
router.post("/travel-mode/respond", protect, respondToTravelPrompt);

module.exports = router;
