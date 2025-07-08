# Team CRM - Executive Awareness System

**Team CRM is an AI-powered system designed for busy executives to receive concise, actionable intelligence from their sales team's activities, cutting through the noise of traditional reporting.**

It transforms unstructured, natural language updates from team members into prioritized insights, risks, and opportunities, displayed on a clean, real-time Executive Dashboard.

## Core Philosophy: Signal Over Noise

This system is built with a strong emphasis on respecting executive time:
- **No Emojis & Stark Interface**: Professional, focused user experience.
- **Natural Language Input**: Team members communicate naturally.
- **AI-Driven Prioritization**: Surfaces only what truly requires attention.
- **Real Intelligence**: AI that understands business context.

## Key Features

- **Executive Dashboard**: A stark, minimalist interface displaying only critical information and a real-time activity feed.
- **Natural Language Team Updates**: Sales representatives can write their updates conversationally via a dedicated chat interface.
- **AI Intelligence Engine**: Automatically processes team inputs to extract priorities, identify risks, and highlight opportunities.
- **Conversation Memory**: Allows querying past interactions and data points (e.g., "What was the quote given to Acme Corp last month?"). Powered by Supermemory.
- **Real-time Updates**: Leverages WebSockets to provide live updates on the Executive Dashboard.
- **Admin Interface**: For user management and system configuration without needing direct code access.
- **Secure**: Features basic authentication (in production), executive-only admin access, and secure password generation.

## Getting Started

### Prerequisites

- Node.js and npm
- PostgreSQL database
- API Keys:
    - `OPENROUTER_API_KEY` (Required for AI processing)
    - `SUPERMEMORY_API_KEY` (Optional, for enhanced conversation memory)

### Local Development Setup

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up environment variables:**
    Copy `.env.example` to `.env` and populate it with your database URL and API keys.
    ```bash
    cp .env.example .env
    # Edit .env with your credentials
    ```
    Key variables:
    - `OPENROUTER_API_KEY`: Your OpenRouter API key.
    - `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:password@host:port/database`).
    - `SUPERMEMORY_API_KEY`: (Optional) Your Supermemory API key.
    - `PORT`: Server port (defaults to `3000`).
    - `NODE_ENV`: Set to `production` to enable authentication.

4.  **Initialize the database:**
    ```bash
    node scripts/setup-database.js
    ```
5.  **Start the server:**
    ```bash
    npm start
    ```

### Accessing the System

-   **Team Input Interface**: `http://localhost:3000/chat`
-   **Executive Dashboard**: `http://localhost:3000/executive-dashboard`
-   **Admin Panel**: `http://localhost:3000/admin`
-   **API Documentation**: `http://localhost:3000/api/docs` (Available when the server is running)

## Deployment

Deployment can be easily managed using [Render](https://render.com/).
1. Push your repository to GitHub.
2. Connect your GitHub repository to Render.
3. Deploy using the included `render.yaml` configuration file.
4. Set your environment variables in the Render dashboard.

For detailed instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project Structure Overview

```
├── config/               # System configuration (team settings, feature flags)
├── docs/                 # Project documentation
├── scripts/              # CLI scripts (user management, DB setup)
├── src/                  # Main source code
│   ├── ai/               # AI agents, context engines, memory integration
│   ├── api/              # REST API endpoints (admin, executive intelligence)
│   ├── core/             # Core business logic (agents, analytics, database, orchestration)
│   ├── middleware/       # Express.js middleware (auth, rate limiting, validation)
│   ├── websocket/        # Real-time communication management
│   └── team-crm-server.js # Main application server file
├── test/                 # Automated tests
├── web-interface/        # Frontend HTML files for the interfaces
├── .env.example          # Example environment variables
├── package.json          # Project dependencies and scripts
├── render.yaml           # Render deployment configuration
└── start.js              # Application entry point
```
For a more detailed breakdown, see [docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md).

## Configuration

-   **Team Configuration**: Managed via `config/team-config.json`. This includes team member definitions, AI model selections, business rules, and integration settings. Some aspects can be managed via the Admin UI.
-   **Feature Flags**: Toggle features using `config/feature-flags.json`.
-   **Environment Variables**: Essential for API keys, database connections, and operational settings (see "Local Development Setup").

## User Management

Users can be managed via the Admin Panel or through the command-line interface:

-   **Interactive CLI:**
    ```bash
    node scripts/manage-users.js
    ```
-   **Direct CLI Commands:**
    ```bash
    # Add a new user
    node scripts/manage-users.js add <username> "<Full Name>" "<Role>"

    # Set a user as an executive
    node scripts/manage-users.js set-executive <username>
    ```
-   **Bulk Import:**
    Import users from a CSV file.
    ```bash
    node scripts/bulk-import-users.js path/to/your/users.csv
    ```

## Contributing

Contributions are welcome. Please adhere to the existing coding style and ensure any new features align with the project's design philosophy.

## Support

If you encounter issues or have questions:
1.  Review the API documentation locally at `/api/docs`.
2.  Check application logs for errors or debugging information.
3.  Ensure all required environment variables are correctly set.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
