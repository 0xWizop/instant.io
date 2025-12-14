# Low Latency Deployment Guide

This guide explains how to deploy your game server to multiple regions to reduce ping for users worldwide.

## Strategy Overview

1. **Deploy server to multiple regions** (US, Europe, Asia)
2. **Client automatically selects nearest region** based on latency
3. **Firebase Hosting** (already global CDN) serves static files

## Option 1: Multi-Region Cloud Run (Recommended)

### Step 1: Deploy to Multiple Regions

Deploy your server to multiple Google Cloud Run regions:

```bash
# US East (for US/Canada)
gcloud run deploy instant-io-server-us \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --platform managed \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1

# Europe (for Europe)
gcloud run deploy instant-io-server-eu \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1

# Asia (for Asia-Pacific)
gcloud run deploy instant-io-server-asia \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1
```

### Step 2: Update Client with Region Selection

Update `client/index.html` to include region selection logic:

```html
<script>
  // Multi-region backend URLs
  window.BACKEND_REGIONS = {
    us: 'instant-io-server-us-xxxxx-ue.a.run.app',
    eu: 'instant-io-server-eu-xxxxx-ew.a.run.app',
    asia: 'instant-io-server-asia-xxxxx-an.a.run.app'
  };
  
  // Auto-select best region based on latency
  window.SELECT_BEST_REGION = true;
</script>
```

### Step 3: Update Client Code for Region Selection

Update `client/GameClient.js` to test latency and select the best region.

## Option 2: Fly.io (Easier Multi-Region)

Fly.io makes multi-region deployment much easier:

### Step 1: Install Fly CLI
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Mac/Linux
curl -L https://fly.io/install.sh | sh
```

### Step 2: Create fly.toml

Create `fly.toml` in your project root:

```toml
app = "instant-io-server"
primary_region = "iad"  # US East

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

  [[services.ports]]
    port = 8080
    handlers = ["tls", "http"]

# Deploy to multiple regions
[[services.concurrency]]
  type = "connections"
  hard_limit = 1000
  soft_limit = 500

# Regions to deploy to
[[services.regions]]
  code = "iad"  # US East (Virginia)
  
[[services.regions]]
  code = "lhr"  # Europe (London)
  
[[services.regions]]
  code = "nrt"  # Asia (Tokyo)
```

### Step 3: Deploy
```bash
fly auth login
fly launch
fly deploy
```

Fly.io will automatically route users to the nearest region!

## Option 3: Railway with Multiple Services

Railway supports multi-region but requires separate services per region.

### Step 1: Create Multiple Services
1. Create service in US region
2. Create service in EU region  
3. Create service in Asia region

### Step 2: Use Railway's region selection
Railway can route based on DNS, but you'll need to implement client-side selection.

## Client-Side Region Selection

Add this to `client/GameClient.js`:

```javascript
async function selectBestRegion(regions) {
  const tests = Object.entries(regions).map(async ([name, url]) => {
    const start = performance.now();
    try {
      // Test WebSocket connection speed
      const ws = new WebSocket(`wss://${url}`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 2000);
        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        };
      });
      const latency = performance.now() - start;
      return { name, url, latency };
    } catch (e) {
      return { name, url, latency: Infinity };
    }
  });
  
  const results = await Promise.all(tests);
  const best = results.reduce((a, b) => a.latency < b.latency ? a : b);
  return best.url;
}
```

## Quick Fix: Optimize Current Server

If you can't do multi-region yet, optimize your current server:

### 1. Choose Better Region
- **US users**: Use `us-east1` (Virginia) or `us-central1` (Iowa)
- **European users**: Use `europe-west1` (Belgium) or `europe-west4` (Netherlands)
- **Asian users**: Use `asia-northeast1` (Tokyo) or `asia-southeast1` (Singapore)

### 2. Optimize WebSocket Settings

Already done in `server/index.js`:
- `perMessageDeflate: false` - Disables compression for lower latency
- Small payload size

### 3. Reduce Server Processing Time

Check `server/GameServer.js` - ensure game loop is optimized (already using 60 TPS).

## Recommended Approach

**For fastest setup: Use Fly.io**
- Automatic multi-region routing
- Easy deployment
- Free tier available
- Low latency globally

**For Google Cloud users: Multi-region Cloud Run**
- More control
- Better integration with Firebase
- Requires manual region selection code

## Testing Latency

After deployment, test from different locations:
- https://www.websocket.org/echo.html
- Connect to your WebSocket server
- Check latency in browser DevTools → Network → WS

## Cost Considerations

- **Cloud Run**: Pay per request, very affordable
- **Fly.io**: Free tier includes 3 shared-cpu VMs
- **Railway**: Pay per service (3 regions = 3x cost)

## Next Steps

1. Choose your deployment method
2. Deploy to multiple regions
3. Update client code for region selection
4. Test latency from different locations
5. Monitor and optimize

