# Single Server Low Latency Setup

This guide ensures all players play on **ONE server** with the lowest possible ping globally.

## Strategy

1. **Deploy to a central location** that minimizes average latency worldwide
2. **Optimize server settings** for low latency
3. **Use a service with good global routing** (even for a single server)

## Best Server Locations for Global Players

### Option 1: US East (Virginia) - **RECOMMENDED**
- **Best for**: US, Canada
- **Good for**: Europe (~80-120ms), South America
- **Average global latency**: ~100-150ms
- **Why**: Excellent connectivity hub, good routes to Europe and Asia

### Option 2: Europe West (Belgium/Netherlands)
- **Best for**: Europe
- **Good for**: US East Coast (~80-100ms), Middle East, Africa
- **Average global latency**: ~120-180ms
- **Why**: Central in Europe, good transatlantic cables

### Option 3: Fly.io with Single Instance (Best Routing)
- **Best for**: Everyone (automatic routing)
- **Why**: Fly.io routes to nearest edge, but connects to one server
- **Average global latency**: ~50-120ms (best option!)

## Deployment Instructions

### Option A: Fly.io (Easiest & Best Performance)

Fly.io provides automatic edge routing to a single server instance - perfect for your use case!

1. **Install Fly CLI:**
   ```powershell
   # Windows
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Deploy (uses existing fly.toml):**
   ```bash
   fly launch
   # When asked, use single region: iad (US East)
   fly deploy
   ```

4. **Update client/index.html:**
   ```html
   <script>
     // Fly.io automatically routes to your server with lowest latency
     window.BACKEND_URL = 'instant-io-server.fly.dev';
   </script>
   ```

**Why this works**: Fly.io has edge locations worldwide. When a user connects, they connect to the nearest Fly edge, which then routes to your single server with optimized routing. This gives you the benefits of a single server (all players together) with low latency for everyone!

### Option B: Google Cloud Run (US East)

1. **Deploy to US East (Virginia) - best global location:**
   ```bash
   # Build
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/instant-io-server
   
   # Deploy to us-east1 (Virginia) - best for global players
   gcloud run deploy instant-io-server \
     --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
     --platform managed \
     --region us-east1 \
     --allow-unauthenticated \
     --port 8080 \
     --memory 512Mi \
     --cpu 1 \
     --min-instances 1 \
     --max-instances 10
   ```

2. **Update client/index.html:**
   ```html
   <script>
     window.BACKEND_URL = 'instant-io-server-xxxxx-ue.a.run.app';
   </script>
   ```

### Option C: Render (US East)

1. **Create service in US East region**
2. **Set environment variable**: `REGION=us-east`
3. **Update client with Render URL**

## Server Optimizations (Already Applied)

The server has been optimized for low latency:

✅ **WebSocket settings:**
- `perMessageDeflate: false` - No compression delay
- `noDelay: true` - Send immediately, no buffering
- `keepAlive: true` - Maintain connections

✅ **Message optimization:**
- Rounded coordinates to reduce payload size
- Efficient JSON serialization
- Binary-ready message format

✅ **Game loop:**
- 60 TPS for smooth gameplay
- Efficient state broadcasting

## Testing Latency

After deployment, test from different locations:

1. **Browser DevTools** → Network → WS tab
2. Connect to your game
3. Check latency in the connection details

**Expected latencies from US East (Virginia):**
- US/Canada: 20-50ms ✅
- Europe: 80-120ms ✅
- Asia: 150-200ms ⚠️
- South America: 100-150ms ✅

**Expected latencies with Fly.io edge routing:**
- US/Canada: 20-50ms ✅
- Europe: 50-80ms ✅
- Asia: 100-150ms ✅
- South America: 80-120ms ✅

## Recommended Setup

**Use Fly.io** - It gives you:
- ✅ Single server (all players together)
- ✅ Automatic edge routing (low latency globally)
- ✅ Easy deployment
- ✅ Free tier available
- ✅ Automatic scaling

## Cost

- **Fly.io**: Free tier = 3 shared VMs (1 server is free!)
- **Cloud Run**: ~$0.40 per million requests + compute time
- **Render**: Free tier available

## Quick Deploy Command

```bash
# Fly.io (recommended)
fly launch
fly deploy

# Cloud Run
gcloud run deploy instant-io-server \
  --image gcr.io/YOUR_PROJECT_ID/instant-io-server \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080
```

## Result

All players will connect to **ONE server** with optimized routing for low latency. Players in different countries will have the best possible ping while still playing together in the same game world!

