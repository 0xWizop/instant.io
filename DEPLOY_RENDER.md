# Deploy to Render (Easier Alternative)

Render is much easier than Cloud Run - no gcloud authentication needed!

## Steps:

1. **Sign up at https://render.com** (free tier available)

2. **Create a new Web Service:**
   - Go to Dashboard → New → Web Service
   - Connect your GitHub repo (or use manual deploy)
   - Settings:
     - **Name**: `instant-io-server`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node server/index.js`
     - **Environment Variables**:
       - `PORT` = `10000` (Render uses port 10000)

3. **Deploy** - Render will automatically build and deploy

4. **Get your backend URL:**
   - After deployment, you'll get a URL like: `https://instant-io-server.onrender.com`
   - Copy this URL

5. **Update client/index.html:**
   - Find: `window.BACKEND_URL = '';`
   - Change to: `window.BACKEND_URL = 'instant-io-server.onrender.com';`
   - (Remove the `https://` part)

6. **Redeploy client:**
   ```bash
   firebase deploy --only hosting
   ```

## That's it! Much simpler than Cloud Run.
