export class SlackIntegration {
    constructor(webhookManager, orchestrator) {
        this.webhookManager = webhookManager;
        this.orchestrator = orchestrator;
        this.setupWebhooks();
    }

    setupWebhooks() {
        this.webhookManager.register('slack', {
            handler: this.handleSlackWebhook.bind(this),
            secret: process.env.SLACK_WEBHOOK_SECRET
        });
    }

    async handleSlackWebhook(payload) {
        if (payload.type === 'url_verification') {
            return { challenge: payload.challenge };
        }

        if (payload.event?.type === 'message' && !payload.event.bot_id) {
            const message = payload.event.text;
            const user = payload.event.user;
            const channel = payload.event.channel;

            // Process as team update if it contains relevant keywords
            if (this.isTeamUpdate(message)) {
                await this.orchestrator.processUpdate({
                    memberName: `slack-${user}`,
                    updateText: message,
                    source: 'slack',
                    metadata: { channel, user }
                });

                return {
                    notify: true,
                    type: 'team_update',
                    source: 'slack',
                    data: { message, user, channel }
                };
            }
        }

        return { processed: true };
    }

    isTeamUpdate(message) {
        const keywords = ['update', 'client', 'deal', 'meeting', 'project', 'issue', 'completed'];
        return keywords.some(keyword => 
            message.toLowerCase().includes(keyword)
        );
    }

    async sendSlackMessage(channel, text) {
        if (!process.env.SLACK_BOT_TOKEN) return false;

        try {
            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ channel, text })
            });

            return response.ok;
        } catch (error) {
            console.error('Slack message send failed:', error);
            return false;
        }
    }
}