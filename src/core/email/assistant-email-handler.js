/**
 * Assistant Email Handler
 * Processes emails sent to individual assistant addresses (joe-assistant@domain.com)
 */

import { db } from '../database/connection.js';
import { logger } from '../../utils/logger.js';
import { emailParser } from './email-parser.js';
import { mailgunClient } from './mailgun-client.js';
import { PersonalAssistantFactory } from '../agents/personal-assistant-factory.js';
import { emailContextExtractor } from './context-extractor.js';

export class AssistantEmailHandler {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'AssistantEmailHandler' });
        this.config = {
            domain: config.domain || process.env.MAILGUN_DOMAIN || 'mail.teamcrm.ai',
            assistantEmailFormat: config.assistantEmailFormat || '{userId}-assistant@{domain}',
            enableAutoResponse: config.enableAutoResponse !== false,
            enableSupermemoryIntegration: config.enableSupermemoryIntegration !== false,
            processDelay: config.processDelay || 2000
        };
        
        this.assistantCache = new Map();
        this.processingQueue = [];
        this.isProcessing = false;
        this.TEAM_CACHE_TTL = 300000; // 5 minutes
        this.teamMembersCache = null;
        this.cacheTimestamp = 0;
    }

    /**
     * Initialize the handler
     */
    async initialize() {
        try {
            await this.loadAssistants();
            this.startQueueProcessor();
            
            this.logger.info('Assistant email handler initialized', {
                assistants: this.assistantCache.size
            });
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize assistant email handler', { error: error.message });
            throw error;
        }
    }

    /**
     * Load personal assistants from database
     */
    async loadAssistants() {
        try {
            const now = Date.now();
            
            // Check if cache is still valid
            if (this.teamMembersCache && (now - this.cacheTimestamp) < this.TEAM_CACHE_TTL) {
                this.logger.debug('Using cached team members data');
                
                // Rebuild assistant cache from cached data
                this.assistantCache.clear();
                for (const member of this.teamMembersCache) {
                    const assistantEmail = this.generateAssistantEmail(member.external_id);
                    
                    this.assistantCache.set(assistantEmail.toLowerCase(), {
                        id: member.id,
                        externalId: member.external_id,
                        name: member.name,
                        email: member.email,
                        role: member.role,
                        aiModel: member.ai_model,
                        supermemorySpaceId: member.supermemory_space_id,
                        assistantName: member.assistant_name || `${member.name}'s Assistant`,
                        assistantEmail: assistantEmail,
                        configuration: member.configuration || {},
                        learningPreferences: member.learning_preferences || {}
                    });
                }
                return;
            }
            
            const result = await db.query(`
                SELECT 
                    tm.id,
                    tm.external_id,
                    tm.name,
                    tm.email,
                    tm.role,
                    tm.ai_model,
                    tm.supermemory_space_id,
                    pa.assistant_name,
                    pa.configuration,
                    pa.learning_preferences
                FROM team_members tm
                LEFT JOIN personal_assistants pa ON pa.member_id = tm.id
                WHERE tm.active = true
            `);
            
            // Store the raw results in cache
            this.teamMembersCache = result.rows;
            this.cacheTimestamp = now;
            
            this.assistantCache.clear();
            
            for (const member of result.rows) {
                const assistantEmail = this.generateAssistantEmail(member.external_id);
                
                this.assistantCache.set(assistantEmail.toLowerCase(), {
                    id: member.id,
                    externalId: member.external_id,
                    name: member.name,
                    email: member.email,
                    role: member.role,
                    aiModel: member.ai_model,
                    supermemorySpaceId: member.supermemory_space_id,
                    assistantName: member.assistant_name || `${member.name}'s Assistant`,
                    assistantEmail: assistantEmail,
                    configuration: member.configuration || {},
                    learningPreferences: member.learning_preferences || {}
                });
            }
            
            this.logger.info('Assistants loaded', { 
                count: this.assistantCache.size,
                cached: false 
            });
            
        } catch (error) {
            this.logger.error('Failed to load assistants', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Clear the cache to force a refresh
     */
    clearCache() {
        this.teamMembersCache = null;
        this.cacheTimestamp = 0;
        this.assistantCache.clear();
        this.logger.info('Cleared team members cache');
    }

    /**
     * Process incoming email to assistant
     */
    async processAssistantEmail(emailData) {
        try {
            // Parse email
            const parsedEmail = await emailParser.parseEmail(emailData.bodyPlain || emailData.bodyHtml);
            
            // Determine which assistant this is for
            const assistant = await this.determineAssistant(parsedEmail, emailData);
            
            if (!assistant) {
                this.logger.warn('No assistant found for email', {
                    to: emailData.to,
                    subject: emailData.subject
                });
                return { success: false, reason: 'No assistant found' };
            }

            // Store email in database
            const storedEmail = await this.storeAssistantEmail(parsedEmail, assistant, emailData);
            
            // Process with personal assistant
            const { processedUpdate, emailContext } = await this.processWithAssistant(storedEmail, assistant);
            
            // Send response if enabled
            if (this.config.enableAutoResponse) {
                await this.sendAssistantResponse(storedEmail, assistant, processedUpdate);
            }
            
            // Forward to team member if needed
            await this.forwardToTeamMember(storedEmail, assistant, processedUpdate);
            
            // Send to team orchestrator for executive processing
            await this.sendToTeamOrchestrator(emailContext, processedUpdate, assistant);
            
            this.logger.info('Assistant email processed', {
                assistant: assistant.externalId,
                messageId: parsedEmail.messageId
            });
            
            return { success: true, processedUpdate };
            
        } catch (error) {
            this.logger.error('Failed to process assistant email', { error: error.message });
            throw error;
        }
    }

    /**
     * Determine which assistant should handle the email
     */
    async determineAssistant(parsedEmail, emailData) {
        // Check TO addresses
        for (const to of parsedEmail.to || []) {
            const assistant = this.assistantCache.get(to.address.toLowerCase());
            if (assistant) return assistant;
        }
        
        // Check original TO from webhook
        if (emailData.to) {
            const addresses = emailData.to.split(',').map(addr => addr.trim().toLowerCase());
            for (const addr of addresses) {
                const assistant = this.assistantCache.get(addr);
                if (assistant) return assistant;
            }
        }
        
        return null;
    }

    /**
     * Store assistant email in database
     */
    async storeAssistantEmail(parsedEmail, assistant, emailData) {
        try {
            const result = await db.query(`
                INSERT INTO assistant_emails (
                    message_id, member_id, assistant_email,
                    from_address, from_name, subject,
                    body_text, body_html, clean_text,
                    is_auto_reply, is_reply, thread_id,
                    attachments, links, headers,
                    received_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                ) RETURNING id
            `, [
                parsedEmail.messageId,
                assistant.id,
                assistant.assistantEmail,
                parsedEmail.from?.address,
                parsedEmail.from?.name,
                parsedEmail.subject,
                parsedEmail.text,
                parsedEmail.html,
                parsedEmail.cleanText,
                parsedEmail.isAutoReply,
                parsedEmail.isReply,
                parsedEmail.threadId,
                JSON.stringify(parsedEmail.attachments || []),
                JSON.stringify(parsedEmail.links || []),
                JSON.stringify(parsedEmail.headers || {}),
                parsedEmail.date || new Date()
            ]);
            
            return {
                ...parsedEmail,
                id: result.rows[0].id,
                assistant
            };
            
        } catch (error) {
            this.logger.error('Failed to store assistant email', { error: error.message });
            throw error;
        }
    }

    /**
     * Process email with personal assistant
     */
    async processWithAssistant(storedEmail, assistant) {
        try {
            // Extract email context
            const emailContext = await emailContextExtractor.extractEmailContext(storedEmail, assistant);
            
            // Get or create personal assistant instance
            const personalAssistant = await PersonalAssistantFactory.getAssistant(assistant.externalId);
            
            if (!personalAssistant) {
                throw new Error(`No personal assistant found for ${assistant.externalId}`);
            }
            
            // Prepare email content for processing
            const emailContent = `
Email from: ${storedEmail.from?.name || storedEmail.from?.address}
Subject: ${storedEmail.subject}

${storedEmail.cleanText || storedEmail.text}
            `.trim();
            
            // Process with assistant using email context
            const processedUpdate = await personalAssistant.processUpdate(emailContent, emailContext);
            
            // Store processing result with context
            await this.storeProcessingResult(storedEmail.id, processedUpdate, emailContext);
            
            return { processedUpdate, emailContext };
            
        } catch (error) {
            this.logger.error('Failed to process with assistant', { error: error.message });
            
            // Return fallback processing
            return {
                id: storedEmail.id,
                timestamp: new Date().toISOString(),
                source: assistant.name,
                raw_input: storedEmail.cleanText || storedEmail.text,
                extracted_data: {
                    summary: `Email from ${storedEmail.from?.address}: ${storedEmail.subject}`,
                    error: error.message,
                    fallback: true
                },
                confidence: 0.0,
                requires_attention: true,
                processing_status: 'error'
            };
        }
    }

    /**
     * Send assistant response
     */
    async sendAssistantResponse(storedEmail, assistant, processedUpdate) {
        try {
            // Generate intelligent response based on processed content
            const responseContent = await this.generateResponse(storedEmail, assistant, processedUpdate);
            
            const response = {
                from: `${assistant.assistantName} <${assistant.assistantEmail}>`,
                to: storedEmail.from.address,
                subject: `Re: ${storedEmail.subject}`,
                html: responseContent.html,
                text: responseContent.text,
                'h:In-Reply-To': storedEmail.messageId,
                'h:References': storedEmail.messageId,
                tags: ['assistant-response', assistant.externalId]
            };
            
            const result = await mailgunClient.sendEmail(response);
            
            if (result.success) {
                await db.query(`
                    UPDATE assistant_emails 
                    SET response_sent = true, response_message_id = $1, response_sent_at = NOW()
                    WHERE id = $2
                `, [result.messageId, storedEmail.id]);
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to send assistant response', { error: error.message });
        }
    }

    /**
     * Generate intelligent response
     */
    async generateResponse(storedEmail, assistant, processedUpdate) {
        const summary = processedUpdate.extracted_data?.summary || 'I received your message';
        const hasActionItems = processedUpdate.extracted_data?.action_items?.length > 0;
        const isUrgent = processedUpdate.requires_attention;
        
        const text = `
Hello,

Thank you for your email. I'm ${assistant.assistantName}, ${assistant.name}'s AI assistant.

I've processed your message and ${hasActionItems ? 'identified some action items' : 'noted the information'}.

${summary}

${hasActionItems ? `Action items identified:
${processedUpdate.extracted_data.action_items.map(item => `• ${item.action}`).join('\n')}` : ''}

${isUrgent ? `This appears to require immediate attention. I've flagged it as urgent for ${assistant.name}.` : `I've notified ${assistant.name} about your message.`}

${assistant.name} will review this and respond as appropriate.

Best regards,
${assistant.assistantName}
        `.trim();
        
        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
    <p>Hello,</p>
    
    <p>Thank you for your email. I'm ${assistant.assistantName}, ${assistant.name}'s AI assistant.</p>
    
    <p>I've processed your message and ${hasActionItems ? 'identified some action items' : 'noted the information'}.</p>
    
    <div style="background: #f5f5f5; padding: 15px; margin: 15px 0; border-left: 4px solid #007cba;">
        <strong>Summary:</strong> ${summary}
    </div>
    
    ${hasActionItems ? `
    <div style="background: #fff3cd; padding: 15px; margin: 15px 0; border-left: 4px solid #ffc107;">
        <strong>Action items identified:</strong>
        <ul>
            ${processedUpdate.extracted_data.action_items.map(item => `<li>${item.action}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
    
    ${isUrgent ? `
    <div style="background: #f8d7da; padding: 15px; margin: 15px 0; border-left: 4px solid #dc3545;">
        <strong>⚠️ Urgent:</strong> This appears to require immediate attention. I've flagged it as urgent for ${assistant.name}.
    </div>
    ` : `<p>I've notified ${assistant.name} about your message.</p>`}
    
    <p>${assistant.name} will review this and respond as appropriate.</p>
    
    <p>Best regards,<br>
    <strong>${assistant.assistantName}</strong></p>
</div>
        `;
        
        return { text, html };
    }

    /**
     * Forward to team member if needed
     */
    async forwardToTeamMember(storedEmail, assistant, processedUpdate) {
        try {
            // Only forward if urgent or specifically requested
            if (!processedUpdate.requires_attention && !assistant.configuration?.forwardAllEmails) {
                return;
            }
            
            if (!assistant.email) {
                this.logger.warn('No email address for team member', { member: assistant.name });
                return;
            }
            
            const forwardData = {
                from: `${assistant.assistantName} <${assistant.assistantEmail}>`,
                to: assistant.email,
                subject: `[Assistant Forward] ${storedEmail.subject}`,
                html: this.buildForwardHtml(storedEmail, assistant, processedUpdate),
                text: this.buildForwardText(storedEmail, assistant, processedUpdate),
                tags: ['assistant-forward', assistant.externalId]
            };
            
            const result = await mailgunClient.sendEmail(forwardData);
            
            if (result.success) {
                await db.query(`
                    UPDATE assistant_emails 
                    SET forwarded_to_member = true, forward_message_id = $1, forwarded_at = NOW()
                    WHERE id = $2
                `, [result.messageId, storedEmail.id]);
            }
            
        } catch (error) {
            this.logger.error('Failed to forward to team member', { error: error.message });
        }
    }

    /**
     * Build forward HTML
     */
    buildForwardHtml(storedEmail, assistant, processedUpdate) {
        const summary = processedUpdate.extracted_data?.summary || 'No summary available';
        const actionItems = processedUpdate.extracted_data?.action_items || [];
        const isUrgent = processedUpdate.requires_attention;
        
        return `
<div style="font-family: Arial, sans-serif; max-width: 700px;">
    <div style="background: ${isUrgent ? '#f8d7da' : '#d4edda'}; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
        <h3 style="margin: 0; color: ${isUrgent ? '#721c24' : '#155724'};">
            ${isUrgent ? '🚨 Urgent Email Processed' : '📧 Email Processed by Assistant'}
        </h3>
        <p style="margin: 5px 0 0 0;">From: ${storedEmail.from?.name || storedEmail.from?.address}</p>
    </div>
    
    <div style="background: #f8f9fa; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
        <strong>AI Summary:</strong><br>
        ${summary}
    </div>
    
    ${actionItems.length > 0 ? `
    <div style="background: #fff3cd; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
        <strong>Action Items Identified:</strong>
        <ul>
            ${actionItems.map(item => `<li>${item.action} ${item.owner ? `(${item.owner})` : ''} ${item.deadline ? `- Due: ${item.deadline}` : ''}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
    
    <div style="border-left: 3px solid #ccc; padding-left: 15px; margin: 20px 0;">
        <strong>Original Email:</strong><br>
        <strong>From:</strong> ${storedEmail.from?.name || ''} &lt;${storedEmail.from?.address}&gt;<br>
        <strong>Subject:</strong> ${storedEmail.subject}<br>
        <strong>Date:</strong> ${new Date(storedEmail.date).toLocaleString()}<br><br>
        ${storedEmail.html || storedEmail.text?.replace(/\n/g, '<br>')}
    </div>
    
    <p style="font-size: 12px; color: #666;">
        This email was automatically processed by ${assistant.assistantName} and ${isUrgent ? 'flagged as urgent' : 'forwarded for your review'}.
    </p>
</div>
        `;
    }

    /**
     * Build forward text
     */
    buildForwardText(storedEmail, assistant, processedUpdate) {
        const summary = processedUpdate.extracted_data?.summary || 'No summary available';
        const actionItems = processedUpdate.extracted_data?.action_items || [];
        const isUrgent = processedUpdate.requires_attention;
        
        return `
${isUrgent ? '🚨 URGENT EMAIL PROCESSED' : '📧 EMAIL PROCESSED BY ASSISTANT'}

From: ${storedEmail.from?.name || storedEmail.from?.address}

AI SUMMARY:
${summary}

${actionItems.length > 0 ? `
ACTION ITEMS IDENTIFIED:
${actionItems.map(item => `• ${item.action} ${item.owner ? `(${item.owner})` : ''} ${item.deadline ? `- Due: ${item.deadline}` : ''}`).join('\n')}
` : ''}

ORIGINAL EMAIL:
---
From: ${storedEmail.from?.name || ''} <${storedEmail.from?.address}>
Subject: ${storedEmail.subject}
Date: ${new Date(storedEmail.date).toLocaleString()}

${storedEmail.text}
---

This email was automatically processed by ${assistant.assistantName} and ${isUrgent ? 'flagged as urgent' : 'forwarded for your review'}.
        `.trim();
    }

    /**
     * Store processing result
     */
    async storeProcessingResult(emailId, processedUpdate, emailContext) {
        try {
            await db.query(`
                UPDATE assistant_emails 
                SET 
                    processed_data = $1,
                    confidence_score = $2,
                    requires_attention = $3,
                    processing_status = $4,
                    email_context = $5,
                    processed_at = NOW()
                WHERE id = $6
            `, [
                JSON.stringify(processedUpdate.extracted_data),
                processedUpdate.confidence,
                processedUpdate.requires_attention,
                processedUpdate.processing_status,
                JSON.stringify(emailContext),
                emailId
            ]);
        } catch (error) {
            this.logger.error('Failed to store processing result', { error: error.message });
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
                    await this.processAssistantEmail(emailData);
                } catch (error) {
                    this.logger.error('Queue processing error', { error: error.message });
                } finally {
                    this.isProcessing = false;
                }
            }
        }, this.config.processDelay);
    }

    /**
     * Add email to processing queue
     */
    queueEmail(emailData) {
        this.processingQueue.push(emailData);
        return {
            success: true,
            queued: true,
            position: this.processingQueue.length
        };
    }

    /**
     * Generate assistant email address
     */
    generateAssistantEmail(userId) {
        return this.config.assistantEmailFormat
            .replace('{userId}', userId)
            .replace('{domain}', this.config.domain);
    }

    /**
     * Send to team orchestrator for executive processing
     */
    async sendToTeamOrchestrator(emailContext, processedUpdate, assistant) {
        try {
            // Convert email context to team update format
            const teamUpdate = emailContextExtractor.convertToTeamUpdate(emailContext, processedUpdate);
            
            // Import orchestrator dynamically to avoid circular dependency
            const { teamOrchestrator } = await import('../orchestration/team-orchestrator.js');
            
            if (teamOrchestrator && teamOrchestrator.processEmailUpdate) {
                await teamOrchestrator.processEmailUpdate(teamUpdate, emailContext);
            }
            
        } catch (error) {
            this.logger.error('Failed to send to team orchestrator', { error: error.message });
        }
    }
    
    /**
     * Get handler statistics
     */
    getStats() {
        return {
            assistants: this.assistantCache.size,
            queueLength: this.processingQueue.length,
            isProcessing: this.isProcessing
        };
    }
}

// Export singleton instance
export const assistantEmailHandler = new AssistantEmailHandler();