import { EnhancedAPIResponse } from './enhanced-api-response.js';

export class WebhookAPI {
    constructor(webhookManager) {
        this.webhookManager = webhookManager;
    }

    registerEndpoints(app) {
        // Webhook receiver endpoint
        app.post('/api/webhooks/:name', async (req, res) => {
            try {
                const { name } = req.params;
                const signature = req.headers['x-hub-signature-256'] || 
                                req.headers['x-slack-signature'];
                
                const result = await this.webhookManager.process(
                    name, 
                    req.body, 
                    signature
                );

                EnhancedAPIResponse.success(res, result, 'Webhook processed');
            } catch (error) {
                console.error(`Webhook ${req.params.name} error:`, error);
                EnhancedAPIResponse.error(res, error.message, 400);
            }
        });

        // List registered webhooks
        app.get('/api/webhooks', (req, res) => {
            const webhooks = this.webhookManager.getWebhooks();
            EnhancedAPIResponse.success(res, webhooks, 'Webhooks retrieved');
        });

        // Webhook health check
        app.get('/api/webhooks/health', (req, res) => {
            EnhancedAPIResponse.success(res, { 
                status: 'healthy',
                webhooks: this.webhookManager.getWebhooks().length
            });
        });

        // Test webhook endpoint
        app.post('/api/webhooks/test', async (req, res) => {
            try {
                const result = {
                    received: req.body,
                    timestamp: new Date().toISOString(),
                    processed: true
                };
                EnhancedAPIResponse.success(res, result, 'Test webhook received');
            } catch (error) {
                EnhancedAPIResponse.error(res, error.message, 400);
            }
        });
    }
}