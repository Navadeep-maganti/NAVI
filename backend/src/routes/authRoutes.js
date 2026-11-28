const express = require("express");
const protect = require("../middleware/authMiddleware");

const {
    registerUser,
    loginUser,
    registerDeviceToken,
    clearDeviceToken,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/device-token", protect, registerDeviceToken);
router.delete("/device-token", protect, clearDeviceToken);

module.exports = router;