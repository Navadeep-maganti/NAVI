# SafeCity

## ML service

The FastAPI service runs independently from the Node.js API and exposes the inference contract at `POST /v1/location-risk`.

Start it in one terminal:

```powershell
cd ml_service
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Set these values in `backend/.env` (copy the names from `backend/.env.example`):

```env
ML_SERVICE_URL=http://127.0.0.1:8000
ML_SERVICE_TIMEOUT_MS=5000
ML_SERVICE_API_KEY=
```

The backend provides the authenticated public endpoint `POST /api/ml/location-risk`; it forwards a validated request to FastAPI. Clients should not call the ML service directly.

Request body:

```json
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "accuracy": 18,
  "speed": 28,
  "timestamp": "2026-11-28T23:30:00Z"
}
```

Response body:

```json
{
  "success": true,
  "prediction": {
    "riskScore": 0.5,
    "riskLevel": "medium",
    "reasons": ["high_travel_speed", "late_night"],
    "modelVersion": "baseline-rules-v1"
  }
}
```

`baseline-rules-v1` is an initial deterministic scoring implementation. Its typed FastAPI request/response contract can remain unchanged when it is replaced by a trained model.

## Feature preparation

`POST /v1/features/location-window` accepts one to 10,000 timezone-aware location points and derives consistent training/inference features: hour, weekday, weekend flag, current coordinates, total distance, displacement, compass direction (including sine/cosine representation), speed statistics, sampling cadence, and visits within 100 metres of the latest point.

The optional `normalization` object must contain statistics saved from the training dataset. The service never calculates normalization statistics from an individual live request.

```json
{
  "locations": [
    {"latitude": 12.9715, "longitude": 77.5945, "speed": 1.2, "accuracy": 8, "timestamp": "2026-11-28T20:00:00+05:30"},
    {"latitude": 12.9716, "longitude": 77.5946, "speed": 2.0, "accuracy": 9, "timestamp": "2026-11-28T20:01:00+05:30"}
  ],
  "normalization": {
    "current_speed_mps": {"mean": 3.4, "scale": 2.1}
  }
}
```

## Behavioral learning with DBSCAN

The authenticated backend endpoint below retrieves only the requesting user's location history, sends it to the internal ML service, and stores the resulting profile when enough data is available:

```http
POST /api/ml/behavior-profile/learn?days=30
Authorization: Bearer <token>
```

Regular places are found with spatial **DBSCAN** using haversine distance, `eps=100` metres, and `min_samples=5`. Each place includes a centroid and a boundary (`boundingBox`, maximum radius, and 95th-percentile radius). DBSCAN noise points are excluded rather than incorrectly classified as familiar places and are returned as capped `unfamiliarLocations`; unfamiliar does not mean unsafe. The profile also records recurring cluster-to-cluster transitions as routine routes and hour/weekday activity counts.

The learner requires at least 50 valid points spanning seven days before persisting a profile. Until then, it returns `profileReady: false` with `dataSufficiency`, so the app can tell the user that it is still learning without making unsupported assumptions.

## Behavioral anomaly detection

After a profile is ready, send the current validated point to the authenticated backend endpoint:

```http
POST /api/ml/behavior/analyze
Authorization: Bearer <token>
```

The response includes a `deviationScore` from 0 to 1, a `normal`, `elevated`, or `high` level, and separate explainable signals for unusual location, travel time, route, and movement speed. An elevated score is an assistive signal only; it must not autonomously contact emergency services.
