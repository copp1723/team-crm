# Complete Google Calendar Integration Deployment Guide

## 🎯 Overview

This guide will walk you through setting up Google Calendar integration for your Team CRM. Once complete, your AI assistants will be able to:

- **Schedule and manage meetings** intelligently
- **Check availability** and suggest optimal times
- **Process calendar-related emails** automatically
- **Provide calendar insights** and summaries
- **Detect conflicts** and suggest alternatives
- **Handle natural language queries** like "Show me my schedule tomorrow"

---

## 📋 Prerequisites

- ✅ Team CRM deployed on Render
- ✅ Google account with Calendar access
- ✅ Domain configured (okcrm.onekeel.ai)
- ✅ Admin access to Render dashboard

---

## 🚀 Step-by-Step Setup

### **Phase 1: Google Cloud Console Setup**

#### 1.1 Create/Select Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Name it: "Team CRM Calendar Integration"

#### 1.2 Enable Google Calendar API
1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Calendar API"**
3. Click on it and press **"Enable"**

#### 1.3 Configure OAuth Consent Screen
1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. **User Type:** External
3. **App name:** "Team CRM Calendar Integration"
4. **User support email:** Your email address
5. **Developer contact:** Your email address
6. **Scopes:** Add `https://www.googleapis.com/auth/calendar`
7. **Test users:** Add your team member emails:
   - joe@onekeel.ai
   - tre@onekeel.ai
   - josh@onekeel.ai
   - kyle@onekeel.ai
   - amanda@onekeel.ai

#### 1.4 Create OAuth 2.0 Credentials
1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth 2.0 Client IDs"**
3. **Application type:** Web application
4. **Name:** "Team CRM Web Client"
5. **Authorized redirect URIs:**
   ```
   https://team-crm.onrender.com/auth/google/callback
   http://localhost:10000/auth/google/callback
   ```
6. Click **"Create"**
7. **Copy your Client ID and Client Secret** (you'll need these for the next step)

---

### **Phase 2: Render Environment Variables**

Add these environment variables to your Render dashboard:

```bash
# Google Calendar Integration
GOOGLE_CALENDAR_CLIENT_ID=your_actual_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_actual_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=https://team-crm.onrender.com/auth/google/callback
GOOGLE_CALENDAR_TIMEZONE=America/Chicago
GOOGLE_CALENDAR_WORKING_HOURS_START=9
GOOGLE_CALENDAR_WORKING_HOURS_END=17

# Additional Calendar Settings
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_SYNC_INTERVAL=300
GOOGLE_CALENDAR_MAX_EVENTS=100
```

**Important:** Replace `your_actual_client_id_here` and `your_actual_client_secret_here` with the real values from Google Cloud Console.

---

### **Phase 3: Complete Environment Variables**

Here's your complete set of environment variables for Render:

```bash
# API Keys for AI functionality
OPENROUTER_API_KEY=Sk-or-v1-4cf3561127900781affcb501864e6d16c499031b8075d9341fb7327a697e2cc3
SUPERMEMORY_API_KEY=sm_dy7m3s5FbqC2DaFMkKoTw1_TdczXjTGWRNJAMrgvFtPPSEQFDDBKfVNNMQeAExXUgYTHANSyeNfXgCKOuuweESz

# Database Configuration
DATABASE_URL=postgresql://team_crm_df27_user:ntzIjjTRwqjBDwlERyBkHSH8sdY0upm9@dpg-d1q4kner433s73e0bkrg-a.oregon-postgres.render.com/team_crm_df27?sslmode=require

# Server Configuration
PORT=10000
HOST=localhost
NODE_ENV=production

# Team Passwords
JOE_PASSWORD=joe1
CHARLIE_PASSWORD=charlie1
TRE_PASSWORD=tre1
JOSH_PASSWORD=josh1
KYLE_PASSWORD=kyle1
AMANDA_PASSWORD=amanda1

# Memory Integration
MEMORY_ENABLED=true
MEMORY_RETENTION_DAYS=30
SUPERMEMORY_BASE_URL=https://api.supermemory.ai

# Processing Configuration
BATCH_INTERVAL=300
PRIORITY_THRESHOLD=0.7

# Google Calendar Integration
GOOGLE_CALENDAR_CLIENT_ID=your_actual_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_actual_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=https://team-crm.onrender.com/auth/google/callback
GOOGLE_CALENDAR_TIMEZONE=America/Chicago
GOOGLE_CALENDAR_WORKING_HOURS_START=9
GOOGLE_CALENDAR_WORKING_HOURS_END=17
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_SYNC_INTERVAL=300
GOOGLE_CALENDAR_MAX_EVENTS=100

# Email Integration (Optional - for Mailgun)
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=okcrm.onekeel.ai
```

---

### **Phase 4: Deploy and Test**

#### 4.1 Deploy to Render
1. Add all environment variables to your Render dashboard
2. Redeploy your service
3. Wait for deployment to complete

#### 4.2 Test OAuth Flow
1. Visit: `https://team-crm.onrender.com/auth/google`
2. Complete OAuth authorization
3. Check for successful callback

#### 4.3 Test Calendar API
```bash
# List calendars
curl -X GET "https://team-crm.onrender.com/api/calendar/calendars/joe"

# Get events
curl -X GET "https://team-crm.onrender.com/api/calendar/events/joe"

# Check availability
curl -X POST "https://team-crm.onrender.com/api/calendar/availability/joe" \
  -H "Content-Type: application/json" \
  -d '{"timeSlots":[{"start":"2025-07-20T10:00:00Z","end":"2025-07-20T11:00:00Z"}]}'
```

---

## 🎉 Expected Results

After successful setup, you should see:

- ✅ **No more "calendar features will be simulated" warnings**
- ✅ **Real calendar data in API responses**
- ✅ **OAuth flow working properly**
- ✅ **Calendar events being created/read**
- ✅ **AI assistants can schedule meetings**
- ✅ **Conflict detection working**

---

## 🔍 Troubleshooting

### **OAuth Issues**
- Verify redirect URI matches exactly
- Check client ID and secret are correct
- Ensure API is enabled in Google Cloud Console
- Add your email as a test user

### **Permission Issues**
- Check calendar sharing settings
- Verify API scopes are correct
- Ensure user has calendar access

### **API Issues**
- Check environment variables are set correctly
- Verify team configuration is updated
- Check Render logs for specific errors

### **Common Error Messages**
```
"calendar features will be simulated" → OAuth not configured
"Invalid client" → Client ID/Secret incorrect
"Redirect URI mismatch" → URI doesn't match exactly
"API not enabled" → Google Calendar API not enabled
```

---

## 🚀 Advanced Features

Once basic integration is working, you can enable:

### **Smart Scheduling**
- AI suggests optimal meeting times
- Automatic conflict detection
- Working hours optimization

### **Email Integration**
- Process calendar invites from emails
- Auto-schedule meetings from email content
- Calendar insights in email responses

### **Team Calendar**
- Unified view of team schedules
- Cross-team availability checking
- Meeting coordination assistance

---

## 📞 Support

If you encounter issues:

1. **Check Render logs** for detailed error messages
2. **Verify environment variables** are set correctly
3. **Test OAuth flow** manually
4. **Check Google Cloud Console** for API quotas and errors
5. **Review team configuration** for calendar settings

---

## ✅ Completion Checklist

- [ ] Google Cloud Project created
- [ ] Google Calendar API enabled
- [ ] OAuth consent screen configured
- [ ] OAuth 2.0 credentials created
- [ ] Environment variables added to Render
- [ ] Service redeployed
- [ ] OAuth flow tested
- [ ] Calendar API tested
- [ ] AI calendar features working

**Congratulations! Your Team CRM now has powerful Google Calendar integration! 🎉** 