const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  manualSOS,
  respondToCheckin,
  getMyAlerts,
  runEscalationSweep,
} = require("../controllers/alertController");

const router = express.Router();

router.get("/", protect, getMyAlerts);
router.post("/sos", protect, manualSOS);
router.post("/:id/respond", protect, respondToCheckin);
router.post("/process-escalations", protect, runEscalationSweep);

module.exports = router;

