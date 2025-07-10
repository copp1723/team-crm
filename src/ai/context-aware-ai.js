/**
 * Context-Aware AI Response System
 * Provides intelligent, memory-backed AI responses with context awareness
 */

import { MemoryEngine } from './memory-engine.js';
import { logger } from '../utils/logger.js';

export class ContextAwareAI {
    constructor(config = {}) {
        this.config = {
            openRouterApiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY,
            defaultModel: config.defaultModel || 'anthropic/claude-3-5-sonnet-20241022',
            maxTokens: config.maxTokens || 2000,
            temperature: config.temperature || 0.7,
            
            // Context configuration
            maxContextLength: config.maxContextLength || 4000,
            memoryContextWindow: config.memoryContextWindow || 10,
            enablePersonalization: config.enablePersonalization !== false,
            enableTeamIntelligence: config.enableTeamIntelligence !== false,
            
            // Response enhancement
            enableFollowUpSuggestions: config.enableFollowUpSuggestions !== false,
            enableEscalationDetection: config.enableEscalationDetection !== false,
            enableSentimentTracking: config.enableSentimentTracking !== false,
            
            ...config
        };
        
        this.memoryEngine = new MemoryEngine(config.memory || {});
        this.logger = logger.child({ component: 'ContextAwareAI' });
        
        // AI models configuration
        this.models = {
            conversation: 'anthropic/claude-3-5-sonnet-20241022',
            analysis: 'anthropic/claude-3-opus-20240229',
            quick: 'openai/gpt-4o-mini',
            executive: 'anthropic/claude-3-opus-20240229'
        };
        
        // Response statistics
        this.stats = {
            responsesGenerated: 0,
            contextEnhanced: 0,
            escalationsDetected: 0,
            followUpsSuggested: 0,
            averageResponseTime: 0
        };
        
        // Sentiment analysis cache
        this.sentimentCache = new Map();
        this.maxSentimentCacheSize = 1000;
    }
    
    /**
     * Initialize the context-aware AI system
     */
    async initialize() {
        try {
            await this.memoryEngine.initialize();
            
            if (this.memoryEngine.enabled) {
                this.logger.info('Context-Aware AI system initialized successfully with memory');
            } else {
                this.logger.info('Context-Aware AI system initialized without memory (Redis not available)');
            }
        } catch (error) {
            this.logger.error('Failed to initialize Context-Aware AI', { error });
            // Don't throw - allow app to continue
        }
    }
    
    /**
     * Generate context-aware response to user message
     */
    async generateResponse(message, context = {}) {
        const startTime = Date.now();
        
        try {
            const {
                memberName,
                conversationId,
                sessionId,
                isExecutive = false,
                urgency = 'normal',
                metadata = {}
            } = context;
            
            this.logger.info('Generating context-aware response', {
                memberName,
                messageLength: message.length,
                isExecutive,
                urgency
            });
            
            // Step 1: Analyze the incoming message
            const messageAnalysis = await this.analyzeMessage(message, context);
            
            // Step 2: Get relevant context from memory
            const memoryContext = await this.getRelevantContext(message, context);
            
            // Step 3: Build enhanced prompt with context
            const enhancedPrompt = await this.buildEnhancedPrompt(
                message, 
                messageAnalysis, 
                memoryContext, 
                context
            );
            
            // Step 4: Generate AI response
            const aiResponse = await this.callAIModel(enhancedPrompt, context);
            
            // Step 5: Enhance response with follow-ups and suggestions
            const enhancedResponse = await this.enhanceResponse(
                aiResponse, 
                messageAnalysis, 
                memoryContext, 
                context
            );
            
            // Step 6: Store conversation in memory
            await this.storeConversationMemory(
                message, 
                enhancedResponse, 
                messageAnalysis, 
                context
            );
            
            // Step 7: Update statistics
            this.updateStats(startTime);
            
            return enhancedResponse;
            
        } catch (error) {
            this.logger.error('Failed to generate context-aware response', { 
                error: error.message, 
                memberName: context.memberName 
            });
            
            // Fallback to simple response
            return await this.generateFallbackResponse(message, context);
        }
    }
    
    /**
     * Analyze incoming message for intent, sentiment, and entities
     */
    async analyzeMessage(message, context) {
        try {
            const analysis = {
                intent: await this.detectIntent(message),
                sentiment: await this.analyzeSentiment(message),
                entities: await this.extractEntities(message),
                urgency: await this.detectUrgency(message),
                escalationSignals: await this.detectEscalationSignals(message),
                topics: await this.extractTopics(message),
                confidence: 0.8
            };
            
            // Cache sentiment for performance
            if (this.sentimentCache.size < this.maxSentimentCacheSize) {
                this.sentimentCache.set(message.substring(0, 100), analysis.sentiment);
            }
            
            return analysis;
            
        } catch (error) {
            this.logger.warn('Message analysis failed', { error });
            return {
                intent: 'unknown',
                sentiment: 'neutral',
                entities: [],
                urgency: 'normal',
                escalationSignals: [],
                topics: [],
                confidence: 0.3
            };
        }
    }
    
    /**
     * Get relevant context from memory engine
     */
    async getRelevantContext(message, context) {
        try {
            const { memberName, conversationId } = context;
            
            const relevantContext = {
                conversation: [],
                teamHistory: [],
                executiveDecisions: [],
                patterns: {},
                relationships: []
            };
            
            // Get conversation history
            if (memberName) {
                relevantContext.conversation = await this.memoryEngine.getConversationContext(
                    memberName, 
                    this.config.memoryContextWindow
                );
            }
            
            // Get team patterns and history
            if (this.config.enableTeamIntelligence) {
                relevantContext.teamHistory = await this.memoryEngine.getTeamPatterns(memberName);
                relevantContext.patterns = this.analyzeTeamPatterns(relevantContext.teamHistory);
            }
            
            // Get executive context if needed
            if (context.isExecutive || this.requiresExecutiveContext(message)) {
                relevantContext.executiveDecisions = await this.memoryEngine.getContextualMemories(
                    message,
                    {
                        type: 'executive',
                        limit: 5,
                        importance: 'high'
                    }
                );
            }
            
            // Get relationship context
            relevantContext.relationships = await this.getRelationshipContext(memberName, message);
            
            return relevantContext;
            
        } catch (error) {
            this.logger.warn('Failed to get relevant context', { error });
            return { conversation: [], teamHistory: [], executiveDecisions: [], patterns: {}, relationships: [] };
        }
    }
    
    /**
     * Build enhanced prompt with context and memory
     */
    async buildEnhancedPrompt(message, analysis, memoryContext, context) {
        try {
            const { memberName, isExecutive } = context;
            
            let promptParts = [];
            
            // System context
            if (isExecutive) {
                promptParts.push(`Hey there! You're the go-to person for helping our executives make sense of what's happening with the team. 
                Think of yourself as that smart analyst who knows how to spot patterns and give solid advice about the big picture stuff.`);
            } else {
                promptParts.push(`Hey! You're like that super helpful colleague who remembers everything and always knows what's going on. 
                You help team members by connecting the dots between conversations and spotting patterns we might miss.`);
            }
            
            // Add conversation context
            if (memoryContext.conversation.length > 0) {
                promptParts.push('\nRECENT CONVERSATION HISTORY:');
                memoryContext.conversation.slice(-5).forEach(conv => {
                    promptParts.push(`${conv.content.memberName}: ${conv.content.message}`);
                    promptParts.push(`Assistant: ${conv.content.response}`);
                });
            }
            
            // Add team context
            if (memoryContext.teamHistory.length > 0) {
                promptParts.push('\nRELEVANT TEAM CONTEXT:');
                memoryContext.teamHistory.slice(0, 3).forEach(item => {
                    if (item.content.insights) {
                        promptParts.push(`- ${item.content.insights}`);
                    }
                });
            }
            
            // Add patterns analysis
            if (Object.keys(memoryContext.patterns).length > 0) {
                promptParts.push('\nTEAM PATTERNS ANALYSIS:');
                if (memoryContext.patterns.frequency) {
                    promptParts.push(`- Communication frequency: ${memoryContext.patterns.frequency.trend}`);
                }
                if (memoryContext.patterns.sentiment) {
                    promptParts.push(`- Sentiment trend: ${memoryContext.patterns.sentiment.overall}`);
                }
            }
            
            // Add executive context
            if (memoryContext.executiveDecisions.length > 0) {
                promptParts.push('\nRELEVANT EXECUTIVE DECISIONS:');
                memoryContext.executiveDecisions.forEach(decision => {
                    promptParts.push(`- ${decision.content.executiveType}: ${decision.content.content}`);
                });
            }
            
            // Add message analysis context
            if (analysis.intent !== 'unknown') {
                promptParts.push(`\nMESSAGE ANALYSIS:`);
                promptParts.push(`- Intent: ${analysis.intent}`);
                promptParts.push(`- Sentiment: ${analysis.sentiment}`);
                promptParts.push(`- Urgency: ${analysis.urgency}`);
                if (analysis.escalationSignals.length > 0) {
                    promptParts.push(`- Escalation signals: ${analysis.escalationSignals.join(', ')}`);
                }
            }
            
            // Add guidelines
            promptParts.push('\nHERE\'S HOW TO HELP:');
            promptParts.push('- Use what you know from the context above to be genuinely helpful');
            promptParts.push('- If something seems like it needs a manager\'s attention, don\'t be shy about saying so');
            promptParts.push('- Keep it friendly but professional - we\'re all on the same team here');
            promptParts.push('- If something\'s unclear, just ask - it\'s better than guessing');
            
            if (isExecutive) {
                promptParts.push('- Share insights that help with the big strategic calls');
                promptParts.push('- Think about how this affects the business overall - revenue, growth, that kind of thing');
            }
            
            // Current message
            promptParts.push(`\nCURRENT MESSAGE FROM ${memberName || 'TEAM MEMBER'}:`);
            promptParts.push(message);
            
            promptParts.push('\nOkay, based on all that, what\'s your take on how to respond?');
            
            const fullPrompt = promptParts.join('\n');
            
            // Truncate if too long
            if (fullPrompt.length > this.config.maxContextLength) {
                const truncated = fullPrompt.substring(0, this.config.maxContextLength);
                return truncated + '\n...\n\nPlease provide a helpful response to the current message.';
            }
            
            return fullPrompt;
            
        } catch (error) {
            this.logger.warn('Failed to build enhanced prompt', { error });
            return `Please respond to this message: ${message}`;
        }
    }
    
    /**
     * Call AI model with enhanced prompt
     */
    async callAIModel(prompt, context) {
        try {
            const { isExecutive, urgency } = context;
            
            // Select appropriate model
            let model = this.models.conversation;
            if (isExecutive) {
                model = this.models.executive;
            } else if (urgency === 'urgent') {
                model = this.models.analysis;
            }
            
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:8080',
                    'X-Title': 'Team CRM Context-Aware AI'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    temperature: this.config.temperature,
                    max_tokens: this.config.maxTokens
                })
            });
            
            if (!response.ok) {
                throw new Error(`AI API request failed: ${response.status}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content;
            
        } catch (error) {
            this.logger.error('AI model call failed', { error });
            throw error;
        }
    }
    
    /**
     * Enhance response with follow-ups and suggestions
     */
    async enhanceResponse(response, analysis, memoryContext, context) {
        try {
            const enhanced = {
                response: response,
                followUpSuggestions: [],
                escalationRecommendations: [],
                insights: [],
                confidence: analysis.confidence
            };
            
            // Generate follow-up suggestions
            if (this.config.enableFollowUpSuggestions) {
                enhanced.followUpSuggestions = await this.memoryEngine.generateFollowUpSuggestions({
                    memberName: context.memberName,
                    lastUpdate: context.message,
                    conversationHistory: memoryContext.conversation,
                    teamContext: memoryContext.patterns
                });
                
                if (enhanced.followUpSuggestions.length > 0) {
                    this.stats.followUpsSuggested++;
                }
            }
            
            // Check for escalation recommendations
            if (this.config.enableEscalationDetection && analysis.escalationSignals.length > 0) {
                enhanced.escalationRecommendations = await this.generateEscalationRecommendations(
                    analysis,
                    memoryContext,
                    context
                );
                
                if (enhanced.escalationRecommendations.length > 0) {
                    this.stats.escalationsDetected++;
                }
            }
            
            // Add insights based on patterns
            enhanced.insights = this.generateInsights(analysis, memoryContext, context);
            
            return enhanced;
            
        } catch (error) {
            this.logger.warn('Failed to enhance response', { error });
            return { response, followUpSuggestions: [], escalationRecommendations: [], insights: [] };
        }
    }
    
    /**
     * Store conversation in memory for future context
     */
    async storeConversationMemory(message, enhancedResponse, analysis, context) {
        try {
            await this.memoryEngine.storeConversationContext(
                context.memberName || 'unknown',
                message,
                enhancedResponse.response,
                {
                    conversationId: context.conversationId,
                    sessionId: context.sessionId,
                    sentiment: analysis.sentiment,
                    intent: analysis.intent,
                    entities: analysis.entities,
                    importance: analysis.urgency === 'urgent' ? 'high' : 'normal',
                    tags: ['conversation', ...(analysis.topics || [])],
                    context: {
                        followUpSuggestions: enhancedResponse.followUpSuggestions,
                        escalationRecommendations: enhancedResponse.escalationRecommendations,
                        confidence: enhancedResponse.confidence
                    }
                }
            );
            
            this.stats.contextEnhanced++;
            
        } catch (error) {
            this.logger.warn('Failed to store conversation memory', { error });
        }
    }
    
    // Analysis methods
    
    async detectIntent(message) {
        const messageLower = message.toLowerCase();
        
        // Simple intent detection - in production, use ML model
        if (messageLower.includes('help') || messageLower.includes('support')) {
            return 'help_request';
        } else if (messageLower.includes('update') || messageLower.includes('status')) {
            return 'status_update';
        } else if (messageLower.includes('question') || messageLower.includes('?')) {
            return 'question';
        } else if (messageLower.includes('issue') || messageLower.includes('problem')) {
            return 'issue_report';
        } else if (messageLower.includes('urgent') || messageLower.includes('asap')) {
            return 'urgent_request';
        } else {
            return 'general_communication';
        }
    }
    
    async analyzeSentiment(message) {
        const messageLower = message.toLowerCase();
        
        // Check cache first
        const cacheKey = message.substring(0, 100);
        if (this.sentimentCache.has(cacheKey)) {
            return this.sentimentCache.get(cacheKey);
        }
        
        // Simple sentiment analysis - in production, use ML model
        const positiveWords = ['good', 'great', 'excellent', 'success', 'completed', 'achieved', 'positive'];
        const negativeWords = ['bad', 'issue', 'problem', 'failed', 'stuck', 'blocked', 'urgent', 'concern'];
        
        const positiveCount = positiveWords.filter(word => messageLower.includes(word)).length;
        const negativeCount = negativeWords.filter(word => messageLower.includes(word)).length;
        
        let sentiment = 'neutral';
        if (positiveCount > negativeCount) {
            sentiment = 'positive';
        } else if (negativeCount > positiveCount) {
            sentiment = 'negative';
        }
        
        return sentiment;
    }
    
    async extractEntities(message) {
        // Simple entity extraction - in production, use NER model
        const entities = [];
        
        // Extract dates
        const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g;
        const dates = message.match(dateRegex) || [];
        dates.forEach(date => entities.push({ type: 'date', value: date }));
        
        // Extract numbers/amounts
        const amountRegex = /\$[\d,]+/g;
        const amounts = message.match(amountRegex) || [];
        amounts.forEach(amount => entities.push({ type: 'amount', value: amount }));
        
        // Extract emails
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emails = message.match(emailRegex) || [];
        emails.forEach(email => entities.push({ type: 'email', value: email }));
        
        return entities;
    }
    
    async detectUrgency(message) {
        const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediate', 'now', 'today'];
        const messageLower = message.toLowerCase();
        
        const urgentCount = urgentKeywords.filter(keyword => messageLower.includes(keyword)).length;
        
        if (urgentCount > 1) return 'urgent';
        if (urgentCount > 0) return 'high';
        return 'normal';
    }
    
    async detectEscalationSignals(message) {
        const escalationKeywords = [
            'escalate', 'manager', 'supervisor', 'leadership', 'executive',
            'stuck', 'blocked', 'can\'t proceed', 'need help', 'major issue',
            'client unhappy', 'deal at risk', 'losing deal'
        ];
        
        const messageLower = message.toLowerCase();
        const signals = escalationKeywords.filter(keyword => messageLower.includes(keyword));
        
        return signals;
    }
    
    async extractTopics(message) {
        // Simple topic extraction
        const topicKeywords = {
            'sales': ['deal', 'client', 'proposal', 'contract', 'revenue'],
            'technical': ['bug', 'feature', 'system', 'code', 'development'],
            'support': ['help', 'support', 'assistance', 'guidance'],
            'project': ['project', 'timeline', 'milestone', 'deadline'],
            'team': ['team', 'colleague', 'collaboration', 'meeting']
        };
        
        const messageLower = message.toLowerCase();
        const topics = [];
        
        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
            if (keywords.some(keyword => messageLower.includes(keyword))) {
                topics.push(topic);
            }
        });
        
        return topics;
    }
    
    analyzeTeamPatterns(teamHistory) {
        if (teamHistory.length === 0) return {};
        
        return {
            frequency: this.calculateUpdateFrequency(teamHistory),
            sentiment: this.calculateSentimentTrend(teamHistory),
            topics: this.extractCommonTopics(teamHistory),
            engagement: this.calculateEngagement(teamHistory)
        };
    }
    
    calculateUpdateFrequency(history) {
        if (history.length < 2) return { trend: 'insufficient_data' };
        
        const timestamps = history.map(h => h.metadata.timestamp).sort();
        const intervals = [];
        
        for (let i = 1; i < timestamps.length; i++) {
            intervals.push(timestamps[i] - timestamps[i-1]);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const recentInterval = timestamps[timestamps.length - 1] - timestamps[timestamps.length - 2];
        
        return {
            averageHours: avgInterval / 3600000,
            trend: recentInterval > avgInterval * 1.5 ? 'decreasing' : 'stable'
        };
    }
    
    calculateSentimentTrend(history) {
        const sentiments = history.map(h => h.content.sentiment || 'neutral');
        const recent = sentiments.slice(-5);
        
        const positiveCount = recent.filter(s => s === 'positive').length;
        const negativeCount = recent.filter(s => s === 'negative').length;
        
        return {
            overall: positiveCount > negativeCount ? 'positive' : 
                    negativeCount > positiveCount ? 'negative' : 'neutral',
            trend: this.calculateSentimentTrendDirection(sentiments)
        };
    }
    
    calculateSentimentTrendDirection(sentiments) {
        if (sentiments.length < 4) return 'stable';
        
        const firstHalf = sentiments.slice(0, Math.floor(sentiments.length / 2));
        const secondHalf = sentiments.slice(Math.floor(sentiments.length / 2));
        
        const firstPositive = firstHalf.filter(s => s === 'positive').length;
        const secondPositive = secondHalf.filter(s => s === 'positive').length;
        
        if (secondPositive > firstPositive) return 'improving';
        if (secondPositive < firstPositive) return 'declining';
        return 'stable';
    }
    
    extractCommonTopics(history) {
        const allTopics = [];
        history.forEach(h => {
            if (h.content.topics) {
                allTopics.push(...h.content.topics);
            }
        });
        
        const topicCount = {};
        allTopics.forEach(topic => {
            topicCount[topic] = (topicCount[topic] || 0) + 1;
        });
        
        return Object.entries(topicCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([topic, count]) => ({ topic, count }));
    }
    
    calculateEngagement(history) {
        const totalUpdates = history.length;
        const timeSpan = history.length > 1 ? 
            (history[history.length - 1].metadata.timestamp - history[0].metadata.timestamp) / 86400000 : 1;
        
        return {
            updatesPerDay: totalUpdates / timeSpan,
            totalUpdates: totalUpdates,
            level: totalUpdates / timeSpan > 1 ? 'high' : totalUpdates / timeSpan > 0.5 ? 'medium' : 'low'
        };
    }
    
    requiresExecutiveContext(message) {
        const executiveKeywords = ['executive', 'strategy', 'decision', 'escalate', 'leadership', 'critical'];
        const messageLower = message.toLowerCase();
        
        return executiveKeywords.some(keyword => messageLower.includes(keyword));
    }
    
    async getRelationshipContext(memberName, message) {
        // Get relationships between team members mentioned in message or context
        return []; // Placeholder for relationship analysis
    }
    
    async generateEscalationRecommendations(analysis, memoryContext, context) {
        const recommendations = [];
        
        if (analysis.urgency === 'urgent') {
            recommendations.push({
                type: 'immediate_escalation',
                priority: 'high',
                reason: 'Urgent request detected',
                suggestedAction: 'Notify team lead immediately',
                confidence: 0.8
            });
        }
        
        if (analysis.escalationSignals.includes('stuck') || analysis.escalationSignals.includes('blocked')) {
            recommendations.push({
                type: 'resource_escalation',
                priority: 'medium',
                reason: 'Team member reports being blocked',
                suggestedAction: 'Review resource allocation and dependencies',
                confidence: 0.7
            });
        }
        
        return recommendations;
    }
    
    generateInsights(analysis, memoryContext, context) {
        const insights = [];
        
        // Pattern-based insights
        if (memoryContext.patterns.sentiment?.trend === 'declining') {
            insights.push({
                type: 'sentiment_concern',
                message: 'Team member sentiment appears to be declining',
                confidence: 0.6
            });
        }
        
        if (memoryContext.patterns.frequency?.trend === 'decreasing') {
            insights.push({
                type: 'communication_pattern',
                message: 'Communication frequency has decreased recently',
                confidence: 0.7
            });
        }
        
        return insights;
    }
    
    async generateFallbackResponse(message, context) {
        try {
            // Simple fallback without context
            const response = await this.callAIModel(
                `Please provide a helpful response to this message: ${message}`,
                context
            );
            
            return {
                response,
                followUpSuggestions: [],
                escalationRecommendations: [],
                insights: [],
                confidence: 0.3,
                fallback: true
            };
            
        } catch (error) {
            this.logger.error('Fallback response failed', { error });
            
            return {
                response: "Ugh, sorry about this - I'm having some technical hiccups on my end. Mind trying again in a minute? If it keeps acting up, maybe give the support team a shout.",
                followUpSuggestions: [],
                escalationRecommendations: [],
                insights: [],
                confidence: 0.1,
                fallback: true,
                error: true
            };
        }
    }
    
    updateStats(startTime) {
        this.stats.responsesGenerated++;
        
        const responseTime = Date.now() - startTime;
        this.stats.averageResponseTime = 
            (this.stats.averageResponseTime * (this.stats.responsesGenerated - 1) + responseTime) / 
            this.stats.responsesGenerated;
    }
    
    /**
     * Get AI system statistics
     */
    getStats() {
        return {
            ...this.stats,
            memoryStats: this.memoryEngine.getStats(),
            sentimentCacheSize: this.sentimentCache.size
        };
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Context-Aware AI...');
            await this.memoryEngine.shutdown();
            this.logger.info('Context-Aware AI shutdown complete');
        } catch (error) {
            this.logger.error('Error during Context-Aware AI shutdown', { error });
        }
    }
}