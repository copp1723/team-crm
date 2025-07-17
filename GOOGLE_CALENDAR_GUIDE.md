# 📅 Google Calendar Integration Guide

## 🎯 Overview

The Google Calendar integration in your Team CRM system provides intelligent calendar management, meeting processing, and scheduling assistance. It's designed to work seamlessly with your personal assistants to enhance productivity and coordination.

## 🔧 How It Works

### 1. **Authentication Methods**

The system supports two authentication methods:

#### **OAuth2 Authentication** (Recommended for individual users)
```javascript
// Environment variables needed:
GOOGLE_CALENDAR_CLIENT_ID=your_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
GOOGLE_CALENDAR_REDIRECT_URI=https://your-domain.com/auth/google/callback
```

#### **Service Account Authentication** (For automated systems)
```javascript
// Environment variables needed:
GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_CALENDAR_PRIVATE_KEY=your_private_key
```

### 2. **Current Status**

Based on your logs, the calendar integration is currently in **simulation mode**:
```
[WARN] Google Calendar API credentials not configured - calendar features will be simulated
```

This means:
- ✅ The system continues to work normally
- ✅ Calendar features are simulated for development
- ✅ No actual Google Calendar integration is active
- ⚠️ Real calendar operations are not performed

## 🚀 Features Available

### **When Fully Configured:**

#### 1. **Calendar Event Management**
- Create, read, update, delete calendar events
- Automatic event creation from meeting invites
- Smart scheduling with conflict detection
- Multi-calendar support

#### 2. **Meeting Intelligence**
- Process calendar invites from emails
- Extract meeting information automatically
- Detect scheduling conflicts
- Suggest optimal meeting times

#### 3. **Natural Language Queries**
```javascript
// Examples of what you can ask:
"Show me my schedule for tomorrow"
"What's my availability next week?"
"Schedule a meeting with the team for Friday"
"Find a 2-hour slot for a client call"
```

#### 4. **Smart Scheduling**
- Conflict detection and resolution
- Optimal time suggestions
- Travel time considerations
- Working hours enforcement

#### 5. **Integration with Personal Assistants**
- Each team member's assistant can manage their calendar
- Context-aware scheduling based on role and preferences
- Memory integration for scheduling patterns

## 📋 API Endpoints Available

When configured, these endpoints become available:

```javascript
// Calendar Management
GET /api/calendar/calendars/:userId          // List user's calendars
GET /api/calendar/events/:userId             // Get upcoming events
POST /api/calendar/events/:userId            // Create new event
PUT /api/calendar/events/:userId/:eventId    // Update event
DELETE /api/calendar/events/:userId/:eventId // Delete event

// Smart Scheduling
POST /api/calendar/availability/:userId      // Check availability
POST /api/calendar/optimal-time/:userId      // Find optimal meeting time
POST /api/calendar/process-meeting           // Process meeting invite
POST /api/calendar/process-followup          // Process meeting follow-up

// OAuth Authentication
GET /auth/google                             // Start OAuth flow
GET /auth/google/callback                    // Handle OAuth callback
```

## 🔄 Current Simulation Mode

### **What's Simulated:**
```javascript
// Calendar List (Simulated)
{
  "calendars": [
    {
      "id": "primary",
      "summary": "Primary Calendar (Simulated)",
      "accessRole": "owner",
      "primary": true
    }
  ]
}

// Events List (Simulated)
{
  "events": [
    {
      "id": "simulated-event-1",
      "summary": "Team Meeting (Simulated)",
      "start": { "dateTime": "2025-07-17T10:00:00Z" },
      "end": { "dateTime": "2025-07-17T11:00:00Z" }
    }
  ]
}
```

### **Benefits of Simulation Mode:**
- ✅ System development and testing
- ✅ UI/UX validation
- ✅ Integration testing
- ✅ No external dependencies
- ✅ Safe for development

## 🛠️ How to Enable Real Google Calendar Integration

### **Step 1: Set Up Google Cloud Project**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Calendar API
4. Create OAuth2 credentials or Service Account

### **Step 2: Configure Environment Variables**

Add these to your Render environment variables:

```bash
# For OAuth2 Authentication
GOOGLE_CALENDAR_CLIENT_ID=your_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=https://team-crm-26ks.onrender.com/auth/google/callback

# OR for Service Account Authentication
GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_CALENDAR_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

### **Step 3: Update Configuration**

In `config/team-config.json`, enable calendar:

```json
{
  "calendar": {
    "enabled": true,
    "provider": "google",
    "settings": {
      "clientId": "your_client_id",
      "clientSecret": "your_client_secret",
      "redirectUri": "https://team-crm-26ks.onrender.com/auth/google/callback"
    }
  }
}
```

### **Step 4: Redeploy and Test**

1. Save environment variables in Render
2. Redeploy your service
3. Test calendar integration

## 🎯 Use Cases

### **For Team Members:**
- **Joe**: Schedule dealer meetings and follow-ups
- **Tre**: Manage executive calendar and team meetings
- **Amanda**: Schedule marketing campaigns and events
- **Kyle**: Coordinate sales meetings and client calls

### **For Personal Assistants:**
- Process incoming calendar invites
- Suggest optimal meeting times
- Detect and resolve scheduling conflicts
- Create calendar events from natural language

### **For Executives:**
- Unified view of team schedules
- Strategic meeting planning
- Conflict resolution and optimization
- Executive calendar management

## 🔍 Troubleshooting

### **Common Issues:**

#### 1. **OAuth2 Flow Issues**
```javascript
// Check redirect URI matches exactly
// Ensure client ID and secret are correct
// Verify API is enabled in Google Cloud Console
```

#### 2. **Service Account Issues**
```javascript
// Verify service account email is correct
// Check private key format (include \n for line breaks)
// Ensure service account has calendar permissions
```

#### 3. **Permission Issues**
```javascript
// Check calendar sharing settings
// Verify API scopes are correct
// Ensure user has calendar access
```

### **Debug Commands:**
```bash
# Check calendar configuration
npm run fix-config

# Test calendar API endpoints
curl -X GET "https://team-crm-26ks.onrender.com/api/calendar/calendars/joe"

# Check logs for calendar errors
# Look for "Google Calendar" in Render logs
```

## 📊 Benefits of Full Integration

### **Without Calendar Integration:**
- ✅ System works normally
- ✅ All other features functional
- ⚠️ Calendar features simulated
- ⚠️ No real calendar sync

### **With Calendar Integration:**
- ✅ Real-time calendar sync
- ✅ Intelligent scheduling
- ✅ Conflict detection
- ✅ Meeting automation
- ✅ Executive calendar visibility
- ✅ Team coordination enhancement

## 🎉 Summary

The Google Calendar integration is an **optional but powerful** feature that enhances your Team CRM system. Currently, it's in simulation mode, which means:

- ✅ Your system works perfectly without it
- ✅ All core features are functional
- ✅ Calendar features are simulated for development
- 🔧 Can be enabled later when needed

The simulation mode allows you to develop and test calendar-related features without requiring Google Calendar setup, making it perfect for initial deployment and testing.

**Priority**: Low - Calendar integration can be added later when your team needs it. 