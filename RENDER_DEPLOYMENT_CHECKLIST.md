# Render Deployment Testing Checklist

## Prerequisites - Environment Variables on Render

To make the Team CRM work properly on Render, you need to set these environment variables in your Render dashboard:

### 🔴 Required Variables
1. **OPENROUTER_API_KEY** - Without this, AI processing won't work
   - Get from: https://openrouter.ai/keys
   - This is CRITICAL for feedback parsing

2. **DATABASE_URL** - PostgreSQL database connection
   - Render provides this automatically if you create a PostgreSQL database
   - Format: `postgresql://user:password@host:port/dbname`

3. **Authentication Passwords**
   - JOE_PASSWORD
   - CHARLIE_PASSWORD  
   - TRE_PASSWORD
   - JOSH_PASSWORD (missing from render.yaml - needs to be added!)

### 🟡 Important but Optional
4. **REDIS_URL** - For rate limiting and caching
   - Without this, real-time features may be limited

5. **MAILGUN_API_KEY** & **MAILGUN_DOMAIN** - For email integration
   - Without these, email features will be simulated

## Testing Flow: Joe's Feedback to Executive Dashboard

### Step 1: Access the Application
1. Navigate to your Render URL: `https://your-app-name.onrender.com/chat`
2. Login with:
   - Username: `joe`
   - Password: [whatever you set in JOE_PASSWORD env var]

### Step 2: Submit Feedback as Joe
1. In the chat interface, submit a natural language update like:
   ```
   Just had a great meeting with Downtown Toyota. They're interested in our premium package and want to move forward. Deal value around $15k/month. They mentioned some concerns about integration timeline but overall very positive. Need to follow up with contract by Friday.
   ```

### Step 3: Check Processing
The system should:
1. Accept the update
2. Send it to OpenRouter AI for processing
3. Extract structured data:
   - Client: Downtown Toyota
   - Deal value: $15,000/month
   - Stage: Likely "proposal" or "negotiation"
   - Action item: Send contract by Friday
   - Sentiment: Positive

### Step 4: Verify Executive Dashboard
1. Open new browser/incognito window
2. Navigate to: `https://your-app-name.onrender.com/executive-dashboard`
3. Login as:
   - Username: `tre` or `josh`
   - Password: [whatever you set in env vars]
4. You should see:
   - Joe's update in the activity feed
   - New deal or deal update
   - Action item flagged

## Common Issues & Fixes

### 1. "Cannot parse update" or AI errors
**Problem**: OpenRouter API key not set or invalid
**Fix**: Set OPENROUTER_API_KEY in Render dashboard

### 2. "Database error" or updates not persisting
**Problem**: DATABASE_URL not configured
**Fix**: 
- Create PostgreSQL database in Render
- Run migrations: `npm run db:migrate`

### 3. Updates not appearing in real-time
**Problem**: WebSocket issues or missing Redis
**Fix**: 
- Check browser console for WebSocket errors
- Consider adding Redis instance

### 4. 403 Authentication errors
**Problem**: Password environment variables not set
**Fix**: Set all user passwords in Render env vars

### 5. Executive dashboard empty
**Problem**: No data in database or AI processing failed
**Fix**: 
- Check server logs in Render dashboard
- Verify OPENROUTER_API_KEY is valid
- Check database has tables created

## Quick Test Commands

From your local machine, test the API:

```bash
# Test authentication
curl -u joe:YOUR_JOE_PASSWORD https://your-app.onrender.com/api/status

# Submit update via API
curl -u joe:YOUR_JOE_PASSWORD \
  -X POST https://your-app.onrender.com/api/update \
  -H "Content-Type: application/json" \
  -d '{"text": "Meeting with client went well. $10k deal likely."}'

# Check executive data (as tre or josh)
curl -u tre:YOUR_TRE_PASSWORD \
  https://your-app.onrender.com/api/executive-actions
```

## What's Currently Missing for Full Functionality

1. **JOSH_PASSWORD** not in render.yaml - add this line:
   ```yaml
   - key: JOSH_PASSWORD
     sync: false
   ```

2. **Database Migrations** - After DATABASE_URL is set, you need to run:
   ```bash
   npm run db:setup
   ```

3. **Initial Data** - The system needs some initial clients/deals to work with

4. **WebSocket Configuration** - Render may need additional config for WebSockets

5. **Background Jobs** - Queue processing for AI tasks might need setup

## Next Steps

1. Update render.yaml to include JOSH_PASSWORD
2. Ensure all environment variables are set in Render dashboard
3. Run database migrations after deployment
4. Test the flow step by step
5. Monitor logs for any errors

Would you like me to update the render.yaml file and create a script to help verify all requirements are met?