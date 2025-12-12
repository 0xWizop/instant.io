# Grant permissions to service account
# Run this AFTER authenticating with your personal Google account (not service account)
# Run: gcloud auth login (with your personal account first)

Write-Host "Granting permissions to service account..." -ForegroundColor Green

$serviceAccount = "firebase-adminsdk-fbsvc@instantmerge.iam.gserviceaccount.com"
$project = "instantmerge"

Write-Host "`n1. Granting Cloud Build Editor role..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $project `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/cloudbuild.builds.editor"

Write-Host "`n2. Granting Service Usage Admin role..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $project `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/serviceusage.serviceUsageAdmin"

Write-Host "`n3. Granting Cloud Run Admin role..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $project `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/run.admin"

Write-Host "`n4. Granting Service Account User role..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $project `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/iam.serviceAccountUser"

Write-Host "`n5. Granting Storage Admin (for Cloud Build bucket)..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $project `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/storage.admin"

Write-Host "`n✅ Permissions granted!" -ForegroundColor Green
Write-Host "Now switch back to service account and deploy:" -ForegroundColor Cyan
Write-Host "  gcloud auth activate-service-account --key-file=service-account-key.json" -ForegroundColor White
Write-Host "  .\deploy-backend.ps1" -ForegroundColor White
