import crypto from 'crypto';

export class WebhookManager {
    constructor(notificationSystem = null) {
        this.webhooks = new Map();
        this.notificationSystem = notificationSystem;
    }

    register(name, config) {
        this.webhooks.set(name, {
            ...config,
            secret: config.secret || crypto.randomBytes(32).toString('hex')
        });
    }

    async process(name, payload, signature = null) {
        const webhook = this.webhooks.get(name);
        if (!webhook) throw new Error(`Webhook ${name} not found`);

        if (webhook.secret && signature) {
            const expectedSignature = crypto
                .createHmac('sha256', webhook.secret)
                .update(JSON.stringify(payload))
                .digest('hex');
            
            if (!crypto.timingSafeEqual(
                Buffer.from(signature.replace('sha256=', '')),
                Buffer.from(expectedSignature)
            )) {
                throw new Error('Invalid webhook signature');
            }
        }

        const result = await webhook.handler(payload);
        
        if (this.notificationSystem && result?.notify) {
            await this.notificationSystem.processWebhookNotification(result);
        }

        return result;
    }

    getWebhooks() {
        return Array.from(this.webhooks.keys()).map(name => ({
            name,
            url: `/api/webhooks/${name}`,
            hasSecret: !!this.webhooks.get(name).secret
        }));
    }
}