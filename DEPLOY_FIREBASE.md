# Firebase Deployment Guide

## Quick Start

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase (if not already done)
```bash
firebase init hosting
```
- Select your Firebase project
- Public directory: `client`
- Single-page app: Yes
- Overwrite index.html: No (we already have one)

### 4. Update Project ID
Edit `.firebaserc` and replace `your-project-id` with your actual Firebase project ID.

### 5. Deploy Client
```bash
firebase deploy --only hosting
```

Your client will be available at: `https://YOUR_PROJECT_ID.web.app`

## Backend Server Setup (Cloud Run)

Firebase Hosting only serves static files. The WebSocket server needs to run on Google Cloud Run.

### Step 1: Install Google Cloud SDK
Download from: https://cloud.google.com/sdk/docs/install

### Step 2: Authenticate
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Step 3: Enable Required APIs
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
```

### Step 4: Build and Deploy Server
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/instant-io-server
gcloud run deploy instant-io-server \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1
```

### Step 5: Get Your Backend URL
After deployment, you'll get a URL like:
```
https://instant-io-server-xxxxx-uc.a.run.app
```

### Step 6: Update Client to Use Backend
1. Open `client/index.html`
2. Find the script tag with `window.BACKEND_URL`
3. Update it with your Cloud Run URL (without https://):
   ```html
   <script>
     window.BACKEND_URL = 'instant-io-server-xxxxx-uc.a.run.app';
   </script>
   ```

### Step 7: Redeploy Client
```bash
firebase deploy --only hosting
```

## Testing

1. Visit your Firebase Hosting URL: `https://YOUR_PROJECT_ID.web.app`
2. The game should connect to your Cloud Run backend automatically
3. Check browser console for connection status

## Troubleshooting

- **WebSocket connection fails**: Make sure Cloud Run URL is correct and includes the port if needed
- **CORS errors**: The server already includes CORS headers
- **404 errors**: Make sure you deployed the client files to Firebase Hosting

## Cost Notes

- Firebase Hosting: Free tier available
- Cloud Run: Pay per use, very affordable for small games
- First 2 million requests/month are free on Cloud Run
