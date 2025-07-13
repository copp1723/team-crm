/**
 * Email Context Extractor
 * Converts email content into structured context for team processing
 */

import { logger } from '../../utils/logger.js';

export class EmailContextExtractor {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'EmailContextExtractor' });
        this.config = {
            enableThreadAnalysis: config.enableThreadAnalysis !== false,
            enableSenderProfiling: config.enableSenderProfiling !== false,
            contextTimeout: config.contextTimeout || 5 * 60 * 1000
        };
        
        this.contextCache = new Map();
    }

    /**
     * Extract context from email for team processing
     */
    async extractEmailContext(emailData, assistant) {
        try {
            const context = {
                source: 'email',
                timestamp: new Date().toISOString(),
                messageId: emailData.messageId || emailData.id,
                threadId: emailData.threadId,
                
                // Email metadata
                email: {
                    from: emailData.from,
                    to: emailData.to || emailData.assistant_email,
                    subject: emailData.subject,
                    isReply: emailData.isReply || false,
                    isAutoReply: emailData.isAutoReply || false
                },
                
                // Sender context
                sender: await this.analyzeSender(emailData.from),
                
                // Content analysis
                content: {
                    text: emailData.cleanText || emailData.body_text,
                    html: emailData.body_html,
                    attachments: emailData.attachments || [],
                    links: emailData.links || []
                },
                
                // Thread context
                thread: await this.analyzeThread(emailData.threadId, emailData.subject),
                
                // Assistant context
                assistant: {
                    id: assistant.id,
                    name: assistant.name,
                    email: assistant.assistantEmail
                }
            };
            
            // Add urgency indicators
            context.urgency = this.detectUrgencyIndicators(emailData);
            
            // Add business context
            context.business = await this.extractBusinessContext(emailData);
            
            return context;
            
        } catch (error) {
            this.logger.error('Failed to extract email context', { error: error.message });
            
            // Return minimal context
            return {
                source: 'email',
                timestamp: new Date().toISOString(),
                messageId: emailData.messageId || emailData.id,
                email: {
                    from: emailData.from,
                    subject: emailData.subject
                },
                content: {
                    text: emailData.cleanText || emailData.body_text || ''
                },
                error: error.message
            };
        }
    }

    /**
     * Analyze sender information
     */
    async analyzeSender(fromData) {
        if (!fromData) return null;
        
        const cacheKey = `sender_${fromData.address}`;
        const cached = this.contextCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.config.contextTimeout) {
            return cached.data;
        }
        
        const senderContext = {
            email: fromData.address,
            name: fromData.name,
            domain: fromData.address?.split('@')[1],
            isInternal: this.isInternalSender(fromData.address),
            isKnownClient: await this.checkKnownClient(fromData.address),
            communicationHistory: await this.getSenderHistory(fromData.address)
        };
        
        // Cache result
        this.contextCache.set(cacheKey, {
            data: senderContext,
            timestamp: Date.now()
        });
        
        return senderContext;
    }

    /**
     * Analyze email thread context
     */
    async analyzeThread(threadId, subject) {
        if (!threadId && !subject) return null;
        
        return {
            id: threadId,
            subject: subject,
            isNewThread: !threadId,
            subjectKeywords: this.extractSubjectKeywords(subject)
        };
    }

    /**
     * Detect urgency indicators in email
     */
    detectUrgencyIndicators(emailData) {
        const urgencyKeywords = [
            'urgent', 'asap', 'immediately', 'critical', 'emergency',
            'deadline', 'today', 'now', 'rush', 'priority'
        ];
        
        const content = `${emailData.subject || ''} ${emailData.cleanText || emailData.body_text || ''}`.toLowerCase();
        
        const foundKeywords = urgencyKeywords.filter(keyword => content.includes(keyword));
        
        return {
            level: foundKeywords.length > 0 ? (foundKeywords.length > 2 ? 'high' : 'medium') : 'low',
            keywords: foundKeywords,
            hasDeadline: /\b(deadline|due|by\s+\w+day)\b/i.test(content),
            hasTimeConstraint: /\b(today|tomorrow|this\s+week)\b/i.test(content)
        };
    }

    /**
     * Extract business context from email
     */
    async extractBusinessContext(emailData) {
        const content = emailData.cleanText || emailData.body_text || '';
        
        return {
            // Financial indicators
            financial: this.extractFinancialData(content),
            
            // Client/company mentions
            entities: this.extractBusinessEntities(content),
            
            // Project references
            projects: this.extractProjectReferences(content),
            
            // Meeting requests
            meetings: this.detectMeetingRequests(content)
        };
    }

    /**
     * Extract financial data from content
     */
    extractFinancialData(content) {
        const amounts = content.match(/\$[\d,]+(?:\.\d{2})?[kKmM]?/g) || [];
        const percentages = content.match(/\d+(?:\.\d+)?%/g) || [];
        
        return {
            amounts: amounts.map(amount => ({ value: amount, context: 'mentioned' })),
            percentages: percentages.map(pct => ({ value: pct, context: 'mentioned' })),
            hasFinancialContent: amounts.length > 0 || percentages.length > 0
        };
    }

    /**
     * Extract business entities
     */
    extractBusinessEntities(content) {
        // Simple entity extraction
        const companies = content.match(/\b[A-Z][a-zA-Z]+ (?:Inc|Corp|LLC|Ltd|Company|Co)\b/g) || [];
        const people = content.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || [];
        
        return {
            companies: [...new Set(companies)],
            people: [...new Set(people)],
            hasBusinessEntities: companies.length > 0 || people.length > 0
        };
    }

    /**
     * Extract project references
     */
    extractProjectReferences(content) {
        const projectKeywords = ['project', 'initiative', 'campaign', 'implementation', 'rollout'];
        const references = [];
        
        projectKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\s+([A-Z][a-zA-Z\\s]+)\\b`, 'gi');
            const matches = content.match(regex) || [];
            references.push(...matches);
        });
        
        return {
            references: [...new Set(references)],
            hasProjectContent: references.length > 0
        };
    }

    /**
     * Detect meeting requests
     */
    detectMeetingRequests(content) {
        const meetingKeywords = ['meeting', 'call', 'schedule', 'appointment', 'discuss', 'chat'];
        const timeKeywords = ['today', 'tomorrow', 'next week', 'this week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        
        const hasMeetingRequest = meetingKeywords.some(keyword => content.toLowerCase().includes(keyword));
        const hasTimeReference = timeKeywords.some(keyword => content.toLowerCase().includes(keyword));
        
        return {
            requested: hasMeetingRequest,
            hasTimeReference,
            urgency: hasMeetingRequest && hasTimeReference ? 'high' : 'medium'
        };
    }

    /**
     * Helper methods
     */
    isInternalSender(email) {
        if (!email) return false;
        const internalDomains = ['company.com', 'teamcrm.ai'];
        const domain = email.split('@')[1];
        return internalDomains.includes(domain);
    }

    async checkKnownClient(email) {
        // This would check against client database
        // For now, return false
        return false;
    }

    async getSenderHistory(email) {
        // This would get communication history
        // For now, return empty
        return {
            emailCount: 0,
            lastContact: null,
            relationship: 'unknown'
        };
    }

    extractSubjectKeywords(subject) {
        if (!subject) return [];
        
        const stopWords = ['re:', 'fwd:', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const words = subject.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word));
        
        return [...new Set(words)];
    }

    /**
     * Convert email context to team update format
     */
    convertToTeamUpdate(emailContext, processedData) {
        const updateText = this.generateUpdateText(emailContext, processedData);
        
        return {
            memberName: emailContext.assistant.name.replace("'s Assistant", ""),
            updateText,
            metadata: {
                source: 'email',
                messageId: emailContext.messageId,
                fromEmail: emailContext.email.from?.address,
                subject: emailContext.email.subject,
                urgency: emailContext.urgency,
                businessContext: emailContext.business,
                processedData: processedData.extracted_data
            }
        };
    }

    /**
     * Generate update text from email context
     */
    generateUpdateText(emailContext, processedData) {
        const from = emailContext.email.from?.name || emailContext.email.from?.address || 'Unknown sender';
        const subject = emailContext.email.subject || 'No subject';
        const summary = processedData.extracted_data?.summary || 'Email received';
        
        let updateText = `Email from ${from}: ${subject}\n\n${summary}`;
        
        // Add urgency if high
        if (emailContext.urgency?.level === 'high') {
            updateText = `URGENT: ${updateText}`;
        }
        
        // Add business context if significant
        if (emailContext.business?.financial?.hasFinancialContent) {
            updateText += `\n\nFinancial content: ${emailContext.business.financial.amounts.map(a => a.value).join(', ')}`;
        }
        
        if (emailContext.business?.meetings?.requested) {
            updateText += '\n\nMeeting requested';
        }
        
        return updateText;
    }

    /**
     * Clean up cache
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.contextCache.entries()) {
            if (now - value.timestamp > this.config.contextTimeout) {
                this.contextCache.delete(key);
            }
        }
    }
}

export const emailContextExtractor = new EmailContextExtractor();