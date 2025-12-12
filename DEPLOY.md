# Firebase Deployment Guide

## Setup Steps

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase Project
```bash
firebase init
```
- Select "Hosting"
- Select or create a Firebase project
- Set public directory to: `client`
- Configure as single-page app: Yes
- Set up automatic builds: No

### 4. Update .firebaserc
Edit `.firebaserc` and replace `your-project-id` with your actual Firebase project ID.

### 5. Deploy Client (Firebase Hosting)
```bash
firebase deploy --only hosting
```

## Backend Server (Cloud Run)

Since Firebase Hosting only serves static files, the WebSocket server needs to run on Google Cloud Run.

### Option A: Deploy to Cloud Run via gcloud CLI

1. **Install Google Cloud SDK**
   - Download from: https://cloud.google.com/sdk/docs/install

2. **Authenticate**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Build and Deploy**
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/instant-io-server
   gcloud run deploy instant-io-server \
     --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 8080
   ```

4. **Get the Cloud Run URL**
   After deployment, you'll get a URL like: `https://instant-io-server-xxxxx.run.app`

5. **Update Client to Use Backend URL**
   - Option 1: Set environment variable in `client/index.html`:
     ```html
     <script>
       window.BACKEND_URL = 'wss://instant-io-server-xxxxx.run.app';
     </script>
     ```
   
   - Option 2: Update `GameClient.js` connect() method to use the Cloud Run URL

### Option B: Use Firebase Functions (Limited WebSocket Support)

Firebase Functions have limitations with WebSockets. Cloud Run is recommended.

## Quick Deploy Script

Create a `deploy.sh` file:
```bash
#!/bin/bash
# Deploy client to Firebase Hosting
firebase deploy --only hosting

# Deploy server to Cloud Run
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/instant-io-server
gcloud run deploy instant-io-server \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

## Testing

1. Deploy client: `firebase deploy --only hosting`
2. Your game will be available at: `https://YOUR_PROJECT_ID.web.app`
3. Make sure to update the WebSocket URL in the client to point to your Cloud Run backend
