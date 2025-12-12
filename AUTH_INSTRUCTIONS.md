# Quick Authentication & Deployment

Since gcloud needs separate authentication, please run this script in your own PowerShell terminal:

## Run This Command:

```powershell
.\auth-and-deploy.ps1
```

This script will:
1. Open your browser for Google Cloud authentication (use your Firebase account)
2. Set the project to instantmerge
3. Enable required APIs
4. Build and deploy the backend to Cloud Run
5. Automatically update the client with the backend URL
6. Redeploy the client to Firebase

**Just run the script and follow the browser prompts!**

The script will handle everything automatically once you authenticate.
