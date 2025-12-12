# Add Cloud Build Service Account Role

The service account needs one more role: **Cloud Build Service Account**

## Quick Fix:

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=instantmerge

2. Find: `firebase-adminsdk-fbsvc@instantmerge.iam.gserviceaccount.com`

3. Click the pencil icon

4. Add role: **Cloud Build Service Account** (or `roles/cloudbuild.builds.builder`)

5. Save

## Or use command (with your personal account):

```powershell
# First authenticate with your personal account
gcloud auth login

# Then grant the role
gcloud projects add-iam-policy-binding instantmerge `
  --member="serviceAccount:firebase-adminsdk-fbsvc@instantmerge.iam.gserviceaccount.com" `
  --role="roles/cloudbuild.builds.builder"
```

After adding this role, we can continue with the deployment!
