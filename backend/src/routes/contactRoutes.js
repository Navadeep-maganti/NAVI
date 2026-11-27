
const express = require("express");
const router = express.Router();

const {
  addContact,
  getContacts,
  updateContact,
} = require("../controllers/contactController");

const protect = require("../middleware/authMiddleware");

// All contact routes require authentication
router.use(protect);

router.post("/", addContact);
router.get("/", getContacts);
// Kept temporarily for clients already using the original endpoint.
router.put("/updateContact/:phone", updateContact);
router.put("/:id", updateContact);

module.exports = router;
