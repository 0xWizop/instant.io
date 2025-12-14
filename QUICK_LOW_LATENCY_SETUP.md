# Quick Low Latency Setup

## Fastest Solution: Deploy to Multiple Regions

### Option 1: Fly.io (Easiest - Recommended)

1. **Install Fly CLI:**
   ```powershell
   # Windows PowerShell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Create `fly.toml` in project root:**
   ```toml
   app = "instant-io-server"
   primary_region = "iad"

   [build]
     builder = "paketobuildpacks/builder:base"

   [env]
     PORT = "8080"

   [[services]]
     internal_port = 8080
     protocol = "tcp"
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0

     [[services.ports]]
       port = 80
       handlers = ["http"]
       force_https = true

     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]

   # Deploy to multiple regions automatically
   [[services.regions]]
     code = "iad"  # US East (Virginia) - Best for US/Canada
   
   [[services.regions]]
     code = "lhr"  # Europe (London) - Best for Europe
   
   [[services.regions]]
     code = "nrt"  # Asia (Tokyo) - Best for Asia
   ```

4. **Deploy:**
   ```bash
   fly launch
   fly deploy
   ```

5. **Fly.io automatically routes users to nearest region!** No client code changes needed.

### Option 2: Multi-Region Cloud Run (More Control)

1. **Deploy to 3 regions:**
   ```bash
   # Build once
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/instant-io-server
   
   # Deploy to US
   gcloud run deploy instant-io-server-us \
     --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
     --region us-east1 \
     --allow-unauthenticated \
     --port 8080
   
   # Deploy to Europe
   gcloud run deploy instant-io-server-eu \
     --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
     --region europe-west1 \
     --allow-unauthenticated \
     --port 8080
   
   # Deploy to Asia
   gcloud run deploy instant-io-server-asia \
     --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
     --region asia-northeast1 \
     --allow-unauthenticated \
     --port 8080
   ```

2. **Update `client/index.html`:**
   ```html
   <script>
     // Multi-region setup
     window.BACKEND_REGIONS = {
       us: 'instant-io-server-us-xxxxx-ue.a.run.app',
       eu: 'instant-io-server-eu-xxxxx-ew.a.run.app',
       asia: 'instant-io-server-asia-xxxxx-an.a.run.app'
     };
   </script>
   <script src="regionSelector.js"></script>
   <script type="module" src="game.js"></script>
   ```

3. **The region selector will automatically pick the fastest region!**

## Quick Fix: Change Current Region

If you're using Cloud Run, just redeploy to a better region:

```bash
# For US/Canada users - use us-east1 (Virginia)
gcloud run deploy instant-io-server \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080

# For European users - use europe-west1 (Belgium)
gcloud run deploy instant-io-server \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080
```

## Test Your Latency

1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by "WS" (WebSocket)
4. Connect to your game
5. Check the latency in the Network tab

**Good latency:**
- < 50ms: Excellent (same region)
- 50-100ms: Good (nearby region)
- 100-200ms: Acceptable (distant region)
- > 200ms: Poor (needs better region)

## Cost Comparison

- **Fly.io**: Free tier = 3 shared VMs (perfect for 3 regions!)
- **Cloud Run**: Pay per request (~$0.40 per million requests)
- **Single region**: Cheapest but higher latency for distant users

## Recommendation

**Start with Fly.io** - it's the easiest way to get multi-region deployment with automatic routing. No code changes needed!

