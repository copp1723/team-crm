# Webhook Integration Framework

## Overview
The webhook integration framework enables external systems to send data to TeamCRM through secure HTTP endpoints.

## Endpoints

### Webhook Receiver
- **POST** `/api/webhooks/{name}` - Process webhook from registered integration
- **GET** `/api/webhooks` - List registered webhooks
- **GET** `/api/webhooks/health` - Health check
- **POST** `/api/webhooks/test` - Test endpoint

## Slack Integration

### Setup
1. Set environment variables:
   ```bash
   SLACK_WEBHOOK_SECRET=your_webhook_secret
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   ```

2. Configure Slack webhook URL: `https://your-domain.com/api/webhooks/slack`

### Features
- Processes Slack messages as team updates
- Filters messages by keywords
- Integrates with existing notification system

## Security
- HMAC signature verification
- Timing-safe signature comparison
- Rate limiting through existing middleware

## Usage Example
```javascript
// Register custom webhook
webhookManager.register('custom', {
  handler: async (payload) => {
    // Process payload
    return { processed: true };
  },
  secret: 'your-secret'
});
```