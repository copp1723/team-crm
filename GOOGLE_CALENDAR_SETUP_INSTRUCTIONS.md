# Google Calendar Integration Setup Instructions

## Quick Setup Checklist

### 1. Google Cloud Console
- [ ] Create/select project at https://console.cloud.google.com/
- [ ] Enable Google Calendar API
- [ ] Configure OAuth consent screen
- [ ] Create OAuth 2.0 Client ID
- [ ] Copy Client ID and Client Secret

### 2. Render Environment Variables
Add these to your Render dashboard:
```
GOOGLE_CALENDAR_CLIENT_ID=your_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=https://team-crm.onrender.com/auth/google/callback
GOOGLE_CALENDAR_TIMEZONE=America/Chicago
GOOGLE_CALENDAR_WORKING_HOURS_START=9
GOOGLE_CALENDAR_WORKING_HOURS_END=17
GOOGLE_CALENDAR_ENABLED=true
```

### 3. Test Integration
- [ ] Redeploy your Render service
- [ ] Test calendar access at /admin
- [ ] Try scheduling a test meeting
- [ ] Verify calendar sync works

## Features You'll Get
- Smart meeting scheduling
- Conflict detection
- Calendar insights
- Email-to-calendar processing
- Team calendar visibility
- Natural language calendar queries

## Support
If you need help, check the server logs and admin interface for debugging information.
