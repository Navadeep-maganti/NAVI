const express = require("express");
const protect = require("../middleware/authMiddleware");
const { predictLocationRisk, learnMyBehaviorProfile } = require("../controllers/mlController");

const router = express.Router();

router.post("/location-risk", protect, predictLocationRisk);
router.post("/behavior-profile/learn", protect, learnMyBehaviorProfile);

module.exports = router;
