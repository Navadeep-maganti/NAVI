const axios = require("axios");

const mlClient = axios.create({
  baseURL: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000",
  timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS || 5000),
  headers: process.env.ML_SERVICE_API_KEY
    ? { "X-ML-Service-Key": process.env.ML_SERVICE_API_KEY }
    : {},
});

const getLocationRisk = async (location) => {
  try {
    const response = await mlClient.post("/v1/location-risk", location);
    return response.data;
  } catch (error) {
    const serviceError = new Error(
      error.response?.data?.detail || error.message || "ML service request failed"
    );
    serviceError.status = error.response?.status;
    throw serviceError;
  }
};

const learnBehaviorProfile = async (locations) => {
  try {
    const response = await mlClient.post("/v1/behavior-profile/learn", { locations });
    return response.data;
  } catch (error) {
    const serviceError = new Error(
      error.response?.data?.detail || error.message || "ML service request failed"
    );
    serviceError.status = error.response?.status;
    throw serviceError;
  }
};

module.exports = { getLocationRisk, learnBehaviorProfile };
