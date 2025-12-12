# Enable Billing for Cloud Run

Cloud Run and Cloud Build require billing to be enabled.

## Steps:

1. **Go to Billing Settings:**
   https://console.cloud.google.com/billing?project=instantmerge

2. **Link a billing account** (or create one if you don't have one)

3. **Note:** Cloud Run has a generous free tier:
   - 2 million requests/month free
   - 360,000 GB-seconds of memory free
   - 180,000 vCPU-seconds free
   - For a small game, you'll likely stay within free tier

4. **After billing is enabled, we can continue deployment**

## Alternative: Use Render (No Billing Required)

If you prefer not to enable billing, we can use Render instead - it has a free tier and no billing setup needed.
