# Final Permission Needed

The service account needs permission to use Cloud Build's service account.

## Quick Fix via Console:

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=instantmerge

2. Find: `firebase-adminsdk-fbsvc@instantmerge.iam.gserviceaccount.com`

3. Click the pencil icon

4. Make sure this role is added: **Service Account User** (`roles/iam.serviceAccountUser`)

5. Save

## Or use command (with your personal account):

```powershell
# Authenticate with your personal account first
gcloud auth login

# Grant Service Account User role
gcloud projects add-iam-policy-binding instantmerge `
  --member="serviceAccount:firebase-adminsdk-fbsvc@instantmerge.iam.gserviceaccount.com" `
  --role="roles/iam.serviceAccountUser"
```

This should be the last permission needed!
