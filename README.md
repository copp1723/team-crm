# TeamCRM - AI-Augmented Team Intelligence System

A clean, executive-focused CRM system that transforms team updates into actionable intelligence through AI processing. Built for busy executives who need situational awareness without information overload.

## 🎯 **Core Philosophy**

**Clean. Minimal. Intelligent.**

TeamCRM eliminates the noise and delivers only what matters - critical situations requiring your attention and real-time team intelligence. No dashboards full of charts. No overwhelming metrics. Just the essential information you need to make decisions.

## ✨ **Key Features**

### **Executive Situational Awareness**
- **Attention Items** - Only situations requiring executive intervention appear
- **Team Activity Stream** - Real-time updates from your team with AI-extracted insights
- **Direct Communication** - Message team members directly from the executive interface

### **Intelligent Processing**
- **AI-Powered Extraction** - Automatically identifies priorities, risks, and opportunities
- **Executive Escalation** - AI determines when situations need executive attention
- **Natural Language Input** - Team members write naturally; AI handles the analysis

### **Clean Design**
- **Minimal Interface** - Black header, white background, essential information only
- **Executive-Focused** - Designed for decision-makers, not data analysts
- **Mobile Responsive** - Works seamlessly on all devices

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+
- Redis (for rate limiting and job queues)
- OpenRouter API access (for AI processing)

### **Installation**

1. **Clone and Setup**
   ```bash
   git clone [repository-url]
   cd team-crm
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start the System**
   ```bash
   npm start
   ```

4. **Access Interfaces**
   - **Team Input:** http://localhost:8080/chat
   - **Executive Dashboard:** http://localhost:8080/executive-dashboard
   - **API Documentation:** http://localhost:8080/api/docs

## 🏗️ **System Architecture**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Team Input    │───▶│  AI Processing   │───▶│ Executive View  │
│   Interface     │    │   Orchestrator   │    │   Dashboard     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         └─────────────▶│  WebSocket      │◀─────────────┘
                        │  Real-time      │
                        │  Updates        │
                        └─────────────────┘
```

### **Core Components**

- **Team Orchestrator** - Central AI processing engine
- **Executive Intelligence API** - Situational awareness and intervention detection
- **Real-time Manager** - WebSocket-based live updates
- **Enhanced Rate Limiting** - Redis-backed protection and analytics
- **Team Collaboration** - Multi-room communication system

## 📖 **Usage Guide**

### **For Team Members**

1. **Navigate to Team Input** (`/chat`)
2. **Select Your Name** from the dropdown
3. **Write Natural Updates** - No special formatting required
   ```
   Example: "Met with Acme Corp today. They're concerned about the 
   implementation timeline and want to discuss a 6-month phased approach. 
   The CEO seemed hesitant about our pricing but is very interested in 
   the ROI projections we showed."
   ```
4. **Submit** - AI automatically extracts priorities and escalations

### **For Executives**

1. **Navigate to Executive Dashboard** (`/executive-dashboard`)
2. **Review Attention Items** - Only critical situations appear here
3. **Monitor Team Activity** - Real-time updates with AI insights
4. **Direct Communication** - Use @mentions to message specific team members
   ```
   Examples:
   @joe What's the latest on the Acme Corp timeline discussion?
   @charlie Can you prepare a brief on the TechCo partnership opportunity?
   ```

## 🔧 **Configuration**

### **Environment Variables**

```bash
# Server Configuration
PORT=8080
NODE_ENV=production

# AI Processing
OPENROUTER_API_KEY=your_openrouter_key

# Redis (for rate limiting and jobs)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Authentication (production)
BASIC_AUTH_USER=admin
BASIC_AUTH_PASSWORD=your_secure_password
```

### **Team Configuration**

Edit `config/team-config.json`:

```json
{
  "teamMembers": [
    {
      "key": "joe",
      "name": "Joe Martinez",
      "role": "Sales Director",
      "expertise": ["enterprise_sales", "client_relations"]
    },
    {
      "key": "charlie",
      "name": "Charlie Chen", 
      "role": "Business Development",
      "expertise": ["partnerships", "technical_sales"]
    }
  ]
}
```

## 🔌 **API Reference**

### **Core Endpoints**

```bash
# Team Updates
POST /api/update
{
  "memberName": "joe",
  "updateText": "Your natural language update...",
  "metadata": {}
}

# Executive Intelligence
GET /api/executive/attention      # Critical items requiring attention
GET /api/executive/activity       # Real-time team activity feed
POST /api/comments               # Send executive messages

# System Status
GET /health                      # System health check
GET /api/status                  # Detailed system status
GET /api/team                    # Team member information
```

### **WebSocket Events**

```javascript
// Subscribe to real-time updates
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'executive'  // or 'team-updates'
}));

// Receive real-time events
{
  type: 'channel-broadcast',
  channel: 'executive',
  data: {
    type: 'escalationCreated',
    data: { /* escalation details */ }
  }
}
```

## 🛡️ **Security Features**

- **Rate Limiting** - Redis-backed smart rate limiting with behavior analysis
- **Input Sanitization** - All inputs sanitized and validated
- **Authentication** - Basic auth for production deployments
- **CORS Protection** - Configurable cross-origin policies
- **Request Size Limiting** - Prevents oversized requests

## 📊 **Monitoring**

### **Built-in Dashboards**

- **Rate Limit Monitor** - `/rate-limits` - Real-time rate limiting analytics
- **Job Monitor** - `/jobs` - Background job processing status
- **API Documentation** - `/api/docs` - Complete API reference

### **Health Endpoints**

```bash
GET /health                      # Overall system health
GET /api/jobs/stats             # Job processing statistics
GET /admin/rate-limits/stats    # Rate limiting analytics
```

## 🚀 **Deployment**

### **Production Deployment**

1. **Set Environment Variables**
   ```bash
   NODE_ENV=production
   PORT=8080
   BASIC_AUTH_USER=admin
   BASIC_AUTH_PASSWORD=secure_password
   ```

2. **Start with PM2** (recommended)
   ```bash
   npm install -g pm2
   pm2 start start.js --name teamcrm
   pm2 startup
   pm2 save
   ```

3. **Or with Docker**
   ```bash
   docker build -t teamcrm .
   docker run -p 8080:8080 --env-file .env teamcrm
   ```

### **Render.com Deployment**

The system is pre-configured for Render.com deployment:

1. Connect your GitHub repository
2. Set environment variables in Render dashboard
3. Deploy automatically on push to main branch

## 🔧 **Development**

### **Project Structure**

```
team-crm/
├── src/
│   ├── core/                    # Core orchestration logic
│   ├── ai/                      # AI processing modules
│   ├── api/                     # REST API endpoints
│   ├── websocket/               # Real-time communication
│   ├── middleware/              # Express middleware
│   └── team-crm-server.js       # Main server entry point
├── web-interface/               # Frontend interfaces
│   ├── executive-dashboard.html # Clean executive interface
│   ├── chat.html               # Team input interface
│   └── admin.html              # Administrative interface
├── config/                      # Configuration files
├── docs/                       # Documentation
└── public/                     # Static assets
```

### **Development Commands**

```bash
npm run dev                     # Development mode with auto-restart
npm test                       # Run API tests
npm run setup                  # Initial setup wizard
```

## 🤝 **Team Communication Patterns**

### **Effective Update Examples**

**✅ Good Updates:**
```
"Acme Corp meeting went well. They're interested in our enterprise package 
but concerned about the $50K price point. CEO mentioned they're comparing 
us with TechSolutions. I think we need to emphasize our ROI advantages. 
Follow-up meeting scheduled for Friday."
```

**✅ What AI Extracts:**
- Client: Acme Corp
- Deal Status: Interested but price-sensitive
- Competitor: TechSolutions
- Action Item: Emphasize ROI advantages
- Next Step: Friday follow-up meeting

### **Executive Escalation Triggers**

AI automatically escalates when it detects:
- Deal values over $100K with risks
- Client requests for executive meetings
- Competitive threats requiring strategic response
- Technical blockers affecting major deals
- Timeline issues on critical projects

## 🆘 **Troubleshooting**

### **Common Issues**

**Server Won't Start:**
```bash
# Check if port is in use
lsof -i :8080
# Kill conflicting process
kill -9 [PID]
```

**AI Processing Fails:**
- Verify OpenRouter API key is valid
- Check rate limiting status at `/rate-limits`
- Review logs for API errors

**WebSocket Connection Issues:**
- Ensure firewall allows WebSocket connections
- Check for proxy/load balancer WebSocket support
- Verify CORS configuration

### **Support Commands**

```bash
# View system status
curl http://localhost:8080/health

# Check rate limits
curl http://localhost:8080/admin/rate-limits/stats

# View recent API activity
curl http://localhost:8080/api/jobs/recent
```

## 📝 **License**

MIT License - See LICENSE file for details.

## 🚀 **What's Next**

The system is designed to be:
- **Extensible** - Easy to add new AI processors and team members
- **Scalable** - Redis-backed components support clustering
- **Maintainable** - Clean architecture with separated concerns

Ready to transform your team communication into executive intelligence.

---

**Built for executives who value clarity over complexity.**