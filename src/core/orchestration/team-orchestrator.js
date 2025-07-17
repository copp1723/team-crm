/**
 * TEAM ORCHESTRATOR
 * Adapted from multi-agent-orchestrator master-dispatcher.js for team CRM use case
 * 
 * This is the central coordination system that:
 * - Manages personal assistants for each team member (Joe, Charlie, Josh)
 * - Routes updates to the appropriate personal assistant
 * - Coordinates with the master executive agent for summaries
 * - Handles real-time processing and scheduling
 * - Provides API endpoints for team input
 */

import { EnhancedPersonalAssistant } from '../agents/enhanced-personal-assistant.js';
import { MasterExecutiveAgent } from '../agents/master-executive-agent.js';
import { EnhancedMemoryIntegration } from '../memory/enhanced-memory-integration.js';
import { TeamNotificationSystem } from '../notifications/team-notification-system.js';
import { ContextAwareAI } from '../../ai/context-aware-ai.js';
import { logger } from '../../utils/logger.js';
import EventEmitter from 'events';

export class TeamOrchestrator extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.personalAssistants = new Map();
        this.masterAgent = null;
        this.memorySystem = null;
        this.notificationSystem = null;
        this.contextAwareAI = null;
        this.isInitialized = false;
        this.processingQueue = [];
        this.stats = {
            totalUpdatesProcessed: 0,
            summariesGenerated: 0,
            activeMembers: 0,
            startTime: new Date().toISOString()
        };
        
        logger.info('Team Orchestrator initializing...');
    }
    
    /**
     * Initialize memory system
     */
    async initializeMemorySystem() {
        try {
            logger.info('Initializing Enhanced Memory System...');
            
            this.memorySystem = new EnhancedMemoryIntegration({
                collection: 'team-crm-' + (this.config.team?.name || 'default').toLowerCase().replace(/\s+/g, '-'),
                timeout: 30000
            });
            
            if (this.memorySystem.enabled) {
                logger.info('Memory System: Enabled', { collection: this.memorySystem.config.collection });
            } else {
                logger.info('Memory System: Disabled (no API key)');
            }
            
        } catch (error) {
            logger.error('Error initializing Memory System', { error });
            logger.info('Memory System: Disabled (initialization failed)');
            this.memorySystem = null;
        }
    }

    /**
     * Initialize the orchestrator with all agents
     */
    async initialize() {
        try {
            logger.info('Initializing Team Orchestrator...');
            
            // Initialize memory system first
            await this.initializeMemorySystem();
            
            // Initialize personal assistants for each team member
            await this.initializePersonalAssistants();
            
            // Initialize master executive agent
            await this.initializeMasterAgent();
            
            // Initialize notification system
            await this.initializeNotificationSystem();
            
            // Initialize context-aware AI system
            await this.initializeContextAwareAI();
            
            // Set up processing intervals
            this.setupProcessingIntervals();
            
            this.isInitialized = true;
            this.stats.activeMembers = this.personalAssistants.size;
            
            logger.info(`Team Orchestrator initialized with ${this.personalAssistants.size} personal assistants`);
            this.emit('initialized', this.getSystemStatus());
            
            return true;
            
        } catch (error) {
            logger.error('Error initializing Team Orchestrator', { error });
            throw error;
        }
    }
    
    /**
     * Initialize personal assistants for each team member
     */
    async initializePersonalAssistants() {
        let members;
        // Check if database is disabled (database-free mode)
        if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
            logger.info('Database-free mode: Loading team members from config file only');
            // Use config file directly
            members = Object.entries(this.config.team.members).map(([key, config]) => ({
                external_id: key,
                name: config.name,
                role: config.role,
                focus_areas: config.focus_areas,
                extraction_priorities: config.extraction_priorities,
                ai_model: config.ai_model
            }));
        } else {
            try {
                // Try to load team members from database first
                members = await this.loadTeamMembersFromDatabase();
                logger.info(`Loaded ${members.length} team members from database`);
            } catch (error) {
                logger.warn('Failed to load team members from database, falling back to config file', { error: error.message });
                // Fall back to config file
                members = Object.entries(this.config.team.members).map(([key, config]) => ({
                    external_id: key,
                    name: config.name,
                    role: config.role,
                    focus_areas: config.focus_areas,
                    extraction_priorities: config.extraction_priorities,
                    ai_model: config.ai_model
                }));
            }
        }
        for (const member of members) {
            try {
                logger.info(`Initializing personal assistant for ${member.name}...`);
                // Create memberConfig in the expected format
                const memberConfig = {
                    id: member.external_id,
                    name: member.name,
                    role: member.role,
                    focus_areas: member.focus_areas || ["dealer_relationships", "sales_activities"],
                    extraction_priorities: member.extraction_priorities || ["dealer_feedback", "meeting_notes", "action_items"],
                    ai_model: member.ai_model || "claude-3-sonnet"
                };
                const assistant = new EnhancedPersonalAssistant(memberConfig, this.config, this.memorySystem);
                this.personalAssistants.set(member.external_id, assistant);
                logger.info(`✅ Personal assistant ready for ${member.name}`);
            } catch (error) {
                logger.error(`Error initializing assistant for ${member.name}`, { error });
                throw error;
            }
        }
    }

    /**
     * Load team members from database
     */
    async loadTeamMembersFromDatabase() {
        try {
            const { createConnection } = await import('../../utils/database-pool.js');
            const db = createConnection();
            
            await db.connect();
            
            const result = await db.query(`
                SELECT 
                    id as external_id,
                    name,
                    role,
                    focus_areas,
                    extraction_priorities,
                    ai_model
                FROM team_members 
                ORDER BY name
            `);
            
            await db.end();
            return result.rows;
        } catch (error) {
            logger.error('Error loading team members from database', { error });
            throw error;
        }
    }
    
    /**
     * Initialize master executive agent
     */
    async initializeMasterAgent() {
        try {
            logger.info('Initializing Master Executive Agent...');
            
            this.masterAgent = new MasterExecutiveAgent(this.config, this.memorySystem);
            
            logger.info('✅ Master Executive Agent ready');
            
        } catch (error) {
            logger.error('Error initializing Master Executive Agent', { error });
            throw error;
        }
    }
    
    /**
     * Initialize notification system
     */
    async initializeNotificationSystem() {
        try {
            logger.info('Initializing Team Notification System...');
            
            this.notificationSystem = new TeamNotificationSystem(this, this.memorySystem);
            
            logger.info('✅ Team Notification System ready');
            
        } catch (error) {
            logger.error('Error initializing Team Notification System', { error });
            throw error;
        }
    }
    
    /**
     * Initialize context-aware AI system
     */
    async initializeContextAwareAI() {
        try {
            logger.info('Initializing Context-Aware AI System...');
            
            this.contextAwareAI = new ContextAwareAI({
                openRouterApiKey: this.config.ai?.openRouterApiKey || process.env.OPENROUTER_API_KEY,
                defaultModel: this.config.ai?.defaultModel || 'anthropic/claude-3-5-sonnet-20241022',
                maxTokens: this.config.ai?.maxTokens || 2000,
                temperature: this.config.ai?.temperature || 0.7,
                memory: {
                    redisHost: this.config.redis?.host,
                    redisPort: this.config.redis?.port,
                    redisPassword: this.config.redis?.password,
                    redisDb: 2 // Separate DB for AI memory
                },
                enablePersonalization: true,
                enableTeamIntelligence: true,
                enableFollowUpSuggestions: true,
                enableEscalationDetection: true,
                enableSentimentTracking: true
            });
            
            await this.contextAwareAI.initialize();
            
            logger.info('✅ Context-Aware AI System ready');
            
        } catch (error) {
            logger.error('Error initializing Context-Aware AI System', { error });
            throw error;
        }
    }
    
    /**
     * Process email update from assistant
     */
    async processEmailUpdate(teamUpdate, emailContext) {
        try {
            logger.info(`Processing email update from ${teamUpdate.memberName}`);
            
            // Process as regular team update with email context
            const result = await this.processTeamUpdate(
                teamUpdate.memberName, 
                teamUpdate.updateText, 
                {
                    ...teamUpdate.metadata,
                    emailContext,
                    source: 'email'
                }
            );
            
            // Check for executive escalation from email
            if (this.shouldEscalateEmail(emailContext, result)) {
                await this.escalateEmailToExecutive(emailContext, result);
            }
            
            return result;
            
        } catch (error) {
            logger.error('Error processing email update', { error });
            throw error;
        }
    }
    
    /**
     * Check if email should be escalated to executive
     */
    shouldEscalateEmail(emailContext, processedResult) {
        // High urgency emails
        if (emailContext.urgency?.level === 'high') {
            return true;
        }
        
        // Financial content above threshold
        if (emailContext.business?.financial?.hasFinancialContent) {
            const amounts = emailContext.business.financial.amounts;
            const hasLargeAmount = amounts.some(amount => {
                const value = parseFloat(amount.value.replace(/[$,kKmM]/g, ''));
                return value > 50000; // $50K threshold
            });
            if (hasLargeAmount) return true;
        }
        
        // Meeting requests from external parties
        if (emailContext.business?.meetings?.requested && !emailContext.sender?.isInternal) {
            return true;
        }
        
        // AI detected high priority
        if (processedResult.extracted?.requires_attention) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Escalate email to executive attention
     */
    async escalateEmailToExecutive(emailContext, processedResult) {
        try {
            const escalation = {
                type: 'email_escalation',
                timestamp: new Date().toISOString(),
                source: emailContext.email.from,
                subject: emailContext.email.subject,
                urgency: emailContext.urgency?.level || 'medium',
                reason: this.getEscalationReason(emailContext, processedResult),
                context: {
                    emailContext,
                    processedResult
                }
            };
            
            // Send to master agent for executive summary
            if (this.masterAgent) {
                await this.masterAgent.receiveEscalation(escalation);
            }
            
            // Emit escalation event
            this.emit('escalationCreated', escalation);
            
            logger.info(`Email escalated to executive: ${emailContext.email.subject}`);
            
        } catch (error) {
            logger.error('Error escalating email to executive', { error });
        }
    }
    
    /**
     * Get escalation reason
     */
    getEscalationReason(emailContext, processedResult) {
        const reasons = [];
        
        if (emailContext.urgency?.level === 'high') {
            reasons.push('High urgency detected');
        }
        
        if (emailContext.business?.financial?.hasFinancialContent) {
            reasons.push('Financial content requires attention');
        }
        
        if (emailContext.business?.meetings?.requested) {
            reasons.push('Meeting request from external party');
        }
        
        if (processedResult.extracted?.requires_attention) {
            reasons.push('AI flagged as requiring attention');
        }
        
        return reasons.join(', ') || 'Executive review recommended';
    }
    
    /**
     * Process update from a team member
     */
    async processTeamUpdate(memberName, updateText, metadata = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Team Orchestrator not initialized');
            }
            
            logger.info(`Processing update from ${memberName}`);
            
            // Find the personal assistant for this member
            const assistant = this.getPersonalAssistant(memberName);
            if (!assistant) {
                throw new Error(`No personal assistant found for ${memberName}`);
            }
            
            // Process the update through their personal assistant
            const structuredUpdate = await assistant.processUpdate(updateText, metadata);
            
            // Store in enhanced memory if email context available
            if (metadata.emailContext && this.memorySystem) {
                await this.storeEmailContext(memberName, metadata.emailContext, structuredUpdate);
            }
            
            // Generate context-aware AI response if available
            let aiResponse = null;
            if (this.contextAwareAI) {
                try {
                    aiResponse = await this.contextAwareAI.generateResponse(updateText, {
                        memberName,
                        conversationId: metadata.conversationId || `conv_${Date.now()}`,
                        sessionId: metadata.sessionId,
                        urgency: structuredUpdate.urgency || 'normal',
                        metadata: {
                            extractedData: structuredUpdate.extracted,
                            updateType: structuredUpdate.type || 'general'
                        }
                    });
                    
                    structuredUpdate.aiResponse = aiResponse;
                } catch (aiError) {
                    logger.warn('AI response generation failed', { error: aiError.message });
                    structuredUpdate.aiResponse = {
                        response: 'AI analysis temporarily unavailable',
                        followUpSuggestions: [],
                        escalationRecommendations: [],
                        fallback: true
                    };
                }
            }
            
            // Send to master executive agent
            const masterResponse = await this.masterAgent.receiveUpdate(structuredUpdate);
            
            // Update statistics
            this.stats.totalUpdatesProcessed++;
            if (masterResponse.status === 'summary_generated') {
                this.stats.summariesGenerated++;
            }
            
            // Emit events for real-time updates
            this.emit('updateProcessed', {
                memberName,
                updateLength: updateText.length,
                extractedItems: structuredUpdate.extracted.totalItems,
                masterResponse
            });
            
            if (masterResponse.summary) {
                this.emit('summaryGenerated', {
                    summary: masterResponse.summary,
                    processedUpdates: masterResponse.processedUpdates
                });
            }
            
            return {
                status: 'success',
                memberName,
                extracted: structuredUpdate.extracted,
                masterResponse,
                aiResponse: structuredUpdate.aiResponse,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error(`Error processing update from ${memberName}`, { error, memberName });
            this.emit('error', { memberName, error: error.message });
            throw error;
        }
    }
    
    /**
     * Get personal assistant for a team member
     */
    getPersonalAssistant(memberName) {
        // Try exact match first
        for (const [key, assistant] of this.personalAssistants.entries()) {
            if (assistant.memberName.toLowerCase() === memberName.toLowerCase()) {
                return assistant;
            }
        }
        
        // Try key match
        const assistant = this.personalAssistants.get(memberName.toLowerCase());
        if (assistant) {
            return assistant;
        }
        
        logger.error(`Personal assistant not found for: ${memberName}`, { 
            memberName, 
            availableAssistants: Array.from(this.personalAssistants.keys()) 
        });
        return null;
    }
    
    /**
     * Force generate executive summary
     */
    async generateExecutiveSummary() {
        try {
            if (!this.masterAgent) {
                throw new Error('Master agent not initialized');
            }
            
            logger.info('Forcing executive summary generation...');
            
            const summary = await this.masterAgent.forceGenerateSummary();
            
            if (summary.status === 'summary_generated') {
                this.stats.summariesGenerated++;
                this.emit('summaryGenerated', {
                    summary: summary.summary,
                    processedUpdates: summary.processedUpdates,
                    forced: true
                });
            }
            
            return summary;
            
        } catch (error) {
            logger.error('Error generating executive summary', { error });
            throw error;
        }
    }
    
    /**
     * Generate intelligent follow-up suggestions for a team member
     */
    async generateFollowUpSuggestions(memberName, lastUpdate = null) {
        try {
            if (!this.contextAwareAI) {
                return [];
            }
            
            const suggestions = await this.contextAwareAI.memoryEngine.generateFollowUpSuggestions({
                memberName,
                lastUpdate: lastUpdate || 'recent team activity',
                conversationHistory: [],
                teamContext: {}
            });
            
            return suggestions;
            
        } catch (error) {
            logger.error('Error generating follow-up suggestions', { error });
            return [];
        }
    }
    
    /**
     * Generate context-aware response to a message
     */
    async generateContextAwareResponse(message, context = {}) {
        try {
            if (!this.contextAwareAI) {
                return {
                    response: 'Context-aware AI not available',
                    followUpSuggestions: [],
                    escalationRecommendations: []
                };
            }
            
            return await this.contextAwareAI.generateResponse(message, {
                memberName: context.memberName,
                conversationId: context.conversationId,
                sessionId: context.sessionId,
                isExecutive: context.isExecutive || false,
                urgency: context.urgency || 'normal',
                metadata: context.metadata || {}
            });
            
        } catch (error) {
            logger.error('Error generating context-aware response', { error });
            return {
                response: 'I apologize, but I encountered an error processing your message. Please try again.',
                followUpSuggestions: [],
                escalationRecommendations: [],
                error: true
            };
        }
    }
    
    /**
     * Get AI-powered team insights
     */
    async getTeamInsights(memberName = null) {
        try {
            if (!this.contextAwareAI) {
                return { insights: [], patterns: {} };
            }
            
            const patterns = await this.contextAwareAI.memoryEngine.getTeamPatterns(memberName);
            
            const insights = {
                patterns,
                memberInsights: memberName ? await this.getMemberInsights(memberName) : null,
                teamHealth: this.calculateTeamHealth(patterns),
                recommendations: await this.generateTeamRecommendations(patterns)
            };
            
            return insights;
            
        } catch (error) {
            logger.error('Error getting team insights', { error });
            return { insights: [], patterns: {} };
        }
    }
    
    /**
     * Get member-specific insights
     */
    async getMemberInsights(memberName) {
        try {
            const conversationContext = await this.contextAwareAI.memoryEngine.getConversationContext(memberName, 20);
            const patterns = this.contextAwareAI.analyzeTeamPatterns(conversationContext);
            
            return {
                communicationFrequency: patterns.frequency,
                sentimentTrend: patterns.sentiment,
                engagementLevel: patterns.engagement,
                lastActivity: conversationContext.length > 0 ? 
                    new Date(conversationContext[0].metadata.timestamp).toISOString() : null
            };
            
        } catch (error) {
            logger.error('Error getting member insights', { error });
            return {};
        }
    }
    
    /**
     * Calculate overall team health score
     */
    calculateTeamHealth(patterns) {
        let healthScore = 100;
        
        // Check communication frequency
        if (patterns.frequency?.trend === 'decreasing') {
            healthScore -= 20;
        }
        
        // Check sentiment
        if (patterns.sentiment?.overall === 'negative') {
            healthScore -= 30;
        } else if (patterns.sentiment?.trend === 'declining') {
            healthScore -= 15;
        }
        
        // Check engagement
        if (patterns.engagement?.level === 'low') {
            healthScore -= 25;
        }
        
        return {
            score: Math.max(0, healthScore),
            level: healthScore >= 80 ? 'excellent' : 
                   healthScore >= 60 ? 'good' : 
                   healthScore >= 40 ? 'concerning' : 'critical',
            factors: {
                communication: patterns.frequency?.trend || 'stable',
                sentiment: patterns.sentiment?.overall || 'neutral',
                engagement: patterns.engagement?.level || 'medium'
            }
        };
    }
    
    /**
     * Generate team recommendations based on patterns
     */
    async generateTeamRecommendations(patterns) {
        const recommendations = [];
        
        if (patterns.frequency?.trend === 'decreasing') {
            recommendations.push({
                type: 'communication',
                priority: 'medium',
                title: 'Increase Check-in Frequency',
                description: 'Team communication frequency has decreased. Consider more regular check-ins.',
                action: 'Schedule additional team touchpoints'
            });
        }
        
        if (patterns.sentiment?.overall === 'negative') {
            recommendations.push({
                type: 'morale',
                priority: 'high',
                title: 'Address Team Morale',
                description: 'Team sentiment appears negative. Investigation and support may be needed.',
                action: 'Conduct one-on-one meetings to understand concerns'
            });
        }
        
        if (patterns.engagement?.level === 'low') {
            recommendations.push({
                type: 'engagement',
                priority: 'medium',
                title: 'Boost Team Engagement',
                description: 'Team engagement levels are low. Consider team-building or process improvements.',
                action: 'Review team processes and provide additional support'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Get system status and statistics
     */
    getSystemStatus() {
        const assistantStats = {};
        for (const [key, assistant] of this.personalAssistants.entries()) {
            assistantStats[key] = assistant.getProcessingStats();
        }
        
        const masterStats = this.masterAgent ? this.masterAgent.getAgentStats() : null;
        
        return {
            initialized: this.isInitialized,
            stats: this.stats,
            personalAssistants: assistantStats,
            masterAgent: masterStats,
            systemUptime: this.getUptime(),
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Get list of available team members
     */
    getTeamMembers() {
        const members = [];
        for (const [key, assistant] of this.personalAssistants.entries()) {
            members.push({
                key,
                name: assistant.memberName,
                role: assistant.memberRole,
                capabilities: assistant.memberConfig.capabilities,
                focusAreas: assistant.memberConfig.focusAreas
            });
        }
        return members;
    }
    
    /**
     * Reload team members from config/database and re-initialize personal assistants
     */
    async reloadTeamMembers() {
        logger.info('Reloading team members in orchestrator...');
        await this.initializePersonalAssistants();
        this.stats.activeMembers = this.personalAssistants.size;
        logger.info(`Reloaded ${this.personalAssistants.size} team members.`);
    }
    
    /**
     * Setup processing intervals for scheduled operations
     */
    setupProcessingIntervals() {
        // Summary generation interval (fallback if no updates trigger it)
        const summaryInterval = this.parseDuration(
            this.config.processing?.summaryGeneration?.schedule || '30m'
        );
        
        if (summaryInterval > 0) {
            setInterval(async () => {
                try {
                    await this.checkAndGenerateSummary();
                } catch (error) {
                    logger.error('Error in scheduled summary generation', { error });
                }
            }, summaryInterval);
        }
        
        // Cleanup interval
        setInterval(() => {
            this.performCleanup();
        }, 60 * 60 * 1000); // Every hour
    }
    
    /**
     * Check if we should generate a summary and do it
     */
    async checkAndGenerateSummary() {
        if (!this.masterAgent) return;
        
        const stats = this.masterAgent.getAgentStats();
        
        // Generate summary if there are pending updates and enough time has passed
        if (stats.pendingUpdates > 0 && stats.nextSummaryIn === 'ready') {
            logger.info('Scheduled summary generation triggered');
            await this.generateExecutiveSummary();
        }
    }
    
    /**
     * Perform system cleanup
     */
    performCleanup() {
        logger.info('Performing system cleanup...');
        
        let cleanupStats = { assistantsProcessed: 0, masterAgentCleaned: false };
        
        // Clean up processing history if it gets too large
        for (const assistant of this.personalAssistants.values()) {
            if (assistant.processingHistory && assistant.processingHistory.length > 1000) {
                assistant.processingHistory = assistant.processingHistory.slice(-500);
                cleanupStats.assistantsProcessed++;
            }
        }
        
        // Clean up master agent history
        if (this.masterAgent && this.masterAgent.summaryHistory && this.masterAgent.summaryHistory.length > 100) {
            this.masterAgent.summaryHistory = this.masterAgent.summaryHistory.slice(-50);
            cleanupStats.masterAgentCleaned = true;
        }
        
        logger.info('System cleanup completed', cleanupStats);
    }
    
    /**
     * Parse duration string to milliseconds
     */
    parseDuration(duration) {
        const match = duration.match(/(\d+)([mhd])/);
        if (!match) return 0;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return 0;
        }
    }
    
    /**
     * Get system uptime
     */
    getUptime() {
        const startTime = new Date(this.stats.startTime);
        const uptime = Date.now() - startTime.getTime();
        
        const hours = Math.floor(uptime / (60 * 60 * 1000));
        const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
        
        return `${hours}h ${minutes}m`;
    }
    
    /**
     * Shutdown the orchestrator gracefully
     */
    async shutdown() {
        logger.info('Shutting down Team Orchestrator...');
        
        // Clear intervals
        // Note: In a real implementation, you'd store interval IDs and clear them
        
        // Final cleanup
        this.performCleanup();
        
        this.isInitialized = false;
        this.emit('shutdown');
        
        logger.info('Team Orchestrator shutdown complete');
    }
    
    /**
     * Get processing queue status
     */
    getProcessingQueueStatus() {
        return {
            queueLength: this.processingQueue.length,
            processing: this.processingQueue.length > 0,
            oldestItem: this.processingQueue.length > 0 ? this.processingQueue[0].timestamp : null
        };
    }
    
    /**
     * Store email context in enhanced memory
     */
    async storeEmailContext(memberName, emailContext, structuredUpdate) {
        try {
            if (!this.memorySystem || !this.memorySystem.enabled) {
                return;
            }
            
            const memoryEntry = {
                type: 'email_context',
                memberName,
                timestamp: emailContext.timestamp,
                emailData: {
                    from: emailContext.email.from,
                    subject: emailContext.email.subject,
                    urgency: emailContext.urgency,
                    businessContext: emailContext.business
                },
                extractedData: structuredUpdate.extracted_data,
                escalated: emailContext.escalated || false
            };
            
            await this.memorySystem.storeInteraction({
                id: `email_${emailContext.messageId}`,
                member_id: memberName,
                raw_input: emailContext.content.text,
                extracted_data: memoryEntry,
                timestamp: emailContext.timestamp,
                source: 'email'
            });
            
            logger.info(`Email context stored in memory for ${memberName}`);
            
        } catch (error) {
            logger.error('Error storing email context in memory', { error });
        }
    }
    
    /**
     * Health check for the system
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            checks: {},
            timestamp: new Date().toISOString()
        };
        
        // Check initialization
        health.checks.initialized = this.isInitialized;
        
        // Check personal assistants
        health.checks.personalAssistants = {
            count: this.personalAssistants.size,
            expected: Object.keys(this.config.team.members).length,
            healthy: this.personalAssistants.size === Object.keys(this.config.team.members).length
        };
        
        // Check memory system
        health.checks.memorySystem = {
            initialized: Boolean(this.memorySystem),
            enabled: this.memorySystem ? this.memorySystem.enabled : false,
            healthy: this.memorySystem ? this.memorySystem.enabled : false
        };
        
        // Check master agent
        health.checks.masterAgent = {
            initialized: Boolean(this.masterAgent),
            healthy: Boolean(this.masterAgent)
        };
        
        // Overall status
        const allHealthy = Object.values(health.checks).every(check => 
            typeof check === 'boolean' ? check : check.healthy
        );
        
        health.status = allHealthy ? 'healthy' : 'unhealthy';
        
        return health;
    }
}