const express = require("express");
const router = express.Router();

const {
  addContact,
  getContacts,
  updateContact,
  deleteContact,
  requestContactVerification,
  verifyContact,
} = require("../controllers/contactController");

const protect = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", addContact);
router.get("/", getContacts);
router.put("/updateContact/:phone", updateContact);
router.put("/:id", updateContact);
router.delete("/:id", deleteContact);
router.post("/:id/request-verification", requestContactVerification);
router.post("/:id/verify", verifyContact);

module.exports = router;
