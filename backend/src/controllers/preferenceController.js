const Preference = require("../models/Preference");

const updatePreferences = async (req, res) => {
  try {
    const {
      lateNightThreshold,
      enableUnknownAreaAlerts,
      deviationSensitivity,
      autoAlertTrustedContacts,
    } = req.body;

    let preferences = await Preference.findOne({
      user: req.user.id,
    });

    if (preferences) {
      preferences.lateNightThreshold =
        lateNightThreshold ?? preferences.lateNightThreshold;

      preferences.enableUnknownAreaAlerts =
        enableUnknownAreaAlerts ??
        preferences.enableUnknownAreaAlerts;

      preferences.deviationSensitivity =
        deviationSensitivity ??
        preferences.deviationSensitivity;

      preferences.autoAlertTrustedContacts =
        autoAlertTrustedContacts ??
        preferences.autoAlertTrustedContacts;

      await preferences.save();
    } else {
      preferences = await Preference.create({
        user: req.user.id,
        lateNightThreshold,
        enableUnknownAreaAlerts,
        deviationSensitivity,
        autoAlertTrustedContacts,
      });
    }

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getPreferences = async (req, res) => {
  try {
    const preferences = await Preference.findOne({
      user: req.user.id,
    });

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  updatePreferences,
  getPreferences,
};