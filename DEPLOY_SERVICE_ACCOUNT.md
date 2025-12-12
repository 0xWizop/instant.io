# Deploy with Service Account (No Browser Auth)

This uses a service account to avoid browser authentication.

## Steps:

1. **Create Service Account in Firebase Console:**
   - Go to https://console.firebase.google.com/project/instantmerge/settings/serviceaccounts/adminsdk
   - Click "Generate new private key"
   - Save the JSON file as `service-account-key.json` in your project root

2. **Authenticate with service account:**
   ```powershell
   gcloud auth activate-service-account --key-file=service-account-key.json
   ```

3. **Set project and enable APIs:**
   ```powershell
   gcloud config set project instantmerge
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   ```

4. **Deploy:**
   ```powershell
   .\deploy-backend.ps1
   ```

This avoids the browser authentication issue!
