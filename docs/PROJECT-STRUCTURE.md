# Project Structure

## Core Directories

```
team-crm/
├── config/               # Configuration files
│   ├── team-config.json  # Team members and AI settings
│   └── feature-flags.json # Feature toggles
│
├── src/                  # Source code
│   ├── api/              # REST API endpoints
│   │   ├── admin-api.js  # Admin management endpoints
│   │   └── executive-intelligence-api.js # Executive data API
│   │
│   ├── ai/               # AI agents and processors
│   │   ├── agents/       # Individual AI agents
│   │   └── processors/   # Data processors
│   │
│   ├── core/             # Core business logic
│   │   ├── orchestration/ # Team orchestrator
│   │   ├── persistence/  # Data persistence layer
│   │   └── state-management/ # State handling
│   │
│   ├── middleware/       # Express middleware
│   │   ├── auth.js       # Authentication
│   │   ├── validation.js # Input validation
│   │   └── enhanced-rate-limiting.js # Rate limiting
│   │
│   ├── websocket/        # Real-time communications
│   │   └── realtime-manager.js # WebSocket handler
│   │
│   └── team-crm-server.js # Main server file
│
├── web-interface/        # Frontend HTML files
│   ├── chat.html         # Team input interface
│   ├── executive-dashboard.html # Executive view
│   └── admin.html        # Admin interface
│
├── scripts/              # Utility scripts
│   ├── manage-users.js   # User management CLI
│   ├── bulk-import-users.js # CSV user import
│   └── setup-database.js # Database setup
│
├── docs/                 # Documentation
│   ├── UI-GUIDE.md       # Interface guide
│   ├── DEPLOYMENT.md     # Deployment instructions
│   └── IMPLEMENTATION-SUMMARY.md # Project summary
│
└── test/                 # Test files
    └── api.test.js       # API tests
```

## Key Files

- `start.js` - Application entry point
- `setup.js` - Initial setup script
- `.env` - Environment variables (not in git)
- `render.yaml` - Render deployment config
- `package.json` - Dependencies and scripts

## Archived Content

Old and legacy files are stored in the `archive/` directory and excluded from git.

## Data Flow

1. Team members submit updates via `/chat`
2. AI processes and extracts key information
3. Important items surface to executive dashboard
4. Real-time updates via WebSocket
5. All data persisted to PostgreSQL and Supermemory

## Configuration

- Team members defined in `config/team-config.json`
- AI models and thresholds configurable via admin UI
- Environment-based settings in `.env`