# NAVI Production Deployment Guide

## 1. Database (MongoDB Atlas)
1. Create a free/shared or dedicated cluster on **MongoDB Atlas**.
2. Copy the connection string: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/navi?retryWrites=true&w=majority`.

---

## 2. Deploy `ml_service` (FastAPI)
Deploy `ml_service/` using [ml_service/Dockerfile](ml_service/Dockerfile) on **Render**, **Railway**, or **Fly.io**:
- **Port:** `8000`
- **Health Check:** `GET /health`
- **Environment Variable:**
  ```env
  ML_SERVICE_API_KEY=<generate-a-long-random-secret>
  ```

---

## 3. Deploy `backend` (Node.js + Socket.IO)
Deploy `backend/` using [backend/Dockerfile](backend/Dockerfile) on **Render**, **Railway**, or **Fly.io**:
- **Port:** `5000`
- **Health Check:** `GET /health`
- **Environment Variables:**
  ```env
  NODE_ENV=production
  PORT=5000
  MONGO_URI=mongodb+srv://...
  JWT_SECRET=<generate-a-long-random-secret>
  ADMIN_API_KEY=<generate-a-long-random-secret>
  ML_SERVICE_URL=https://<your-ml-service-url>
  ML_SERVICE_TIMEOUT_MS=5000
  ML_SERVICE_API_KEY=<same-key-as-ml_service>
  PUBLIC_APP_URL=https://<your-backend-url>
  SMTP_SERVICE=gmail
  SMTP_USER=<your-email>
  SMTP_PASS=<your-app-password>
  ```
  *(Note: `NODE_ENV=production` refuses to start if `JWT_SECRET` is still a placeholder.)*

---

## 4. Seed Area Safety Data in Production
Once deployed, sync real OpenStreetMap zones for your target city:
```powershell
python scripts/sync_osm_area_risk.py --lat 16.83334 --lon 81.52774 --radius 5000 --backend-url https://<your-backend-url> --admin-key <your-admin-api-key>
```

---

## 5. Build the Mobile App (`frontend/` via EAS)
1. Set `EXPO_PUBLIC_API_URL=https://<your-backend-url>` in `frontend/.env` (or EAS Secrets).
2. Add your Google Maps API key in `frontend/app.json` under `android.config.googleMaps.apiKey` / `ios.config.googleMapsApiKey` for production maps.
3. Build with Expo Application Services ([eas.json](frontend/eas.json)):
   ```powershell
   cd frontend
   npx eas-cli login
   npx eas-cli build --platform android --profile preview
   ```

---

## Alternative: Self-Hosted VPS with Docker Compose
```powershell
docker compose up -d --build
```
Put **Caddy** or **Nginx** in front of port `5000` with TLS (`https://api.your-domain.com`) so mobile background requests and live-share links use HTTPS.
