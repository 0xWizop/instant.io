# Low Latency Single Server Deployment Script
# This deploys your server to a central location for global low latency

Write-Host "=== Low Latency Single Server Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Check if Fly CLI is installed
$flyInstalled = Get-Command fly -ErrorAction SilentlyContinue

if (-not $flyInstalled) {
    Write-Host "Fly.io CLI not found. Installing..." -ForegroundColor Yellow
    iwr https://fly.io/install.ps1 -useb | iex
    Write-Host "Please restart PowerShell and run this script again." -ForegroundColor Yellow
    exit
}

Write-Host "Choose deployment method:" -ForegroundColor Green
Write-Host "1. Fly.io (Recommended - automatic edge routing)"
Write-Host "2. Google Cloud Run (US East - best global location)"
Write-Host "3. Exit"
Write-Host ""

$choice = Read-Host "Enter choice (1-3)"

switch ($choice) {
    "1" {
        Write-Host "`nDeploying to Fly.io..." -ForegroundColor Cyan
        Write-Host "This will deploy to US East (Virginia) with automatic edge routing." -ForegroundColor Yellow
        Write-Host "All players will connect to ONE server with optimized global routing." -ForegroundColor Yellow
        Write-Host ""
        
        # Check if already logged in
        fly auth whoami 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Please login to Fly.io:" -ForegroundColor Yellow
            fly auth login
        }
        
        Write-Host "Launching app..." -ForegroundColor Cyan
        fly launch --no-config --name instant-io-server --region iad --yes
        
        Write-Host "Deploying..." -ForegroundColor Cyan
        fly deploy
        
        Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
        Write-Host "Your server URL will be: https://instant-io-server.fly.dev" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Update client/index.html with:" -ForegroundColor Yellow
        Write-Host "  window.BACKEND_URL = 'instant-io-server.fly.dev';" -ForegroundColor White
    }
    
    "2" {
        Write-Host "`nDeploying to Google Cloud Run (US East)..." -ForegroundColor Cyan
        Write-Host "This requires Google Cloud SDK (gcloud) to be installed." -ForegroundColor Yellow
        Write-Host ""
        
        # Check if gcloud is installed
        $gcloudInstalled = Get-Command gcloud -ErrorAction SilentlyContinue
        if (-not $gcloudInstalled) {
            Write-Host "❌ Google Cloud SDK not found!" -ForegroundColor Red
            Write-Host "Install from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
            exit
        }
        
        Write-Host "Enter your Google Cloud Project ID:" -ForegroundColor Yellow
        $projectId = Read-Host "Project ID"
        
        Write-Host "`nBuilding Docker image..." -ForegroundColor Cyan
        gcloud builds submit --tag gcr.io/$projectId/instant-io-server
        
        Write-Host "Deploying to us-east1 (Virginia)..." -ForegroundColor Cyan
        gcloud run deploy instant-io-server `
            --image gcr.io/$projectId/instant-io-server `
            --platform managed `
            --region us-east1 `
            --allow-unauthenticated `
            --port 8080 `
            --memory 512Mi `
            --cpu 1 `
            --min-instances 1 `
            --max-instances 10
        
        Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
        Write-Host "Your server URL will be shown above." -ForegroundColor Cyan
        Write-Host "Update client/index.html with your Cloud Run URL." -ForegroundColor Yellow
    }
    
    "3" {
        Write-Host "Exiting..." -ForegroundColor Yellow
        exit
    }
    
    default {
        Write-Host "Invalid choice. Exiting..." -ForegroundColor Red
        exit
    }
}

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Update client/index.html with your backend URL" -ForegroundColor White
Write-Host "2. Deploy client: firebase deploy --only hosting" -ForegroundColor White
Write-Host "3. Test latency from different locations" -ForegroundColor White
Write-Host ""
Write-Host "All players will connect to ONE server with low latency!" -ForegroundColor Green

