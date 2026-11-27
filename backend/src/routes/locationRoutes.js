const express = require('express');

const router = express.Router();

const protect = require('../middleware/authMiddleware');

const {
    updateLocation,
    getLocationHistory,
} = require('../controllers/locationController');

router.post('/update', protect, updateLocation);
router.get('/history', protect, getLocationHistory);

module.exports = router;
