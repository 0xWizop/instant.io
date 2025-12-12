# Complete authentication and deployment script
# Run this in your own PowerShell terminal

Write-Host "Step 1: Authenticating with Google Cloud..." -ForegroundColor Green
Write-Host "This will open your browser - please complete authentication" -ForegroundColor Yellow
gcloud auth login

Write-Host "`nStep 2: Setting project..." -ForegroundColor Green
gcloud config set project instantmerge

Write-Host "`nStep 3: Enabling required APIs..." -ForegroundColor Green
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com

Write-Host "`nStep 4: Building Docker image..." -ForegroundColor Green
gcloud builds submit --tag gcr.io/instantmerge/instant-io-server

Write-Host "`nStep 5: Deploying to Cloud Run..." -ForegroundColor Green
$deployOutput = gcloud run deploy instant-io-server `
  --image gcr.io/instantmerge/instant-io-server `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated `
  --port 8080 `
  --memory 512Mi `
  --cpu 1

Write-Host "`nStep 6: Extracting backend URL..." -ForegroundColor Green
$urlMatch = $deployOutput | Select-String -Pattern "https://.*\.run\.app"
if ($urlMatch) {
    $fullUrl = $urlMatch.Matches[0].Value
    $backendUrl = $fullUrl -replace "https://", ""
    Write-Host "`nBackend URL: $backendUrl" -ForegroundColor Cyan
    
    Write-Host "`nStep 7: Updating client configuration..." -ForegroundColor Green
    $htmlFile = "client\index.html"
    $content = Get-Content $htmlFile -Raw
    $content = $content -replace "window\.BACKEND_URL = '';", "window.BACKEND_URL = '$backendUrl';"
    Set-Content $htmlFile $content
    Write-Host "Updated $htmlFile with backend URL" -ForegroundColor Green
    
    Write-Host "`nStep 8: Deploying updated client..." -ForegroundColor Green
    firebase deploy --only hosting
    
    Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
    Write-Host "Your game is available at: https://instantmerge.web.app" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠️ Could not extract backend URL from deployment output" -ForegroundColor Yellow
    Write-Host "Please check the output above for the Service URL and manually update client/index.html" -ForegroundColor Yellow
}
