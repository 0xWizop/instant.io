# Install Google Cloud SDK

You need to install Google Cloud SDK to deploy the backend server.

## Quick Install (Windows)

1. **Download the installer:**
   - Go to: https://cloud.google.com/sdk/docs/install
   - Download the Windows installer

2. **Or use PowerShell (recommended):**
   ```powershell
   # Download and run installer
   (New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
   & $env:Temp\GoogleCloudSDKInstaller.exe
   ```

3. **After installation, restart your terminal/PowerShell**

4. **Authenticate:**
   ```powershell
   gcloud auth login
   gcloud config set project instantmerge
   ```

5. **Enable required APIs:**
   ```powershell
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   ```

6. **Deploy the backend:**
   ```powershell
   .\deploy-backend.ps1
   ```

## Alternative: Use Firebase Functions (More Complex)

If you prefer not to use Cloud Run, we could set up Firebase Functions, but it's more complex and has WebSocket limitations. Cloud Run is the recommended approach.
