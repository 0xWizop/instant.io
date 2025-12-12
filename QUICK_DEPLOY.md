# Quick Deployment Fix

Your client is deployed but the backend server isn't running. Here's how to fix it:

## Step 1: Deploy Backend to Cloud Run

### Option A: Using PowerShell Script (Windows)
```powershell
.\deploy-backend.ps1
```

### Option B: Manual Commands
```bash
# Make sure you're logged in
gcloud auth login
gcloud config set project instantmerge

# Enable required APIs (first time only)
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com

# Build and deploy
gcloud builds submit --tag gcr.io/instantmerge/instant-io-server
gcloud run deploy instant-io-server --image gcr.io/instantmerge/instant-io-server --platform managed --region us-central1 --allow-unauthenticated --port 8080 --memory 512Mi --cpu 1
```

## Step 2: Get Your Backend URL

After deployment, you'll see output like:
```
Service URL: https://instant-io-server-xxxxx-uc.a.run.app
```

Copy that URL (the part after `https://`), for example: `instant-io-server-xxxxx-uc.a.run.app`

## Step 3: Update Client Configuration

1. Open `client/index.html`
2. Find this line (around line 893):
   ```html
   window.BACKEND_URL = '';
   ```
3. Replace it with:
   ```html
   window.BACKEND_URL = 'instant-io-server-xxxxx-uc.a.run.app';
   ```
   (Use your actual Cloud Run URL)

## Step 4: Redeploy Client

```bash
firebase deploy --only hosting
```

## Step 5: Test

Visit your Firebase URL: `https://instantmerge.web.app`

The game should now connect to your Cloud Run backend and you should see:
- Ping showing a value (not "--ms")
- Game entities (pellets, bots, etc.)
- Ability to play

## Troubleshooting

- **"gcloud: command not found"**: Install Google Cloud SDK from https://cloud.google.com/sdk/docs/install
- **Permission errors**: Make sure you're logged in: `gcloud auth login`
- **API not enabled**: Run the enable commands in Step 1
- **Still not connecting**: Check browser console (F12) for WebSocket connection errors
