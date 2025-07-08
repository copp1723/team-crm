# Deploy Team CRM to Render

## Step 1: Prepare Your Repository

First, let's create a `render.yaml` file for easy deployment:

```yaml
services:
  - type: web
    name: team-crm
    runtime: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: OPENROUTER_API_KEY
        sync: false
      - key: SUPERMEMORY_API_KEY
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: JOE_PASSWORD
        sync: false
      - key: CHARLIE_PASSWORD
        sync: false
      - key: TRE_PASSWORD
        sync: false
```

## Step 2: Push to GitHub

```bash
cd /Users/copp1723/Desktop/team-crm

# Initialize git if not already done
git init

# Add all files
git add .
git commit -m "Team CRM with clean executive interface"

# Create a new repository on GitHub and push
# Replace with your actual repository URL
git remote add origin https://github.com/YOUR_USERNAME/team-crm.git
git push -u origin main
```

## Step 3: Deploy on Render

### Option A: Using render.yaml (Easiest)
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Blueprint"
3. Connect your GitHub repo
4. Render will automatically detect the `render.yaml`
5. Click "Apply"

### Option B: Manual Setup
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: team-crm
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

## Step 4: Add Environment Variables

In Render dashboard for your service:
1. Go to "Environment" tab
2. Add these environment variables:

```
NODE_ENV=production
PORT=10000

# Your API Keys (from your .env file)
OPENROUTER_API_KEY=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
SUPERMEMORY_API_KEY=sm_dy7m3s5FbqC2DaFMkKoTw1_TdczXjTGWRNJAMrgvFtPPSEQFDDBKfVNNMQeAExXUgYTHANSyeNfXgCKOuuweESz
DATABASE_URL=postgresql://postgres.wnsfzmkgiwmkojiuiiyb:gta6nyd-mwq3rfk.MRT@aws-0-us-west-1.pooler.supabase.com:6543/postgres

# Team Passwords (CHANGE THESE!)
JOE_PASSWORD=secure-password-for-joe
CHARLIE_PASSWORD=secure-password-for-charlie
TRE_PASSWORD=secure-password-for-tre

# Optional Redis (if you add Redis later)
# REDIS_URL=your-redis-url
```

## Step 5: Deploy

1. Click "Manual Deploy" → "Deploy latest commit"
2. Wait for build to complete (2-3 minutes)
3. Your app will be available at: `https://team-crm.onrender.com`

## Step 6: Share with Team

Send secure credentials to your team:

**For Joe & Charlie:**
- URL: https://team-crm.onrender.com/chat
- Username: `joe` or `charlie`
- Password: [their secure password]

**For Tre:**
- URL: https://team-crm.onrender.com/executive-dashboard  
- Username: `tre`
- Password: [executive password]

## Important Notes

### Render Free Tier Limitations
- Services spin down after 15 minutes of inactivity
- First request after spindown takes ~30 seconds
- Perfect for your team size but consider paid tier ($7/month) for instant response

### To Keep Service Always On (Optional)
Upgrade to Starter plan ($7/month) or add a health check monitor:
- UptimeRobot (free) - ping every 5 minutes
- Better Uptime (free tier)
- Pingdom

### Custom Domain (Optional)
In Render dashboard:
1. Settings → Custom Domains
2. Add your domain (e.g., `crm.yourcompany.com`)
3. Update DNS records as instructed

## Troubleshooting

If you see any errors:
1. Check Logs tab in Render dashboard
2. Verify all environment variables are set
3. Ensure `NODE_ENV=production` is set
4. Check that passwords don't have special characters that need escaping

## Quick Commands

```bash
# View logs
render logs team-crm

# Trigger manual deploy
git push origin main
# Render auto-deploys on push

# Update environment variables
# Use Render dashboard → Environment tab
```