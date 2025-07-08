# Team CRM - Executive Awareness System

A modern, AI-powered system for busy executives to stay in the loop with their sales team's activities without the noise.

## Overview

Team CRM transforms unstructured team updates into actionable executive intelligence. Sales reps share their daily activities naturally, and AI extracts what matters for executive attention.

## Key Features

- **Executive Dashboard**: Clean, stark interface showing only what requires attention
- **Natural Language Input**: Team members write updates conversationally
- **AI Intelligence**: Automatic extraction of priorities, risks, and opportunities
- **Memory Integration**: Query past conversations with "What did I quote Acme last month?"
- **Real-time Updates**: WebSocket-powered live activity feed
- **Admin Interface**: Manage users and system settings without touching code

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start the server
npm start
```

Access at:
- Team Input: http://localhost:3000/chat
- Executive Dashboard: http://localhost:3000/executive-dashboard
- Admin Panel: http://localhost:3000/admin

### Deployment on Render

1. Push to GitHub
2. Connect repository to Render
3. Deploy using the included `render.yaml`
4. Set environment variables in Render dashboard

See [RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md) for detailed instructions.

## Architecture

```
src/
├── api/              # REST API endpoints
├── ai/               # AI agents and processors
├── core/             # Core business logic
├── middleware/       # Express middleware
├── websocket/        # Real-time communications
└── team-crm-server.js # Main server file

web-interface/
├── chat.html         # Team input interface
├── executive-dashboard.html # Executive view
└── admin.html        # Admin interface
```

## Configuration

System configuration via `config/team-config.json`:
- Team member definitions
- AI model selections
- Business rules and thresholds
- Integration settings

## User Management

Add users via admin interface or CLI:

```bash
# Interactive mode
node scripts/manage-users.js

# Direct commands
node scripts/manage-users.js add sarah "Sarah Johnson" "Sales Executive"
node scripts/manage-users.js set-executive sarah

# Bulk import
node scripts/bulk-import-users.js users.csv
```

## Environment Variables

Required:
- `OPENROUTER_API_KEY` - For AI processing
- `DATABASE_URL` - PostgreSQL connection

Optional:
- `SUPERMEMORY_API_KEY` - For conversation memory
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Set to 'production' for auth

## Security

- Basic authentication in production
- Executive-only access to admin panel
- Secure password generation for all users
- Environment-based configuration

## Design Philosophy

- **No Emojis**: Professional, stark interface
- **Signal over Noise**: Only surface what matters
- **Executive Time**: Respect attention as scarce resource
- **Natural Input**: Let sales reps write naturally
- **Real Intelligence**: AI that understands business context

## Support

For issues or questions:
- Check API documentation at `/api/docs`
- Review logs for debugging
- Ensure all environment variables are set correctly

## License

MIT License - See LICENSE file for details