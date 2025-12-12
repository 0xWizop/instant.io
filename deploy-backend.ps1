# PowerShell script to deploy backend to Cloud Run
# Make sure you have gcloud CLI installed and authenticated

Write-Host "Building Docker image..." -ForegroundColor Green
gcloud builds submit --tag gcr.io/instantmerge/instant-io-server

Write-Host "`nDeploying to Cloud Run..." -ForegroundColor Green
gcloud run deploy instant-io-server `
  --image gcr.io/instantmerge/instant-io-server `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated `
  --port 8080 `
  --memory 512Mi `
  --cpu 1

Write-Host "`nDeployment complete! Check the URL above." -ForegroundColor Green
Write-Host "Copy the Cloud Run URL and update client/index.html with it." -ForegroundColor Yellow
