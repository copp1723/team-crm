/**
 * PROACTIVE CONVERSATIONAL AI
 * Intelligent, anticipatory conversation partner using Supermemory
 * 
 * This system transforms reactive chat into proactive intelligence by:
 * - Suggesting relevant topics based on past conversations
 * - Predicting likely next steps and follow-ups
 * - Offering context-aware autocomplete
 * - Providing intelligent conversation starters
 * - Learning from conversation patterns
 */

import { EnhancedMemoryIntegration } from '../core/memory/enhanced-memory-integration.js';
import { logger } from '../utils/logger.js';

export class ProactiveConversationalAI {
    constructor(config = {}) {
        this.config = {
            openRouterApiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY,
            conversationModel: config.conversationModel || 'anthropic/claude-3-5-sonnet-20241022',
            quickModel: config.quickModel || 'openai/gpt-4o-mini',
            maxTokens: config.maxTokens || 1000,
            temperature: config.temperature || 0.7,
            
            // Proactive features
            enableProactiveSuggestions: config.enableProactiveSuggestions !== false,
            enableSmartAutocomplete: config.enableSmartAutocomplete !== false,
            enableContextualPrompts: config.enableContextualPrompts !== false,
            enablePatternLearning: config.enablePatternLearning !== false,
            
            // Memory configuration
            memoryContextWindow: config.memoryContextWindow || 20,
            suggestionRefreshInterval: config.suggestionRefreshInterval || 300000, // 5 minutes
            
            ...config
        };
        
        this.logger = logger.child({ component: 'ProactiveConversationalAI' });
        
        // Initialize Supermemory for each user
        this.userMemories = new Map();
        
        // Conversation state tracking
        this.conversationStates = new Map();
        this.activeTypingUsers = new Map();
        
        // Proactive suggestion cache
        this.suggestionCache = new Map();
        this.lastSuggestionRefresh = new Map();
        
        // Pattern learning
        this.conversationPatterns = {
            common_topics: new Map(),
            follow_up_patterns: new Map(),
            completion_patterns: new Map(),
            context_triggers: new Map()
        };
        
        // Statistics
        this.stats = {
            suggestionsGenerated: 0,
            autocompletionsProvided: 0,
            conversationStarters: 0,
            patternMatches: 0,
            userEngagement: new Map()
        };
    }
    
    /**
     * Initialize memory for a specific user
     */
    async initializeUserMemory(userId, memberName) {
        try {
            if (!this.userMemories.has(userId)) {
                const memory = new EnhancedMemoryIntegration({
                    apiKey: this.config.openRouterApiKey,
                    collection: `conversation-${userId}`,
                    baseUrl: process.env.SUPERMEMORY_BASE_URL || 'https://api.supermemory.ai'
                });
                
                this.userMemories.set(userId, memory);
                this.conversationStates.set(userId, {
                    memberName,
                    currentTopic: null,
                    lastActivity: Date.now(),
                    conversationContext: [],
                    pendingSuggestions: []
                });
                
                this.logger.info('Initialized proactive memory for user', { userId, memberName });
            }
            
            return this.userMemories.get(userId);
        } catch (error) {
            this.logger.error('Failed to initialize user memory', { userId, error });
            return null;
        }
    }
    
    /**
     * Generate proactive suggestions for a user
     */
    async generateProactiveSuggestions(userId, context = {}) {
        try {
            const memory = this.userMemories.get(userId);
            const state = this.conversationStates.get(userId);
            
            if (!memory || !state) {
                this.logger.warn('No memory or state found for user', { userId });
                return [];
            }
            
            // Check if we need to refresh suggestions
            const lastRefresh = this.lastSuggestionRefresh.get(userId) || 0;
            const now = Date.now();
            
            if (now - lastRefresh < this.config.suggestionRefreshInterval) {
                return this.suggestionCache.get(userId) || [];
            }
            
            // Search for recent patterns and incomplete conversations
            const recentMemories = await memory.searchRelevantMemories('', {
                filters: {
                    userId: userId,
                    timeRange: '7d',
                    types: ['conversation', 'update', 'incomplete']
                },
                maxResults: 15
            });
            
            // Generate suggestions based on patterns
            const suggestions = await this.generateSuggestionsFromMemories(recentMemories, state, context);
            
            // Cache the suggestions
            this.suggestionCache.set(userId, suggestions);
            this.lastSuggestionRefresh.set(userId, now);
            
            this.stats.suggestionsGenerated++;
            
            return suggestions;
            
        } catch (error) {
            this.logger.error('Failed to generate proactive suggestions', { userId, error });
            return [];
        }
    }
    
    /**
     * Generate suggestions from memory patterns
     */
    async generateSuggestionsFromMemories(memories, state, context) {
        try {
            const suggestions = [];
            
            // Extract patterns from memories
            const topics = new Map();
            const incompleteItems = [];
            const recentClients = new Set();
            const actionItems = [];
            
            memories.forEach(memory => {
                if (memory.metadata) {
                    // Extract topics
                    if (memory.metadata.topics) {
                        memory.metadata.topics.forEach(topic => {
                            topics.set(topic, (topics.get(topic) || 0) + 1);
                        });
                    }
                    
                    // Find incomplete conversations
                    if (memory.metadata.status === 'incomplete' || memory.metadata.followUp) {
                        incompleteItems.push(memory);
                    }
                    
                    // Extract client mentions
                    if (memory.metadata.clients) {
                        memory.metadata.clients.forEach(client => recentClients.add(client));
                    }
                    
                    // Extract action items
                    if (memory.metadata.actionItems) {
                        actionItems.push(...memory.metadata.actionItems);
                    }
                }
            });
            
            // Generate topic-based suggestions
            const topTopics = Array.from(topics.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            
            for (const [topic, frequency] of topTopics) {
                suggestions.push({
                    type: 'topic_follow_up',
                    priority: frequency > 2 ? 'high' : 'medium',
                    title: `Update on ${topic}`,
                    prompt: `How did the ${topic} situation develop?`,
                    context: `You mentioned ${topic} ${frequency} times recently`
                });
            }
            
            // Generate incomplete item suggestions
            incompleteItems.slice(0, 2).forEach(item => {
                suggestions.push({
                    type: 'incomplete_follow_up',
                    priority: 'high',
                    title: 'Follow up needed',
                    prompt: `What happened with: ${item.content.substring(0, 100)}...?`,
                    context: 'This conversation seemed incomplete',
                    originalId: item.id
                });
            });
            
            // Generate client-specific suggestions
            Array.from(recentClients).slice(0, 3).forEach(client => {
                suggestions.push({
                    type: 'client_update',
                    priority: 'medium',
                    title: `${client} update`,
                    prompt: `Any new developments with ${client}?`,
                    context: `You've been working with ${client} recently`
                });
            });
            
            // Generate action item reminders
            actionItems.slice(0, 2).forEach(action => {
                suggestions.push({
                    type: 'action_reminder',
                    priority: 'medium',
                    title: 'Action item reminder',
                    prompt: `Update on: ${action.description}`,
                    context: `Due: ${action.dueDate || 'soon'}`
                });
            });
            
            // Sort by priority and limit
            return suggestions
                .sort((a, b) => {
                    const priorityOrder = { high: 3, medium: 2, low: 1 };
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                })
                .slice(0, 6);
                
        } catch (error) {
            this.logger.error('Failed to generate suggestions from memories', { error });
            return [];
        }
    }
    
    /**
     * Provide smart autocomplete suggestions
     */
    async getSmartAutocomplete(userId, partialText, context = {}) {
        try {
            if (!this.config.enableSmartAutocomplete || partialText.length < 3) {
                return [];
            }
            
            const memory = this.userMemories.get(userId);
            if (!memory) return [];
            
            // Search for similar text patterns
            const similarMemories = await memory.searchRelevantMemories(partialText, {
                filters: {
                    userId: userId,
                    types: ['conversation', 'update']
                },
                maxResults: 10,
                minRelevance: 0.6
            });
            
            // Generate completions based on patterns
            const completions = await this.generateCompletionsFromMemories(similarMemories, partialText);
            
            this.stats.autocompletionsProvided++;
            
            return completions;
            
        } catch (error) {
            this.logger.error('Failed to get smart autocomplete', { userId, error });
            return [];
        }
    }
    
    /**
     * Generate completions from memory patterns
     */
    async generateCompletionsFromMemories(memories, partialText) {
        try {
            const completions = [];
            const patterns = new Map();
            
            // Extract completion patterns
            memories.forEach(memory => {
                const content = memory.content;
                if (typeof content === 'string') {
                    // Find similar beginnings
                    const words = partialText.toLowerCase().split(' ');
                    const lastWord = words[words.length - 1];
                    
                    if (content.toLowerCase().includes(lastWord)) {
                        // Extract potential completions
                        const sentences = content.split(/[.!?]+/);
                        sentences.forEach(sentence => {
                            if (sentence.toLowerCase().includes(lastWord)) {
                                const trimmed = sentence.trim();
                                if (trimmed.length > partialText.length) {
                                    patterns.set(trimmed, (patterns.get(trimmed) || 0) + 1);
                                }
                            }
                        });
                    }
                }
            });
            
            // Generate AI-powered completions
            if (patterns.size > 0) {
                const topPatterns = Array.from(patterns.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);
                
                for (const [pattern, frequency] of topPatterns) {
                    completions.push({
                        type: 'pattern_completion',
                        text: pattern,
                        confidence: Math.min(frequency * 0.2, 0.9),
                        reasoning: `Similar to ${frequency} previous messages`
                    });
                }
            }
            
            return completions;
            
        } catch (error) {
            this.logger.error('Failed to generate completions', { error });
            return [];
        }
    }
    
    /**
     * Generate contextual conversation starters
     */
    async generateConversationStarters(userId, context = {}) {
        try {
            const memory = this.userMemories.get(userId);
            const state = this.conversationStates.get(userId);
            
            if (!memory || !state) return [];
            
            // Get recent team activity and executive items
            const recentActivity = await memory.searchRelevantMemories('', {
                filters: {
                    types: ['team_activity', 'executive_attention'],
                    timeRange: '3d'
                },
                maxResults: 10
            });
            
            const starters = [];
            
            // Generate starters based on team activity
            if (recentActivity.length > 0) {
                starters.push({
                    type: 'team_activity',
                    title: 'Team Activity Update',
                    prompt: 'What\'s your take on the recent team developments?',
                    context: `Based on ${recentActivity.length} recent team activities`
                });
            }
            
            // Generate starters based on time patterns
            const hour = new Date().getHours();
            if (hour < 12) {
                starters.push({
                    type: 'morning_checkin',
                    title: 'Morning Check-in',
                    prompt: 'What\'s the priority focus for today?',
                    context: 'Start your day with clarity'
                });
            } else if (hour > 16) {
                starters.push({
                    type: 'end_of_day',
                    title: 'End of Day Summary',
                    prompt: 'How did today\'s priorities go?',
                    context: 'Wrap up the day with insights'
                });
            }
            
            this.stats.conversationStarters++;
            
            return starters;
            
        } catch (error) {
            this.logger.error('Failed to generate conversation starters', { userId, error });
            return [];
        }
    }
    
    /**
     * Store conversation for learning
     */
    async storeConversation(userId, message, response, metadata = {}) {
        try {
            const memory = this.userMemories.get(userId);
            if (!memory) return;
            
            const conversationId = `conv_${Date.now()}_${userId}`;
            
            await memory.storeMemory(conversationId, {
                message,
                response,
                timestamp: new Date().toISOString(),
                userId,
                ...metadata
            }, {
                type: 'conversation',
                userId,
                topics: this.extractTopics(message),
                sentiment: this.analyzeSentiment(message),
                ...metadata
            });
            
            // Update conversation state
            const state = this.conversationStates.get(userId);
            if (state) {
                state.lastActivity = Date.now();
                state.conversationContext.push({ message, response, timestamp: Date.now() });
                
                // Keep only recent context
                if (state.conversationContext.length > this.config.memoryContextWindow) {
                    state.conversationContext = state.conversationContext.slice(-this.config.memoryContextWindow);
                }
            }
            
        } catch (error) {
            this.logger.error('Failed to store conversation', { userId, error });
        }
    }
    
    /**
     * Extract topics from text
     */
    extractTopics(text) {
        // Simple topic extraction - could be enhanced with NLP
        const topics = [];
        const words = text.toLowerCase().split(/\s+/);
        
        // Look for common business topics
        const topicPatterns = {
            'client_meeting': /\b(meeting|call|discussion|presentation)\b/,
            'deal_negotiation': /\b(deal|contract|negotiation|pricing)\b/,
            'project_update': /\b(project|progress|milestone|deadline)\b/,
            'technical_issue': /\b(technical|bug|issue|problem|error)\b/,
            'competitive_intel': /\b(competitor|competitive|market|rival)\b/
        };
        
        Object.entries(topicPatterns).forEach(([topic, pattern]) => {
            if (pattern.test(text)) {
                topics.push(topic);
            }
        });
        
        return topics;
    }
    
    /**
     * Analyze sentiment of text
     */
    analyzeSentiment(text) {
        // Simple sentiment analysis - could be enhanced with AI
        const positiveWords = ['great', 'excellent', 'good', 'positive', 'success', 'win', 'opportunity'];
        const negativeWords = ['problem', 'issue', 'concern', 'delay', 'risk', 'challenge', 'difficult'];
        
        const words = text.toLowerCase().split(/\s+/);
        let positiveScore = 0;
        let negativeScore = 0;
        
        words.forEach(word => {
            if (positiveWords.includes(word)) positiveScore++;
            if (negativeWords.includes(word)) negativeScore++;
        });
        
        if (positiveScore > negativeScore) return 'positive';
        if (negativeScore > positiveScore) return 'negative';
        return 'neutral';
    }
    
    /**
     * Get user engagement statistics
     */
    getUserEngagement(userId) {
        return this.stats.userEngagement.get(userId) || {
            totalInteractions: 0,
            suggestionsUsed: 0,
            autocompletionsAccepted: 0,
            averageResponseTime: 0
        };
    }
    
    /**
     * Get system statistics
     */
    getSystemStats() {
        return {
            ...this.stats,
            activeUsers: this.conversationStates.size,
            totalMemorySpaces: this.userMemories.size,
            cacheHitRate: this.calculateCacheHitRate()
        };
    }
    
    /**
     * Calculate cache hit rate
     */
    calculateCacheHitRate() {
        const totalRequests = this.stats.suggestionsGenerated;
        const cacheHits = Array.from(this.suggestionCache.values()).length;
        return totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
    }
}