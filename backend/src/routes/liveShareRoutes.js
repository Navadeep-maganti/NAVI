const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  startLiveShare,
  stopLiveShare,
  getActiveLiveShare,
  viewLiveShareByToken,
} = require("../controllers/liveShareController");

const router = express.Router();

router.post("/start", protect, startLiveShare);
router.post("/stop", protect, stopLiveShare);
router.get("/active", protect, getActiveLiveShare);
router.get("/view/:token", viewLiveShareByToken);

module.exports = router;

