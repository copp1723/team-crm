/**
 * Email Router
 * Routes incoming emails to appropriate team member assistants
 */

import { db } from '../database/connection.js';
import { logger } from '../../utils/logger.js';
import { emailParser } from './email-parser.js';
import { mailgunClient } from './mailgun-client.js';
import { activityTracker } from '../analytics/user-activity-tracker.js';
import { assistantEmailHandler } from './assistant-email-handler.js';

export class EmailRouter {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'EmailRouter' });
        
        this.config = {
            domain: config.domain || process.env.MAILGUN_DOMAIN || 'mail.teamcrm.ai',
            assistantEmailFormat: config.assistantEmailFormat || '{userId}.assistant@{domain}',
            catchAllAddress: config.catchAllAddress || process.env.EMAIL_CATCHALL || 'team@teamcrm.ai',
            enableAutoResponse: config.enableAutoResponse !== false,
            enableThreading: config.enableThreading !== false,
            enablePriorityRouting: config.enablePriorityRouting !== false,
            routingRules: config.routingRules || [],
            webhookEndpoint: config.webhookEndpoint || '/api/email/webhook',
            processDelay: config.processDelay || 1000 // Delay before processing to avoid race conditions
        };
        
        // Team member email mapping cache
        this.teamMemberCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.lastCacheUpdate = 0;
        
        // Email processing queue
        this.processingQueue = [];
        this.isProcessing = false;
        
        // Metrics
        this.metrics = {
            emailsReceived: 0,
            emailsRouted: 0,
            emailsFailed: 0,
            autoResponses: 0,
            avgProcessingTime: 0
        };
    }
    
    /**
     * Initialize email router
     */
    async initialize() {
        try {
            // Load team members
            await this.loadTeamMembers();
            
            // Initialize assistant email handler
            await assistantEmailHandler.initialize();
            
            // Setup email routes for each team member
            await this.setupEmailRoutes();
            
            // Start queue processor
            this.startQueueProcessor();
            
            this.logger.info('Email router initialized', {
                domain: this.config.domain,
                teamMembers: this.teamMemberCache.size
            });
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to initialize email router', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Load team members from database
     */
    async loadTeamMembers() {
        try {
            const result = await db.query(`
                SELECT 
                    tm.id,
                    tm.external_id,
                    tm.name,
                    tm.email,
                    tm.role,
                    pa.assistant_name,
                    pa.configuration
                FROM team_members tm
                LEFT JOIN personal_assistants pa ON pa.member_id = tm.id
                WHERE tm.active = true
            `);
            
            this.teamMemberCache.clear();
            
            for (const member of result.rows) {
                const assistantEmail = this.generateAssistantEmail(member.external_id);
                
                this.teamMemberCache.set(assistantEmail.toLowerCase(), {
                    id: member.id,
                    externalId: member.external_id,
                    name: member.name,
                    email: member.email,
                    role: member.role,
                    assistantName: member.assistant_name || `${member.name}'s Assistant`,
                    assistantEmail: assistantEmail,
                    configuration: member.configuration || {}
                });
                
                // Also map by user's actual email if provided
                if (member.email) {
                    this.teamMemberCache.set(member.email.toLowerCase(), {
                        ...this.teamMemberCache.get(assistantEmail.toLowerCase()),
                        isDirectEmail: true
                    });
                }
            }
            
            this.lastCacheUpdate = Date.now();
            
            this.logger.info('Team members loaded', {
                count: this.teamMemberCache.size / 2 // Divided by 2 due to dual mapping
            });
            
        } catch (error) {
            this.logger.error('Failed to load team members', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Setup email routes in Mailgun
     */
    async setupEmailRoutes() {
        try {
            // Create a catch-all route for the domain
            const catchAllRoute = await mailgunClient.createRoute({
                description: 'Team CRM catch-all route',
                expression: `match_recipient(".*@${this.config.domain}")`,
                recipient: `.*@${this.config.domain}`,
                forwardTo: this.config.webhookEndpoint,
                priority: 0
            });
            
            this.logger.info('Email routes configured', {
                catchAllRoute: catchAllRoute.success
            });
            
        } catch (error) {
            this.logger.warn('Failed to setup email routes', { error: error.message });
            // Continue anyway - routes might already exist
        }
    }
    
    /**
     * Process incoming email webhook
     */
    async processIncomingEmail(webhookData) {
        try {
            this.metrics.emailsReceived++;
            
            // Validate webhook if needed
            if (webhookData.signature) {
                const valid = mailgunClient.validateWebhookSignature(
                    webhookData.signature.timestamp,
                    webhookData.signature.token,
                    webhookData.signature.signature
                );
                
                if (!valid) {
                    throw new Error('Invalid webhook signature');
                }
            }
            
            // Extract email data
            const emailData = {
                from: webhookData.from || webhookData.From,
                to: webhookData.to || webhookData.To,
                subject: webhookData.subject || webhookData.Subject,
                bodyPlain: webhookData['body-plain'] || webhookData['Body-Plain'],
                bodyHtml: webhookData['body-html'] || webhookData['Body-Html'],
                messageId: webhookData['Message-Id'],
                inReplyTo: webhookData['In-Reply-To'],
                references: webhookData.References,
                timestamp: webhookData.timestamp || Date.now(),
                attachments: webhookData.attachments || []
            };
            
            // Add to processing queue
            this.processingQueue.push(emailData);
            
            // Log activity
            await this.logEmailActivity('email_received', emailData);
            
            return {
                success: true,
                queued: true,
                position: this.processingQueue.length
            };
            
        } catch (error) {
            this.metrics.emailsFailed++;
            this.logger.error('Failed to process incoming email', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Start queue processor
     */
    startQueueProcessor() {
        setInterval(async () => {
            if (!this.isProcessing && this.processingQueue.length > 0) {
                this.isProcessing = true;
                
                try {
                    const emailData = this.processingQueue.shift();
                    await this.routeEmail(emailData);
                } catch (error) {
                    this.logger.error('Queue processing error', { error: error.message });
                } finally {
                    this.isProcessing = false;
                }
            }
        }, this.config.processDelay);
    }
    
    /**
     * Route email to appropriate assistant
     */
    async routeEmail(emailData) {
        const startTime = Date.now();
        
        try {
            // Parse the email
            const parsedEmail = await emailParser.parseEmail(emailData.bodyPlain || emailData.bodyHtml);
            
            // Enhance parsed email with webhook data
            parsedEmail.from = parsedEmail.from || this.parseEmailAddress(emailData.from);
            parsedEmail.to = parsedEmail.to || this.parseEmailAddresses(emailData.to);
            parsedEmail.messageId = parsedEmail.messageId || emailData.messageId;
            
            // Check if this is for an individual assistant
            const isAssistantEmail = this.isAssistantEmail(emailData.to);
            
            if (isAssistantEmail) {
                // Route to assistant email handler
                const result = await assistantEmailHandler.processAssistantEmail(emailData);
                this.logger.info('Email routed to assistant handler', {
                    messageId: parsedEmail.messageId,
                    success: result.success
                });
                return result;
            }
            
            // Determine recipient assistant
            const recipient = await this.determineRecipient(parsedEmail);
            
            if (!recipient) {
                this.logger.warn('No recipient found for email', {
                    to: parsedEmail.to,
                    subject: parsedEmail.subject
                });
                
                // Send to catch-all if configured
                if (this.config.catchAllAddress) {
                    await this.forwardToCatchAll(parsedEmail, emailData);
                }
                
                return;
            }
            
            // Apply routing rules
            const routingDecision = await this.applyRoutingRules(parsedEmail, recipient);
            
            // Store email in database
            const storedEmail = await this.storeEmail(parsedEmail, recipient, routingDecision);
            
            // Process based on routing decision
            if (routingDecision.action === 'forward') {
                await this.forwardToAssistant(storedEmail, recipient, routingDecision);
            } else if (routingDecision.action === 'queue') {
                await this.queueForAssistant(storedEmail, recipient, routingDecision);
            } else if (routingDecision.action === 'auto-respond') {
                await this.sendAutoResponse(storedEmail, recipient, routingDecision);
            }
            
            // Update metrics
            this.metrics.emailsRouted++;
            const processingTime = Date.now() - startTime;
            this.metrics.avgProcessingTime = 
                (this.metrics.avgProcessingTime * (this.metrics.emailsRouted - 1) + processingTime) / 
                this.metrics.emailsRouted;
            
            this.logger.info('Email routed successfully', {
                messageId: parsedEmail.messageId,
                recipient: recipient.externalId,
                action: routingDecision.action,
                processingTime
            });
            
        } catch (error) {
            this.metrics.emailsFailed++;
            this.logger.error('Failed to route email', {
                error: error.message,
                subject: emailData.subject
            });
            
            // Store failed email for manual review
            await this.storeFailedEmail(emailData, error.message);
        }
    }
    
    /**
     * Determine recipient based on email addresses
     */
    async determineRecipient(parsedEmail) {
        // Refresh cache if needed
        if (Date.now() - this.lastCacheUpdate > this.cacheTimeout) {
            await this.loadTeamMembers();
        }
        
        // Check direct TO addresses
        for (const to of parsedEmail.to || []) {
            const recipient = this.teamMemberCache.get(to.address.toLowerCase());
            if (recipient) {
                return recipient;
            }
        }
        
        // Check CC addresses
        for (const cc of parsedEmail.cc || []) {
            const recipient = this.teamMemberCache.get(cc.address.toLowerCase());
            if (recipient) {
                return recipient;
            }
        }
        
        // Check if it's a reply to an existing thread
        if (parsedEmail.isReply && parsedEmail.threadId) {
            const threadRecipient = await this.getThreadRecipient(parsedEmail.threadId);
            if (threadRecipient) {
                return threadRecipient;
            }
        }
        
        // Apply smart routing based on content
        if (this.config.enablePriorityRouting) {
            const smartRecipient = await this.smartRouting(parsedEmail);
            if (smartRecipient) {
                return smartRecipient;
            }
        }
        
        return null;
    }
    
    /**
     * Apply routing rules
     */
    async applyRoutingRules(parsedEmail, recipient) {
        const decision = {
            action: 'forward', // default action
            priority: parsedEmail.priority || 'normal',
            tags: [],
            metadata: {}
        };
        
        // Check if it's an auto-reply
        if (parsedEmail.isAutoReply) {
            decision.action = 'queue';
            decision.tags.push('auto-reply');
            decision.priority = 'low';
        }
        
        // Apply custom routing rules
        for (const rule of this.config.routingRules) {
            if (await this.evaluateRule(rule, parsedEmail, recipient)) {
                Object.assign(decision, rule.action);
                break;
            }
        }
        
        // Check for high-priority keywords
        if (this.containsHighPriorityKeywords(parsedEmail)) {
            decision.priority = 'high';
            decision.tags.push('urgent');
        }
        
        // Enable auto-response for out-of-hours emails
        if (this.config.enableAutoResponse && this.isOutOfHours()) {
            decision.autoRespond = true;
        }
        
        return decision;
    }
    
    /**
     * Store email in database
     */
    async storeEmail(parsedEmail, recipient, routingDecision) {
        try {
            const result = await db.query(`
                INSERT INTO team_emails (
                    message_id, thread_id, member_id,
                    from_address, from_name, to_addresses, cc_addresses,
                    subject, body_text, body_html, clean_text,
                    priority, is_auto_reply, is_reply,
                    routing_action, routing_metadata,
                    attachments, links, headers,
                    received_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                    $12, $13, $14, $15, $16, $17, $18, $19, $20
                ) RETURNING id
            `, [
                parsedEmail.messageId,
                parsedEmail.threadId,
                recipient.id,
                parsedEmail.from?.address,
                parsedEmail.from?.name,
                JSON.stringify(parsedEmail.to),
                JSON.stringify(parsedEmail.cc),
                parsedEmail.subject,
                parsedEmail.text,
                parsedEmail.html,
                parsedEmail.cleanText,
                routingDecision.priority,
                parsedEmail.isAutoReply,
                parsedEmail.isReply,
                routingDecision.action,
                JSON.stringify(routingDecision),
                JSON.stringify(parsedEmail.attachments),
                JSON.stringify(parsedEmail.links),
                JSON.stringify(parsedEmail.headers),
                parsedEmail.date || new Date()
            ]);
            
            return {
                ...parsedEmail,
                id: result.rows[0].id
            };
            
        } catch (error) {
            this.logger.error('Failed to store email', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Forward email to assistant
     */
    async forwardToAssistant(email, recipient, routingDecision) {
        try {
            // Prepare forwarded email
            const forwardData = {
                from: `${recipient.assistantName} <${recipient.assistantEmail}>`,
                to: recipient.email || recipient.externalId, // Forward to user's actual email
                subject: `[Assistant] ${email.subject}`,
                html: this.buildForwardedEmailHtml(email, recipient, routingDecision),
                text: this.buildForwardedEmailText(email, recipient, routingDecision),
                tags: ['assistant-forward', ...routingDecision.tags],
                variables: {
                    emailId: email.id,
                    memberId: recipient.id,
                    priority: routingDecision.priority
                }
            };
            
            // Add attachments if any
            if (email.attachments && email.attachments.length > 0) {
                forwardData.attachments = email.attachments.map(att => ({
                    filename: att.filename,
                    content: att.content
                }));
            }
            
            const result = await mailgunClient.sendEmail(forwardData);
            
            if (result.success) {
                // Update email status
                await db.query(
                    'UPDATE team_emails SET forwarded_at = NOW(), forward_message_id = $1 WHERE id = $2',
                    [result.messageId, email.id]
                );
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to forward email', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Queue email for later processing
     */
    async queueForAssistant(email, recipient, routingDecision) {
        try {
            await db.query(`
                INSERT INTO email_queue (
                    email_id, member_id, priority, 
                    scheduled_for, routing_metadata
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                email.id,
                recipient.id,
                routingDecision.priority,
                routingDecision.scheduledFor || new Date(),
                JSON.stringify(routingDecision)
            ]);
            
            this.logger.info('Email queued for assistant', {
                emailId: email.id,
                recipient: recipient.externalId
            });
            
        } catch (error) {
            this.logger.error('Failed to queue email', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Send auto-response
     */
    async sendAutoResponse(email, recipient, routingDecision) {
        try {
            if (!this.config.enableAutoResponse) return;
            
            const autoResponse = {
                from: `${recipient.assistantName} <${recipient.assistantEmail}>`,
                to: email.from.address,
                subject: `Re: ${email.subject}`,
                text: this.generateAutoResponseText(email, recipient),
                html: this.generateAutoResponseHtml(email, recipient),
                'h:In-Reply-To': email.messageId,
                'h:References': email.messageId,
                tags: ['auto-response']
            };
            
            const result = await mailgunClient.sendEmail(autoResponse);
            
            if (result.success) {
                this.metrics.autoResponses++;
                
                // Log auto-response
                await db.query(`
                    INSERT INTO email_auto_responses (
                        email_id, member_id, response_message_id, sent_at
                    ) VALUES ($1, $2, $3, NOW())
                `, [email.id, recipient.id, result.messageId]);
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to send auto-response', { error: error.message });
            // Don't throw - auto-response failure shouldn't break the flow
        }
    }
    
    /**
     * Helper methods
     */
    
    generateAssistantEmail(userId) {
        return this.config.assistantEmailFormat
            .replace('{userId}', userId)
            .replace('{domain}', this.config.domain);
    }
    
    parseEmailAddress(emailStr) {
        if (!emailStr) return null;
        
        const match = emailStr.match(/^(.*?)\s*<(.+)>$/);
        if (match) {
            return {
                name: match[1].trim(),
                address: match[2].trim().toLowerCase()
            };
        }
        
        return {
            name: null,
            address: emailStr.trim().toLowerCase()
        };
    }
    
    parseEmailAddresses(emailStr) {
        if (!emailStr) return [];
        
        return emailStr.split(',').map(email => this.parseEmailAddress(email)).filter(Boolean);
    }
    
    async getThreadRecipient(threadId) {
        try {
            const result = await db.query(`
                SELECT tm.* FROM team_members tm
                JOIN team_emails te ON te.member_id = tm.id
                WHERE te.thread_id = $1
                ORDER BY te.created_at DESC
                LIMIT 1
            `, [threadId]);
            
            if (result.rows.length > 0) {
                const member = result.rows[0];
                return this.teamMemberCache.get(
                    this.generateAssistantEmail(member.external_id).toLowerCase()
                );
            }
        } catch (error) {
            this.logger.error('Failed to get thread recipient', { error: error.message });
        }
        
        return null;
    }
    
    async smartRouting(parsedEmail) {
        // Implement smart routing based on content analysis
        // This could use AI to determine the best recipient based on:
        // - Email content
        // - Sender history
        // - Team member expertise
        // - Current workload
        
        // For now, return null (no smart routing)
        return null;
    }
    
    async evaluateRule(rule, parsedEmail, recipient) {
        // Evaluate custom routing rule conditions
        // This is a simplified implementation
        
        if (rule.condition.type === 'sender') {
            return parsedEmail.from?.address.includes(rule.condition.value);
        }
        
        if (rule.condition.type === 'subject') {
            return parsedEmail.subject?.toLowerCase().includes(rule.condition.value.toLowerCase());
        }
        
        if (rule.condition.type === 'recipient') {
            return recipient.externalId === rule.condition.value;
        }
        
        return false;
    }
    
    containsHighPriorityKeywords(parsedEmail) {
        const highPriorityKeywords = [
            'urgent', 'asap', 'critical', 'emergency',
            'immediately', 'important', 'priority'
        ];
        
        const content = `${parsedEmail.subject} ${parsedEmail.cleanText}`.toLowerCase();
        
        return highPriorityKeywords.some(keyword => content.includes(keyword));
    }
    
    isOutOfHours() {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        // Weekend
        if (day === 0 || day === 6) return true;
        
        // Outside 9 AM - 6 PM
        if (hour < 9 || hour >= 18) return true;
        
        return false;
    }
    
    buildForwardedEmailHtml(email, recipient, routingDecision) {
        return `
            <div style="font-family: Arial, sans-serif;">
                <div style="background: #f0f0f0; padding: 10px; margin-bottom: 20px;">
                    <strong>Email processed by ${recipient.assistantName}</strong><br>
                    Priority: <span style="color: ${routingDecision.priority === 'high' ? 'red' : 'black'}">
                        ${routingDecision.priority}
                    </span><br>
                    Tags: ${routingDecision.tags.join(', ')}
                </div>
                
                <div style="border-left: 3px solid #ccc; padding-left: 10px;">
                    <strong>From:</strong> ${email.from?.name || ''} &lt;${email.from?.address}&gt;<br>
                    <strong>Subject:</strong> ${email.subject}<br>
                    <strong>Date:</strong> ${new Date(email.date).toLocaleString()}<br>
                    <br>
                    ${email.html || email.text?.replace(/\n/g, '<br>')}
                </div>
                
                ${email.links?.length > 0 ? `
                    <div style="margin-top: 20px; padding: 10px; background: #f9f9f9;">
                        <strong>Links found:</strong>
                        <ul>
                            ${email.links.map(link => `
                                <li><a href="${link.url}">${link.domain}</a>
                                ${link.isTracking ? ' (tracking)' : ''}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    buildForwardedEmailText(email, recipient, routingDecision) {
        return `
Email processed by ${recipient.assistantName}
Priority: ${routingDecision.priority}
Tags: ${routingDecision.tags.join(', ')}

---

From: ${email.from?.name || ''} <${email.from?.address}>
Subject: ${email.subject}
Date: ${new Date(email.date).toLocaleString()}

${email.cleanText || email.text}

${email.links?.length > 0 ? `
Links found:
${email.links.map(link => `- ${link.url} ${link.isTracking ? '(tracking)' : ''}`).join('\n')}
` : ''}
        `.trim();
    }
    
    generateAutoResponseText(email, recipient) {
        return `
Hello,

Thank you for your email. This is an automated response from ${recipient.assistantName}.

I've received your message regarding "${email.subject}" and have notified ${recipient.name}.

They will review your message and respond as soon as possible.

Best regards,
${recipient.assistantName}
${recipient.name}'s AI Assistant
        `.trim();
    }
    
    generateAutoResponseHtml(email, recipient) {
        return `
            <div style="font-family: Arial, sans-serif;">
                <p>Hello,</p>
                
                <p>Thank you for your email. This is an automated response from ${recipient.assistantName}.</p>
                
                <p>I've received your message regarding "<strong>${email.subject}</strong>" and have notified ${recipient.name}.</p>
                
                <p>They will review your message and respond as soon as possible.</p>
                
                <p>Best regards,<br>
                ${recipient.assistantName}<br>
                <em>${recipient.name}'s AI Assistant</em></p>
            </div>
        `;
    }
    
    async forwardToCatchAll(parsedEmail, emailData) {
        try {
            await mailgunClient.sendEmail({
                from: `Email Router <noreply@${this.config.domain}>`,
                to: this.config.catchAllAddress,
                subject: `[Unrouted] ${parsedEmail.subject}`,
                text: `Unrouted email:\n\n${emailData.bodyPlain}`,
                html: emailData.bodyHtml
            });
        } catch (error) {
            this.logger.error('Failed to forward to catch-all', { error: error.message });
        }
    }
    
    async storeFailedEmail(emailData, errorMessage) {
        try {
            await db.query(`
                INSERT INTO failed_emails (
                    raw_data, error_message, received_at
                ) VALUES ($1, $2, NOW())
            `, [JSON.stringify(emailData), errorMessage]);
        } catch (error) {
            this.logger.error('Failed to store failed email', { error: error.message });
        }
    }
    
    async logEmailActivity(action, data) {
        try {
            if (activityTracker) {
                await activityTracker.trackActivity({
                    userId: 'email-system',
                    type: 'email_routing',
                    endpoint: `/email/${action}`,
                    method: 'EMAIL',
                    statusCode: 200,
                    responseTime: 0,
                    requestBody: {
                        action,
                        from: data.from,
                        to: data.to,
                        subject: data.subject
                    }
                });
            }
        } catch (error) {
            this.logger.debug('Failed to log email activity', { error: error.message });
        }
    }
    
    /**
     * Check if email is for an individual assistant
     */
    isAssistantEmail(toAddress) {
        if (!toAddress) return false;
        
        const addresses = toAddress.split(',').map(addr => addr.trim().toLowerCase());
        return addresses.some(addr => /-assistant@/.test(addr));
    }
    
    /**
     * Get routing statistics
     */
    getStats() {
        return {
            ...this.metrics,
            queueLength: this.processingQueue.length,
            cacheSize: this.teamMemberCache.size,
            isProcessing: this.isProcessing,
            assistantHandler: assistantEmailHandler.getStats()
        };
    }
    
    /**
     * Manually trigger email processing
     */
    async processQueuedEmails() {
        const pending = this.processingQueue.length;
        
        while (this.processingQueue.length > 0) {
            const emailData = this.processingQueue.shift();
            await this.routeEmail(emailData);
        }
        
        return {
            processed: pending,
            remaining: this.processingQueue.length
        };
    }
}

// Export singleton instance
export const emailRouter = new EmailRouter();