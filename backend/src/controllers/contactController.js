
const TrustedContact = require("../models/TrustedContact");
const mongoose = require("mongoose");

// Add a trusted contact
const addContact = async (req, res) => {
  try {
    const { name, phone, email, relationship } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        message: "Name and phone number are required",
      });
    }

    
    const existingContact = await TrustedContact.findOne({
        user: req.user.id,
        phone: phone,
    })

    if(existingContact){
        return res.status(400).json({
            message: "This contact already exists",
        });
    }
    const contact = await TrustedContact.create({
        user: req.user.id,
        name,
        phone,
        email,
        relationship,
    })

    res.status(201).json({
      message: "Trusted contact added successfully",
      contact,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to add trusted contact",
      error: error.message,
    });
  }
};

// Get all trusted contacts of the logged-in user
const getContacts = async (req, res) => {
  try {
    const contacts = await TrustedContact.find({
      user: req.user.id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      count: contacts.length,
      contacts,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve trusted contacts",
      error: error.message,
    });
  }
};
const updateContact = async (req, res) => {
  try {
    const { id, phone: currentPhone } = req.params;
    const {
      name: requestedName,
      phone: requestedPhone,
      email: requestedEmail,
      relationship: requestedRelationship,
      updatedname,
      updatedphone,
      updatedemail,
      updatedrelationship,
      isActive,
      notifyOnEmergency,
    } = req.body;
    // The updated* names are accepted only for compatibility with the old API.
    const name = requestedName ?? updatedname;
    const phone = requestedPhone ?? updatedphone;
    const email = requestedEmail ?? updatedemail;
    const relationship = requestedRelationship ?? updatedrelationship;

    // `id` is the preferred, stable identifier. The phone lookup supports the
    // original /updateContact/:phone endpoint while clients migrate.
    const query = { user: req.user.id };
    if (id) {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ success: false, message: "Invalid contact id" });
      }
      query._id = id;
    } else {
      query.phone = currentPhone;
    }

    const contact = await TrustedContact.findOne(query);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Name cannot be empty" });
    }
    if (phone !== undefined && !String(phone).trim()) {
      return res.status(400).json({ success: false, message: "Phone number cannot be empty" });
    }

    if (phone !== undefined && phone !== contact.phone) {
      const duplicate = await TrustedContact.exists({
        user: req.user.id,
        phone,
        _id: { $ne: contact._id },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "This phone number is already assigned to another contact",
        });
      }
    }

    if (name !== undefined) contact.name = name;
    if (phone !== undefined) contact.phone = phone;
    if (email !== undefined) contact.email = email;
    if (relationship !== undefined) contact.relationship = relationship;
    if (isActive !== undefined) contact.isActive = isActive;
    if (notifyOnEmergency !== undefined) contact.notifyOnEmergency = notifyOnEmergency;

    await contact.save();

    return res.status(200).json({
      success: true,
      message: "Contact updated successfully",
      contact,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

module.exports = {
  addContact,
  getContacts,
  updateContact,
};
