const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  requireAdminKey,
  upsertAreaRisk,
  upsertOfficialAreaRisk,
  getNearbyAreaRisk,
  updateAreaRisk,
} = require("../controllers/areaRiskController");

const router = express.Router();

router.post("/", protect, upsertAreaRisk);
router.post("/official", requireAdminKey, upsertOfficialAreaRisk);
router.get("/nearby", protect, getNearbyAreaRisk);
router.patch("/:id", requireAdminKey, updateAreaRisk);

module.exports = router;
