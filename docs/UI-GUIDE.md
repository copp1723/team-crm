# Team CRM - Executive Awareness System

A clean, professional interface for busy executives to stay informed about team activities without the noise.

## Access Points

### Executive View
- **URL**: http://localhost:3000/executive-dashboard
- **Purpose**: Shows only what requires executive attention
- **Features**:
  - Bullet-point list of items requiring attention
  - Real-time activity stream from team members
  - Direct messaging to team members

### Team Input
- **URL**: http://localhost:3000/chat
- **Purpose**: Where Joe and Charlie submit their updates
- **Features**:
  - Natural language memory queries via Supermemory integration
  - Quick templates for common update types
  - Real-time AI extraction feedback
  - Activity log showing what gets surfaced to executives

## Design Philosophy
- NO EMOJIS anywhere in the interface
- Stark black and white design with minimal color
- No fake features or sales-y elements
- Focus on actual functionality that works
- Built for modern executives who need signal, not noise

## Starting the Server
```bash
cd /Users/copp1723/Desktop/team-crm
npm start
```

The server runs on port 3000 (configured in .env file).

## Key Features
1. **Supermemory Integration**: Team members can query past conversations naturally
2. **Real-time WebSocket Updates**: Live activity feeds without page refresh
3. **AI Extraction**: Automatic identification of important items for executive attention
4. **Clean Design**: Professional, distraction-free interface

## Architecture
- Express.js server with WebSocket support
- OpenRouter AI for intelligent extraction
- Supermemory for conversation persistence
- PostgreSQL for data storage
- Real-time updates via WebSocket