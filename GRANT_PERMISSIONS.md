# Grant Permissions to Service Account

The service account needs additional permissions to deploy. Follow these steps:

## Option 1: Using PowerShell Script (Easiest)

1. **Authenticate with your personal Google account** (not the service account):
   ```powershell
   gcloud auth login
   ```
   (This will open your browser - use your personal Google account that has owner/admin access to the Firebase project)

2. **Run the grant permissions script:**
   ```powershell
   .\grant-permissions.ps1
   ```

3. **Switch back to service account:**
   ```powershell
   gcloud auth activate-service-account --key-file=service-account-key.json
   ```

4. **Deploy:**
   ```powershell
   .\deploy-backend.ps1
   ```

## Option 2: Using Google Cloud Console (Visual)

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=instantmerge

2. Find the service account: `firebase-adminsdk-fbsvc@instantmerge.iam.gserviceaccount.com`

3. Click the pencil icon to edit

4. Add these roles:
   - **Cloud Build Editor**
   - **Service Usage Admin**
   - **Cloud Run Admin**
   - **Service Account User**
   - **Storage Admin**

5. Save

6. Then deploy:
   ```powershell
   gcloud auth activate-service-account --key-file=service-account-key.json
   .\deploy-backend.ps1
   ```

## After Permissions Are Granted

Once permissions are set, you can deploy with:
```powershell
.\deploy-backend.ps1
```
