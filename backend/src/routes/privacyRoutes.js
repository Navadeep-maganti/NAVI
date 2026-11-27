const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  getPrivacySettings,
  updatePrivacyConsent,
  deleteMyLocationData,
} = require("../controllers/privacyController");

const router = express.Router();

router.get("/", protect, getPrivacySettings);
router.patch("/consent", protect, updatePrivacyConsent);
router.delete("/location-data", protect, deleteMyLocationData);

module.exports = router;

