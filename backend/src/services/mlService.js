const axios = require("axios");

const mlClient = axios.create({
  baseURL: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000",
  timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS || 5000),
  headers: process.env.ML_SERVICE_API_KEY
    ? { "X-ML-Service-Key": process.env.ML_SERVICE_API_KEY }
    : {},
});

const postToMl = async (path, payload) => {
  try {
    const response = await mlClient.post(path, payload);
    return response.data;
  } catch (error) {
    const serviceError = new Error(
      error.response?.data?.detail || error.message || "ML service request failed"
    );
    serviceError.status = error.response?.status;
    throw serviceError;
  }
};

const getLocationRisk = (location) => postToMl("/v1/location-risk", location);
const learnBehaviorProfile = (locations) => postToMl("/v1/behavior-profile/learn", { locations });
const adaptBehaviorProfile = (payload) => postToMl("/v1/behavior-profile/adapt", payload);
const learnTravelProfile = (locations) => postToMl("/v1/behavior-profile/travel-learn", { locations });
const analyzeBehavior = (payload) => postToMl("/v1/behavior/analyze", payload);
const assessAreaSafety = (payload) => postToMl("/v1/area-safety/assess", payload);

module.exports = {
  getLocationRisk,
  learnBehaviorProfile,
  adaptBehaviorProfile,
  learnTravelProfile,
  analyzeBehavior,
  assessAreaSafety,
};
