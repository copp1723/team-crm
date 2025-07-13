import { v4 as uuidv4 } from 'uuid';
import { RealAIProcessor } from '../../ai/real-ai-processor.js';
import { CalendarIntelligence } from '../calendar/calendar-intelligence.js';
import { logger } from '../../utils/logger.js';

export class PersonalAssistant {
    constructor(memberConfig, globalConfig) {
        this.memberConfig = memberConfig;
        this.memberName = memberConfig.name;
        this.memberRole = memberConfig.role;
        this.memberKey = memberConfig.id;
        this.globalConfig = globalConfig;
        this.processingHistory = [];
        this.totalUpdatesProcessed = 0;
        this.logger = logger.child({ component: 'PersonalAssistant', member: this.memberName });
        
        // Initialize real AI processor
        this.aiProcessor = new RealAIProcessor({
            apiKey: globalConfig.ai?.apiKey || process.env.OPENROUTER_API_KEY,
            defaultModel: memberConfig.ai_model || globalConfig.ai?.models?.extraction || 'anthropic/claude-3-5-sonnet-20241022'
        });
        
        // Initialize calendar intelligence
        this.calendarIntelligence = new CalendarIntelligence({
            timezone: memberConfig.timezone || globalConfig.timezone || 'America/Chicago',
            workingHours: memberConfig.workingHours || globalConfig.workingHours,
            enableSmartSuggestions: true,
            enableConflictDetection: true
        });
        
        // Calendar memory and state
        this.calendarMemory = [];
        this.pendingInvites = new Map();
        this.scheduleQueries = [];
    }

    async processUpdate(updateText, metadata = {}) {
        try {
            const updateId = uuidv4();
            const timestamp = new Date().toISOString();

            console.log(`Processing update for ${this.memberName} with real AI...`);

            // Use real AI processing instead of keyword extraction
            const aiResult = await this.aiProcessor.processTeamUpdate(
                this.memberName,
                updateText,
                this.memberConfig
            );

            // Transform AI result to match expected interface
            const extracted = this.transformAIResult(aiResult);

            // Store in processing history
            const processedUpdate = {
                id: updateId,
                timestamp,
                memberName: this.memberName,
                rawInput: updateText,
                extracted,
                aiResult, // Store full AI result for debugging
                metadata,
                processingMethod: aiResult.success ? 'ai' : 'fallback'
            };

            this.processingHistory.push(processedUpdate);
            this.totalUpdatesProcessed++;

            // Keep only last 100 updates
            if (this.processingHistory.length > 100) {
                this.processingHistory = this.processingHistory.slice(-100);
            }

            console.log(`✅ Update processed for ${this.memberName}: ${extracted.totalItems} items extracted`);

            return {
                updateId,
                memberName: this.memberName,
                extracted,
                aiAnalysis: aiResult.analysis,
                confidence: aiResult.analysis?.metadata?.overallConfidence || 0.5,
                processingTime: aiResult.processingTime,
                fallbackUsed: !aiResult.success,
                timestamp
            };

        } catch (error) {
            console.error(`Error processing update for ${this.memberName}:`, error);
            
            // Create basic fallback response
            const fallbackExtracted = this.createFallbackExtraction(updateText);
            
            return {
                updateId: uuidv4(),
                memberName: this.memberName,
                extracted: fallbackExtracted,
                error: error.message,
                fallbackUsed: true,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Transform AI result to match the expected interface
     */
    transformAIResult(aiResult) {
        if (!aiResult.success || !aiResult.analysis) {
            return this.createFallbackExtraction('');
        }

        const analysis = aiResult.analysis;
        
        // Convert AI analysis to simplified extracted format for compatibility
        const priorities = (analysis.priorities || []).map(p => p.item);
        const actionItems = (analysis.actionItems || []).map(a => a.text);
        const clientInfo = (analysis.clients || []).map(c => 
            `${c.name}: ${c.status}${c.dealValue ? ` ($${c.dealValue.toLocaleString()})` : ''}`
        );
        
        const technicalInfo = [];
        const revenueInfo = [];
        
        // Extract revenue-related insights
        analysis.clients?.forEach(client => {
            if (client.dealValue) {
                revenueInfo.push(`${client.name}: $${client.dealValue.toLocaleString()} deal`);
            }
        });

        analysis.keyInsights?.forEach(insight => {
            if (insight.category === 'revenue') {
                revenueInfo.push(insight.insight);
            } else if (insight.category === 'operational') {
                technicalInfo.push(insight.insight);
            }
        });

        const keyInsights = (analysis.keyInsights || []).map(i => i.insight);

        return {
            priorities,
            actionItems,
            clientInfo,
            technicalInfo,
            revenueInfo,
            keyInsights,
            totalItems: priorities.length + actionItems.length + clientInfo.length + 
                       technicalInfo.length + revenueInfo.length,
            
            // Add enhanced data for UI
            detailedAnalysis: {
                actionItemsDetailed: analysis.actionItems || [],
                clientsDetailed: analysis.clients || [],
                prioritiesDetailed: analysis.priorities || [],
                sentimentAnalysis: analysis.sentimentAnalysis,
                executiveEscalation: analysis.executiveEscalation,
                confidence: analysis.metadata?.overallConfidence || 0.5
            }
        };
    }

    /**
     * Create basic fallback extraction when AI fails
     */
    createFallbackExtraction(updateText) {
        const priorities = [];
        const actionItems = [];
        const clientInfo = [];
        const technicalInfo = [];
        const revenueInfo = [];
        const keyInsights = [`Update from ${this.memberName} (${this.memberRole})`];

        const lowerText = updateText.toLowerCase();

        // Basic keyword detection
        if (lowerText.includes('urgent') || lowerText.includes('critical')) {
            priorities.push('High priority matter identified');
        }
        
        if (lowerText.includes('need to') || lowerText.includes('should')) {
            actionItems.push('Action items detected in update');
        }
        
        if (lowerText.includes('client') || lowerText.includes('customer')) {
            clientInfo.push('Client activity mentioned');
        }
        
        if (lowerText.includes('$') || lowerText.includes('revenue') || lowerText.includes('deal')) {
            revenueInfo.push('Revenue-related activity mentioned');
        }

        return {
            priorities,
            actionItems,
            clientInfo,
            technicalInfo,
            revenueInfo,
            keyInsights,
            totalItems: priorities.length + actionItems.length + clientInfo.length + 
                       technicalInfo.length + revenueInfo.length,
            detailedAnalysis: {
                actionItemsDetailed: [],
                clientsDetailed: [],
                prioritiesDetailed: [],
                sentimentAnalysis: { overall: 'neutral', confidence: 0.1 },
                executiveEscalation: { required: false },
                confidence: 0.2
            }
        };
    }

    // Legacy methods for backward compatibility
    extractPriorities(text) {
        // This method is now handled by AI, but kept for fallback
        const priorities = [];
        const urgentKeywords = ['urgent', 'critical', 'asap', 'important', 'priority'];
        const lowText = text.toLowerCase();
        
        for (const keyword of urgentKeywords) {
            if (lowText.includes(keyword)) {
                priorities.push({
                    priority: "High priority item detected",
                    deadline: this.extractDeadline(text),
                    assignee: this.detectAssignee(text),
                    confidence: "medium"
                });
                break;
            }
        }

        return priorities;
    }

    extractActionItems(text) {
        // Legacy fallback method
        const actions = [];
        const actionKeywords = ['need to', 'should', 'will', 'must', 'have to', 'going to'];
        const lowText = text.toLowerCase();
        
        for (const keyword of actionKeywords) {
            if (lowText.includes(keyword)) {
                actions.push({
                    action: "Action item identified",
                    deadline: this.extractDeadline(text),
                    assignee: this.detectAssignee(text) || this.memberName
                });
                break;
            }
        }

        return actions;
    }

    extractClientInfo(text) {
        // Legacy fallback method
        const clients = [];
        const clientKeywords = ['client', 'customer', 'prospect', 'lead', 'corp', 'company'];
        const lowText = text.toLowerCase();
        
        for (const keyword of clientKeywords) {
            if (lowText.includes(keyword)) {
                clients.push({
                    client: this.extractClientName(text),
                    status: "mentioned",
                    sentiment: this.detectSentiment(text)
                });
                break;
            }
        }

        return clients;
    }

    extractTechnicalInfo(text) {
        // Legacy fallback method
        const technical = [];
        const techKeywords = ['integration', 'api', 'system', 'platform', 'technical', 'bug', 'issue'];
        const lowText = text.toLowerCase();
        
        for (const keyword of techKeywords) {
            if (lowText.includes(keyword)) {
                technical.push({
                    issue: "Technical matter mentioned",
                    priority: this.detectSentiment(text) === 'negative' ? 'high' : 'medium'
                });
                break;
            }
        }

        return technical;
    }

    extractRevenueInfo(text) {
        // Legacy fallback method
        const revenue = [];
        const revenueKeywords = ['contract', 'expansion', 'upsell', 'renewal', 'revenue', 'money', '$'];
        const lowText = text.toLowerCase();
        
        for (const keyword of revenueKeywords) {
            if (lowText.includes(keyword)) {
                revenue.push({
                    opportunity: "Revenue opportunity identified",
                    value: this.extractValue(text),
                    probability: "medium"
                });
                break;
            }
        }

        return revenue;
    }

    extractKeyInsights(text) {
        // Legacy fallback method
        const insights = [];
        
        if (text.length > 50) {
            insights.push(`Update from ${this.memberName} (${this.memberRole})`);
        }
        
        if (text.toLowerCase().includes('client')) {
            insights.push("Client-related activity");
        }
        
        if (text.toLowerCase().includes('urgent') || text.toLowerCase().includes('critical')) {
            insights.push("High priority matter");
        }

        return insights;
    }

    // Helper methods
    extractDeadline(text) {
        const dateKeywords = ['today', 'tomorrow', 'next week', 'friday', 'monday'];
        const lowText = text.toLowerCase();
        
        for (const keyword of dateKeywords) {
            if (lowText.includes(keyword)) {
                return keyword;
            }
        }
        return null;
    }

    detectAssignee(text) {
        const names = ['joe', 'charlie', 'josh', 'tre'];
        const lowText = text.toLowerCase();
        
        for (const name of names) {
            if (lowText.includes(name)) {
                return name;
            }
        }
        return null;
    }

    extractClientName(text) {
        if (text.toLowerCase().includes('corp')) {
            return "ClientCorp";
        }
        return "Client";
    }

    detectSentiment(text) {
        const lowText = text.toLowerCase();
        if (lowText.includes('great') || lowText.includes('good') || lowText.includes('positive')) {
            return 'positive';
        }
        if (lowText.includes('issue') || lowText.includes('problem') || lowText.includes('concern')) {
            return 'negative';
        }
        return 'neutral';
    }

    extractValue(text) {
        const match = text.match(/\$[\d,]+/);
        return match ? match[0] : "TBD";
    }

    getProcessingStats() {
        const aiStats = this.aiProcessor.getStats();
        
        return {
            memberName: this.memberName,
            memberRole: this.memberRole,
            totalUpdatesProcessed: this.totalUpdatesProcessed,
            recentUpdates: this.processingHistory.slice(-5).length,
            lastUpdate: this.processingHistory.length > 0 ? 
                       this.processingHistory[this.processingHistory.length - 1].timestamp : null,
            aiProcessingStats: aiStats,
            successRate: aiStats.successRate,
            averageProcessingTime: aiStats.averageResponseTime / 1000 // Convert to seconds
        };
    }

    /**
     * Process calendar invite received via email
     */
    async processCalendarInvite(emailData) {
        try {
            this.logger.info('Processing calendar invite', {
                from: emailData.from,
                subject: emailData.subject
            });
            
            const result = await this.calendarIntelligence.processCalendarInvite(
                this.memberKey,
                emailData,
                { store: this.storeCalendarMemory.bind(this) }
            );
            
            if (result.success && result.isMeetingRelated) {
                // Store pending invite for follow-up
                const inviteId = uuidv4();
                this.pendingInvites.set(inviteId, {
                    id: inviteId,
                    emailData,
                    result,
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });
                
                // Add calendar processing to the result for integration
                result.calendarProcessing = {
                    inviteId,
                    memberName: this.memberName,
                    assistantProcessed: true,
                    requiresResponse: result.conflicts.length > 0 || result.suggestions.length > 0
                };
                
                this.logger.info('Calendar invite processed successfully', {
                    inviteId,
                    hasConflicts: result.conflicts.length > 0,
                    hasSuggestions: result.suggestions.length > 0
                });
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to process calendar invite', {
                error: error.message,
                from: emailData.from
            });
            
            return {
                success: false,
                error: error.message,
                isMeetingRelated: false
            };
        }
    }

    /**
     * Handle natural language schedule queries
     */
    async handleScheduleQuery(query, context = {}) {
        try {
            this.logger.info('Processing schedule query', {
                query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
                context
            });
            
            const result = await this.calendarIntelligence.processScheduleQuery(
                this.memberKey,
                query,
                { store: this.storeCalendarMemory.bind(this) }
            );
            
            if (result.success) {
                // Store query for learning and follow-up
                this.scheduleQueries.push({
                    id: uuidv4(),
                    query,
                    result,
                    context,
                    timestamp: new Date().toISOString(),
                    memberName: this.memberName
                });
                
                // Keep only last 50 queries
                if (this.scheduleQueries.length > 50) {
                    this.scheduleQueries = this.scheduleQueries.slice(-50);
                }
                
                this.logger.info('Schedule query processed', {
                    intent: result.intent,
                    eventsFound: result.events?.length || 0,
                    suggestions: result.suggestions?.length || 0
                });
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to process schedule query', {
                error: error.message,
                query
            });
            
            return {
                success: false,
                error: error.message,
                summary: 'Sorry, I had trouble processing your schedule request.'
            };
        }
    }

    /**
     * Get calendar overview for executive visibility
     */
    async getCalendarOverview(timeframe = 'week') {
        try {
            const overview = {
                memberName: this.memberName,
                memberRole: this.memberRole,
                timeframe,
                pendingInvites: Array.from(this.pendingInvites.values()),
                recentQueries: this.scheduleQueries.slice(-5),
                calendarMemory: this.calendarMemory.slice(-10),
                insights: [],
                metrics: {
                    pendingInvites: this.pendingInvites.size,
                    queriesHandled: this.scheduleQueries.length,
                    calendarInteractions: this.calendarMemory.length
                }
            };
            
            // Generate insights
            if (overview.pendingInvites.length > 0) {
                const conflictingInvites = overview.pendingInvites.filter(
                    invite => invite.result.conflicts?.length > 0
                );
                if (conflictingInvites.length > 0) {
                    overview.insights.push({
                        type: 'scheduling_conflicts',
                        description: `${conflictingInvites.length} pending invite(s) have scheduling conflicts`,
                        priority: 'high',
                        count: conflictingInvites.length
                    });
                }
            }
            
            if (this.scheduleQueries.length > 0) {
                const recentQueries = this.scheduleQueries.filter(
                    q => new Date() - new Date(q.timestamp) < 24 * 60 * 60 * 1000
                );
                if (recentQueries.length > 3) {
                    overview.insights.push({
                        type: 'high_calendar_activity',
                        description: `High calendar query activity: ${recentQueries.length} queries today`,
                        priority: 'medium',
                        count: recentQueries.length
                    });
                }
            }
            
            this.logger.info('Calendar overview generated', {
                pendingInvites: overview.metrics.pendingInvites,
                insights: overview.insights.length
            });
            
            return {
                success: true,
                overview
            };
            
        } catch (error) {
            this.logger.error('Failed to generate calendar overview', {
                error: error.message
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Store calendar-related information in memory
     */
    async storeCalendarMemory(memoryEntry) {
        try {
            const enhancedEntry = {
                ...memoryEntry,
                id: uuidv4(),
                memberName: this.memberName,
                memberRole: this.memberRole,
                storedAt: new Date().toISOString()
            };
            
            this.calendarMemory.push(enhancedEntry);
            
            // Keep only last 100 calendar memory entries
            if (this.calendarMemory.length > 100) {
                this.calendarMemory = this.calendarMemory.slice(-100);
            }
            
            this.logger.debug('Calendar memory stored', {
                type: memoryEntry.type,
                priority: memoryEntry.context?.priority
            });
            
        } catch (error) {
            this.logger.error('Failed to store calendar memory', {
                error: error.message
            });
        }
    }

    /**
     * Enhanced processUpdate to include calendar intelligence
     */
    async processUpdateWithCalendar(updateText, emailData = null, metadata = {}) {
        try {
            // First process the regular update
            const updateResult = await this.processUpdate(updateText, metadata);
            
            // If email data is provided, check for calendar invites
            if (emailData) {
                const calendarResult = await this.processCalendarInvite(emailData);
                
                if (calendarResult.success && calendarResult.isMeetingRelated) {
                    // Integrate calendar information into the update result
                    updateResult.calendarIntegration = {
                        hasCalendarInvite: true,
                        meetingInfo: calendarResult.meetingInfo,
                        conflicts: calendarResult.conflicts,
                        suggestions: calendarResult.suggestions,
                        requiresAttention: calendarResult.conflicts.length > 0
                    };
                    
                    // Add calendar insights to extracted data
                    if (calendarResult.insights.length > 0) {
                        updateResult.extracted.keyInsights.push(
                            ...calendarResult.insights.map(insight => `Calendar: ${insight}`)
                        );
                    }
                    
                    // Escalate if there are conflicts
                    if (calendarResult.conflicts.length > 0) {
                        updateResult.extracted.detailedAnalysis.executiveEscalation = {
                            required: true,
                            reason: 'Calendar scheduling conflicts detected',
                            priority: 'high'
                        };
                    }
                }
            }
            
            // Check if update text contains schedule-related queries
            const scheduleKeywords = ['schedule', 'meeting', 'calendar', 'available', 'free time', 'when can'];
            const hasScheduleQuery = scheduleKeywords.some(keyword =>
                updateText.toLowerCase().includes(keyword)
            );
            
            if (hasScheduleQuery) {
                const scheduleResult = await this.handleScheduleQuery(updateText, {
                    source: 'update_text',
                    updateId: updateResult.updateId
                });
                
                if (scheduleResult.success) {
                    updateResult.scheduleAssistance = {
                        intent: scheduleResult.intent,
                        summary: scheduleResult.summary,
                        suggestions: scheduleResult.suggestions,
                        events: scheduleResult.events
                    };
                }
            }
            
            return updateResult;
            
        } catch (error) {
            this.logger.error('Error in enhanced update processing', {
                error: error.message
            });
            
            // Fallback to regular processing
            return await this.processUpdate(updateText, metadata);
        }
    }

    /**
     * Get detailed analysis for the last N updates
     */
    getDetailedHistory(limit = 10) {
        return this.processingHistory
            .slice(-limit)
            .map(update => ({
                id: update.id,
                timestamp: update.timestamp,
                memberName: update.memberName,
                extractedItems: update.extracted.totalItems,
                confidence: update.extracted.detailedAnalysis?.confidence || 0.5,
                processingMethod: update.processingMethod,
                hasExecutiveEscalation: update.extracted.detailedAnalysis?.executiveEscalation?.required || false,
                sentiment: update.extracted.detailedAnalysis?.sentimentAnalysis?.overall || 'neutral',
                hasCalendarIntegration: !!update.calendarIntegration,
                hasScheduleAssistance: !!update.scheduleAssistance
            }));
    }

    /**
     * Get calendar-specific statistics
     */
    getCalendarStats() {
        return {
            memberName: this.memberName,
            pendingInvites: this.pendingInvites.size,
            totalQueries: this.scheduleQueries.length,
            memoryEntries: this.calendarMemory.length,
            recentActivity: {
                invitesThisWeek: Array.from(this.pendingInvites.values()).filter(
                    invite => new Date() - new Date(invite.timestamp) < 7 * 24 * 60 * 60 * 1000
                ).length,
                queriesThisWeek: this.scheduleQueries.filter(
                    query => new Date() - new Date(query.timestamp) < 7 * 24 * 60 * 60 * 1000
                ).length
            }
        };
    }
}

export { PersonalAssistant as EnhancedPersonalAssistant };
