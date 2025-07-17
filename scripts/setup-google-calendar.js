#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupGoogleCalendar() {
    console.log('📅 Google Calendar Integration Setup');
    console.log('=====================================\n');
    
    console.log('🎯 This setup will enable Google Calendar integration for your Team CRM.');
    console.log('Your AI assistants will be able to:');
    console.log('• Schedule and manage meetings');
    console.log('• Check availability and suggest times');
    console.log('• Process calendar-related emails');
    console.log('• Provide calendar insights and summaries\n');
    
    console.log('📋 Setup Steps:');
    console.log('1. Google Cloud Console Configuration');
    console.log('2. OAuth2 Credentials Setup');
    console.log('3. Environment Variables Configuration');
    console.log('4. Team Configuration Update\n');
    
    console.log('🚀 Let\'s get started!\n');
    
    // Step 1: Google Cloud Console Instructions
    console.log('📝 STEP 1: Google Cloud Console Setup');
    console.log('=====================================');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing project');
    console.log('3. Enable the Google Calendar API:');
    console.log('   • Go to "APIs & Services" > "Library"');
    console.log('   • Search for "Google Calendar API"');
    console.log('   • Click "Enable"\n');
    
    // Step 2: OAuth2 Setup
    console.log('🔐 STEP 2: OAuth2 Credentials Setup');
    console.log('===================================');
    console.log('1. Go to "APIs & Services" > "Credentials"');
    console.log('2. Click "Create Credentials" > "OAuth 2.0 Client IDs"');
    console.log('3. Configure OAuth consent screen:');
    console.log('   • User Type: External');
    console.log('   • App name: "Team CRM Calendar Integration"');
    console.log('   • User support email: your email');
    console.log('   • Developer contact: your email');
    console.log('   • Add scopes: https://www.googleapis.com/auth/calendar');
    console.log('   • Add test users: your team member emails\n');
    
    console.log('4. Create OAuth 2.0 Client ID:');
    console.log('   • Application type: Web application');
    console.log('   • Name: "Team CRM Web Client"');
    console.log('   • Authorized redirect URIs:');
    console.log('     https://team-crm.onrender.com/auth/google/callback');
    console.log('     http://localhost:10000/auth/google/callback (for local testing)\n');
    
    // Step 3: Environment Variables
    console.log('⚙️  STEP 3: Environment Variables');
    console.log('=================================');
    console.log('Add these to your Render environment variables:\n');
    
    const envVars = `# Google Calendar Integration
GOOGLE_CALENDAR_CLIENT_ID=your_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=https://team-crm.onrender.com/auth/google/callback
GOOGLE_CALENDAR_TIMEZONE=America/Chicago
GOOGLE_CALENDAR_WORKING_HOURS_START=9
GOOGLE_CALENDAR_WORKING_HOURS_END=17

# Additional Calendar Settings
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_SYNC_INTERVAL=300
GOOGLE_CALENDAR_MAX_EVENTS=100`;
    
    console.log(envVars);
    
    // Step 4: Update Configuration
    console.log('\n📁 STEP 4: Configuration Files');
    console.log('==============================');
    
    try {
        // Create environment variables template
        await fs.writeFile('google-calendar-env-vars.txt', envVars);
        console.log('✅ Created: google-calendar-env-vars.txt');
        
        // Update team configuration
        const configPath = path.join(__dirname, '../config/team-config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Enable calendar integration
        config.calendar = {
            enabled: true,
            provider: "google",
            settings: {
                clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || null,
                clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || null,
                redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || "https://team-crm.onrender.com/auth/google/callback",
                timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || "America/Chicago",
                workingHoursStart: parseInt(process.env.GOOGLE_CALENDAR_WORKING_HOURS_START) || 9,
                workingHoursEnd: parseInt(process.env.GOOGLE_CALENDAR_WORKING_HOURS_END) || 17,
                scopes: [
                    "https://www.googleapis.com/auth/calendar",
                    "https://www.googleapis.com/auth/calendar.events"
                ]
            }
        };
        
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log('✅ Updated: config/team-config.json (calendar enabled)');
        
        // Create setup instructions
        const instructions = `# Google Calendar Integration Setup Instructions

## Quick Setup Checklist

### 1. Google Cloud Console
- [ ] Create/select project at https://console.cloud.google.com/
- [ ] Enable Google Calendar API
- [ ] Configure OAuth consent screen
- [ ] Create OAuth 2.0 Client ID
- [ ] Copy Client ID and Client Secret

### 2. Render Environment Variables
Add these to your Render dashboard:
\`\`\`
GOOGLE_CALENDAR_CLIENT_ID=your_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=https://team-crm.onrender.com/auth/google/callback
GOOGLE_CALENDAR_TIMEZONE=America/Chicago
GOOGLE_CALENDAR_WORKING_HOURS_START=9
GOOGLE_CALENDAR_WORKING_HOURS_END=17
GOOGLE_CALENDAR_ENABLED=true
\`\`\`

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
`;
        
        await fs.writeFile('GOOGLE_CALENDAR_SETUP_INSTRUCTIONS.md', instructions);
        console.log('✅ Created: GOOGLE_CALENDAR_SETUP_INSTRUCTIONS.md');
        
    } catch (error) {
        console.error('❌ Error creating configuration files:', error.message);
    }
    
    console.log('\n🎉 Setup Complete!');
    console.log('==================');
    console.log('Next steps:');
    console.log('1. Follow the Google Cloud Console instructions above');
    console.log('2. Add the environment variables to Render');
    console.log('3. Redeploy your service');
    console.log('4. Test the calendar integration');
    
    console.log('\n📚 Additional Resources:');
    console.log('• google-calendar-env-vars.txt - Environment variables template');
    console.log('• GOOGLE_CALENDAR_SETUP_INSTRUCTIONS.md - Detailed setup guide');
    console.log('• config/team-config.json - Updated with calendar settings');
    
    console.log('\n🚀 Your Team CRM will have powerful calendar integration!');
}

setupGoogleCalendar(); 