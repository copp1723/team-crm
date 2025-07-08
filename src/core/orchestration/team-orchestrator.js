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

import { PersonalAssistant } from '../agents/simple-personal-assistant.js';
import { MasterExecutiveAgent } from '../agents/simple-master-agent.js';
import { EnhancedMemoryIntegration } from '../memory/enhanced-memory-integration.js';
import { TeamNotificationSystem } from '../notifications/team-notification-system.js';
import { ContextAwareAI } from '../../ai/context-aware-ai.js';
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
        
        console.log('Team Orchestrator initializing...');
    }
    
    /**
     * Initialize memory system
     */
    async initializeMemorySystem() {
        try {
            console.log('Initializing Enhanced Memory System...');
            
            this.memorySystem = new EnhancedMemoryIntegration({
                collection: 'team-crm-' + (this.config.team?.name || 'default').toLowerCase().replace(/\s+/g, '-'),
                timeout: 30000
            });
            
            if (this.memorySystem.enabled) {
                console.log('Memory System: Enabled');
                console.log(`   Collection: ${this.memorySystem.config.collection}`);
            } else {
                console.log('Memory System: Disabled (no API key)');
            }
            
        } catch (error) {
            console.error('Error initializing Memory System:', error);
            console.log('Memory System: Disabled (initialization failed)');
            this.memorySystem = null;
        }
    }

    /**
     * Initialize the orchestrator with all agents
     */
    async initialize() {
        try {
            console.log('Initializing Team Orchestrator...');
            
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
            
            console.log(`Team Orchestrator initialized with ${this.personalAssistants.size} personal assistants`);
            this.emit('initialized', this.getSystemStatus());
            
            return true;
            
        } catch (error) {
            console.error('Error initializing Team Orchestrator:', error);
            throw error;
        }
    }
    
    /**
     * Initialize personal assistants for each team member
     */
    async initializePersonalAssistants() {
        const members = this.config.team.members;
        
        for (const [memberKey, memberConfig] of Object.entries(members)) {
            try {
                console.log(`Initializing personal assistant for ${memberConfig.name}...`);
                
                const assistant = new PersonalAssistant(memberConfig, this.config, this.memorySystem);
                this.personalAssistants.set(memberKey, assistant);
                
                console.log(`✅ Personal assistant ready for ${memberConfig.name}`);
                
            } catch (error) {
                console.error(`Error initializing assistant for ${memberConfig.name}:`, error);
                throw error;
            }
        }
    }
    
    /**
     * Initialize master executive agent
     */
    async initializeMasterAgent() {
        try {
            console.log('Initializing Master Executive Agent...');
            
            this.masterAgent = new MasterExecutiveAgent(this.config, this.memorySystem);
            
            console.log('✅ Master Executive Agent ready');
            
        } catch (error) {
            console.error('Error initializing Master Executive Agent:', error);
            throw error;
        }
    }
    
    /**
     * Initialize notification system
     */
    async initializeNotificationSystem() {
        try {
            console.log('Initializing Team Notification System...');
            
            this.notificationSystem = new TeamNotificationSystem(this, this.memorySystem);
            
            console.log('✅ Team Notification System ready');
            
        } catch (error) {
            console.error('Error initializing Team Notification System:', error);
            throw error;
        }
    }
    
    /**
     * Initialize context-aware AI system
     */
    async initializeContextAwareAI() {
        try {
            console.log('Initializing Context-Aware AI System...');
            
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
            
            console.log('✅ Context-Aware AI System ready');
            
        } catch (error) {
            console.error('Error initializing Context-Aware AI System:', error);
            throw error;
        }
    }
    
    /**
     * Process update from a team member
     */
    async processTeamUpdate(memberName, updateText, metadata = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Team Orchestrator not initialized');
            }
            
            console.log(`Processing update from ${memberName}`);
            
            // Find the personal assistant for this member
            const assistant = this.getPersonalAssistant(memberName);
            if (!assistant) {
                throw new Error(`No personal assistant found for ${memberName}`);
            }
            
            // Process the update through their personal assistant
            const structuredUpdate = await assistant.processUpdate(updateText, metadata);
            
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
                    console.warn('AI response generation failed:', aiError.message);
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
            console.error(`Error processing update from ${memberName}:`, error);
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
        
        console.error(`Personal assistant not found for: ${memberName}`);
        console.log('Available assistants:', Array.from(this.personalAssistants.keys()));
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
            
            console.log('Forcing executive summary generation...');
            
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
            console.error('Error generating executive summary:', error);
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
            console.error('Error generating follow-up suggestions:', error);
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
            console.error('Error generating context-aware response:', error);
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
            console.error('Error getting team insights:', error);
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
            console.error('Error getting member insights:', error);
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
                    console.error('Error in scheduled summary generation:', error);
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
            console.log('Scheduled summary generation triggered');
            await this.generateExecutiveSummary();
        }
    }
    
    /**
     * Perform system cleanup
     */
    performCleanup() {
        console.log('Performing system cleanup...');
        
        // Clean up processing history if it gets too large
        for (const assistant of this.personalAssistants.values()) {
            if (assistant.processingHistory && assistant.processingHistory.length > 1000) {
                assistant.processingHistory = assistant.processingHistory.slice(-500);
            }
        }
        
        // Clean up master agent history
        if (this.masterAgent && this.masterAgent.summaryHistory && this.masterAgent.summaryHistory.length > 100) {
            this.masterAgent.summaryHistory = this.masterAgent.summaryHistory.slice(-50);
        }
        
        console.log('System cleanup completed');
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
        console.log('Shutting down Team Orchestrator...');
        
        // Clear intervals
        // Note: In a real implementation, you'd store interval IDs and clear them
        
        // Final cleanup
        this.performCleanup();
        
        this.isInitialized = false;
        this.emit('shutdown');
        
        console.log('Team Orchestrator shutdown complete');
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