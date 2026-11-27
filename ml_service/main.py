import os
import secrets
from datetime import datetime
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from feature_engineering import FeaturePreparationRequest, build_features
from behavioral_learning import learn_behavior_profile


app = FastAPI(title="SafeCity ML Service", version="1.0.0")
SERVICE_API_KEY = os.getenv("ML_SERVICE_API_KEY")


class LocationRiskRequest(BaseModel):
    """Location data supplied by the Node.js backend, not directly by clients."""

    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0, le=1000, description="Horizontal accuracy in metres")
    speed: float = Field(ge=0, le=100, description="Speed in metres per second")
    timestamp: datetime


class LocationRiskResponse(BaseModel):
    riskScore: float = Field(ge=0, le=1)
    riskLevel: Literal["low", "medium", "high"]
    reasons: list[str]
    modelVersion: str


def verify_service_key(x_ml_service_key: str | None = Header(default=None)) -> None:
    """Allow unauthenticated local development; require the key when configured."""
    if SERVICE_API_KEY and not secrets.compare_digest(x_ml_service_key or "", SERVICE_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ML service key")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "safecity-ml"}


@app.post("/v1/features/location-window", dependencies=[Depends(verify_service_key)])
def prepare_location_features(request: FeaturePreparationRequest) -> dict:
    """Prepare the same feature vector for training datasets and inference."""
    return build_features(request)


@app.post("/v1/behavior-profile/learn", dependencies=[Depends(verify_service_key)])
def learn_behavior(request: FeaturePreparationRequest) -> dict:
    """Learn frequent places, routine routes, and time activity from historical points."""
    return learn_behavior_profile(request.locations)


@app.post("/v1/location-risk", response_model=LocationRiskResponse, dependencies=[Depends(verify_service_key)])
def predict_location_risk(location: LocationRiskRequest) -> LocationRiskResponse:
    """Baseline inference contract; replace scoring with a trained model when available."""
    score = 0.1
    reasons: list[str] = []

    if location.accuracy > 50:
        score += 0.15
        reasons.append("low_gps_confidence")
    if location.speed >= 25:
        score += 0.25
        reasons.append("high_travel_speed")

    hour = location.timestamp.hour
    if hour >= 22 or hour < 5:
        score += 0.15
        reasons.append("late_night")

    score = min(score, 1.0)
    risk_level: Literal["low", "medium", "high"] = (
        "high" if score >= 0.65 else "medium" if score >= 0.35 else "low"
    )
    if not reasons:
        reasons.append("baseline_location_profile")

    return LocationRiskResponse(
        riskScore=score,
        riskLevel=risk_level,
        reasons=reasons,
        modelVersion="baseline-rules-v1",
    )
