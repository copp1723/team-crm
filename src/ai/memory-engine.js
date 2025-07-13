/**
 * Advanced Memory Engine for Team CRM
 * Provides persistent memory, context awareness, and intelligent recall
 * Inspired by Supermemory architecture for cross-session intelligence
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

export class MemoryEngine {
    constructor(config = {}) {
        this.enabled = false;
        this.logger = logger.child({ component: 'MemoryEngine' });
        
        // Check if Redis is available
        const hasRedis = process.env.REDIS_URL || process.env.REDIS_HOST || config.redisHost;
        
        this.config = {
            redisHost: config.redisHost || process.env.REDIS_HOST || 'localhost',
            redisPort: config.redisPort || process.env.REDIS_PORT || 6379,
            redisPassword: config.redisPassword || process.env.REDIS_PASSWORD,
            redisDb: config.redisDb || 2, // Separate DB for memory
            
            // Memory configuration
            maxMemoryEntries: config.maxMemoryEntries || 10000,
            defaultTTL: config.defaultTTL || 604800, // 7 days
            contextWindow: config.contextWindow || 20, // Recent items to consider
            similarityThreshold: config.similarityThreshold || 0.7,
            compressionEnabled: config.compressionEnabled !== false,
            
            // Memory types
            memoryTypes: {
                conversation: 'conv',
                teamUpdate: 'team',
                executive: 'exec',
                escalation: 'esc',
                insight: 'insight',
                pattern: 'pattern',
                relationship: 'rel',
                preference: 'pref'
            }
        };
        
        if (hasRedis) {
            this.redis = new Redis({
                host: this.config.redisHost,
                port: this.config.redisPort,
                password: this.config.redisPassword,
                db: this.config.redisDb,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
            this.enabled = true;
        } else {
            this.logger.warn('Redis not configured - Memory Engine disabled');
        }
        
        // Memory statistics
        this.stats = {
            memoriesStored: 0,
            memoriesRetrieved: 0,
            contextQueries: 0,
            similarityMatches: 0,
            compressionRatio: 0
        };
        
        // Context cache for fast access
        this.contextCache = new Map();
        this.maxCacheSize = 1000;
    }
    
    /**
     * Initialize the memory engine
     */
    async initialize() {
        if (!this.enabled) {
            this.logger.info('Memory Engine skipped - Redis not configured');
            return;
        }
        
        try {
            await this.redis.ping();
            this.logger.info('Memory Engine initialized successfully');
            
            // Load memory statistics
            await this.loadStats();
            
            // Setup maintenance tasks
            this.startMaintenanceTasks();
            
        } catch (error) {
            this.logger.error('Failed to initialize Memory Engine', { error });
            this.enabled = false;
            // Don't throw - allow app to continue without memory
        }
    }
    
    /**
     * Store a memory with context and metadata
     */
    async storeMemory(type, content, metadata = {}) {
        if (!this.enabled) {
            return { stored: false, reason: 'Memory Engine disabled' };
        }
        
        try {
            const memoryId = this.generateMemoryId(type);
            const timestamp = Date.now();
            
            const memory = {
                id: memoryId,
                type: type,
                content: content,
                metadata: {
                    timestamp,
                    source: metadata.source || 'system',
                    importance: metadata.importance || 'normal',
                    tags: metadata.tags || [],
                    relationships: metadata.relationships || [],
                    context: metadata.context || {},
                    ...metadata
                },
                compressed: false,
                accessCount: 0,
                lastAccessed: timestamp
            };
            
            // Compress content if enabled and content is large
            if (this.config.compressionEnabled && JSON.stringify(content).length > 1000) {
                memory.content = await this.compressContent(content);
                memory.compressed = true;
            }
            
            // Store in Redis with appropriate TTL
            const ttl = this.calculateTTL(memory);
            await this.redis.setex(
                `memory:${memoryId}`,
                ttl,
                JSON.stringify(memory)
            );
            
            // Update indices for fast retrieval
            await this.updateIndices(memory);
            
            // Store in context cache if important
            if (metadata.importance === 'high' || metadata.importance === 'urgent') {
                this.addToContextCache(memory);
            }
            
            this.stats.memoriesStored++;
            
            this.logger.debug('Memory stored', {
                memoryId,
                type,
                importance: metadata.importance,
                size: JSON.stringify(memory).length
            });
            
            return memoryId;
            
        } catch (error) {
            this.logger.error('Failed to store memory', { error, type });
            throw error;
        }
    }
    
    /**
     * Retrieve a specific memory by ID
     */
    async getMemory(memoryId) {
        try {
            const memoryData = await this.redis.get(`memory:${memoryId}`);
            if (!memoryData) {
                return null;
            }
            
            const memory = JSON.parse(memoryData);
            
            // Decompress if needed
            if (memory.compressed) {
                memory.content = await this.decompressContent(memory.content);
                memory.compressed = false;
            }
            
            // Update access tracking
            memory.accessCount++;
            memory.lastAccessed = Date.now();
            
            await this.redis.setex(
                `memory:${memoryId}`,
                this.calculateTTL(memory),
                JSON.stringify(memory)
            );
            
            this.stats.memoriesRetrieved++;
            
            return memory;
            
        } catch (error) {
            this.logger.error('Failed to retrieve memory', { error, memoryId });
            return null;
        }
    }
    
    /**
     * Get contextual memories based on query and filters
     */
    async getContextualMemories(query, options = {}) {
        try {
            const {
                type = null,
                limit = this.config.contextWindow,
                importance = null,
                timeRange = null,
                includeRelated = true,
                tags = []
            } = options;
            
            this.stats.contextQueries++;
            
            // Check context cache first
            const cacheKey = this.generateCacheKey(query, options);
            if (this.contextCache.has(cacheKey)) {
                return this.contextCache.get(cacheKey);
            }
            
            const memories = [];
            
            // Get recent memories by type
            let searchPattern = 'memory:*';
            if (type) {
                const typePrefix = this.config.memoryTypes[type] || type;
                searchPattern = `memory:${typePrefix}:*`;
            }
            
            const memoryKeys = await this.redis.keys(searchPattern);
            
            // Load and filter memories
            const pipeline = this.redis.pipeline();
            memoryKeys.forEach(key => {
                pipeline.get(key);
            });
            
            const results = await pipeline.exec();
            
            for (let i = 0; i < results.length; i++) {
                if (results[i][0]) continue; // Skip errors
                
                try {
                    const memory = JSON.parse(results[i][1]);
                    
                    // Apply filters
                    if (this.matchesFilters(memory, { type, importance, timeRange, tags })) {
                        // Calculate relevance score
                        const relevanceScore = await this.calculateRelevance(memory, query);
                        
                        if (relevanceScore > this.config.similarityThreshold) {
                            memory.relevanceScore = relevanceScore;
                            memories.push(memory);
                            this.stats.similarityMatches++;
                        }
                    }
                } catch (parseError) {
                    this.logger.warn('Failed to parse memory', { error: parseError });
                }
            }
            
            // Sort by relevance and recency
            memories.sort((a, b) => {
                const relevanceDiff = b.relevanceScore - a.relevanceScore;
                if (Math.abs(relevanceDiff) > 0.1) {
                    return relevanceDiff;
                }
                return b.metadata.timestamp - a.metadata.timestamp;
            });
            
            // Limit results
            const limitedMemories = memories.slice(0, limit);
            
            // Include related memories if requested
            if (includeRelated) {
                const relatedMemories = await this.getRelatedMemories(limitedMemories);
                limitedMemories.push(...relatedMemories);
            }
            
            // Cache results
            this.addToCacheWithExpiry(cacheKey, limitedMemories, 300000); // 5 minutes
            
            return limitedMemories;
            
        } catch (error) {
            this.logger.error('Failed to get contextual memories', { error, query });
            return [];
        }
    }
    
    /**
     * Store conversation context for AI responses
     */
    async storeConversationContext(memberName, message, response, metadata = {}) {
        return await this.storeMemory('conversation', {
            memberName,
            message,
            response,
            conversationId: metadata.conversationId || `conv_${Date.now()}`,
            sentiment: metadata.sentiment || 'neutral',
            intent: metadata.intent || 'unknown',
            entities: metadata.entities || []
        }, {
            source: 'conversation',
            importance: metadata.importance || 'normal',
            tags: ['conversation', memberName.toLowerCase(), ...(metadata.tags || [])],
            context: {
                sessionId: metadata.sessionId,
                previousMessages: metadata.previousMessages || [],
                userContext: metadata.userContext || {}
            }
        });
    }
    
    /**
     * Store team update insights
     */
    async storeTeamInsight(memberName, updateText, insights, metadata = {}) {
        return await this.storeMemory('teamUpdate', {
            memberName,
            updateText,
            insights,
            extractedData: metadata.extractedData || {},
            aiAnalysis: metadata.aiAnalysis || {}
        }, {
            source: 'team_update',
            importance: metadata.importance || 'normal',
            tags: ['team', memberName.toLowerCase(), 'update', ...(metadata.tags || [])],
            relationships: metadata.relationships || [],
            context: {
                updateId: metadata.updateId,
                processedAt: Date.now(),
                confidence: metadata.confidence || 0.8
            }
        });
    }
    
    /**
     * Store executive decisions and escalations
     */
    async storeExecutiveMemory(type, content, metadata = {}) {
        return await this.storeMemory('executive', {
            executiveType: type, // decision, escalation, directive, feedback
            content,
            impact: metadata.impact || 'medium',
            affectedMembers: metadata.affectedMembers || [],
            followUp: metadata.followUp || null
        }, {
            source: 'executive',
            importance: 'high',
            tags: ['executive', type, ...(metadata.tags || [])],
            context: {
                executiveId: metadata.executiveId,
                urgency: metadata.urgency || 'normal',
                decisionContext: metadata.decisionContext || {}
            }
        });
    }
    
    /**
     * Get conversation context for AI responses
     */
    async getConversationContext(memberName, limit = 10) {
        return await this.getContextualMemories(`conversation with ${memberName}`, {
            type: 'conversation',
            limit,
            tags: [memberName.toLowerCase()],
            timeRange: { hours: 24 } // Last 24 hours
        });
    }
    
    /**
     * Get team patterns and insights
     */
    async getTeamPatterns(memberName = null) {
        const query = memberName ? `team patterns for ${memberName}` : 'team patterns';
        
        return await this.getContextualMemories(query, {
            type: 'teamUpdate',
            limit: 50,
            tags: memberName ? [memberName.toLowerCase()] : ['team'],
            timeRange: { days: 30 } // Last 30 days
        });
    }
    
    /**
     * Generate intelligent follow-up suggestions
     */
    async generateFollowUpSuggestions(context, options = {}) {
        try {
            const {
                memberName,
                lastUpdate,
                conversationHistory = [],
                teamContext = {}
            } = context;
            
            const suggestions = [];
            
            // Get relevant memories for analysis
            const relevantMemories = await this.getContextualMemories(
                `follow up suggestions for ${memberName} ${lastUpdate}`,
                {
                    limit: 20,
                    tags: [memberName.toLowerCase()],
                    timeRange: { days: 7 }
                }
            );
            
            // Analyze patterns and generate suggestions
            const patterns = this.analyzePatterns(relevantMemories);
            
            // Executive attention suggestions
            if (this.requiresExecutiveAttention(patterns)) {
                suggestions.push({
                    type: 'executive_attention',
                    priority: 'high',
                    title: 'Executive Attention Required',
                    description: this.generateExecutiveAttentionReason(patterns),
                    suggestedAction: 'Schedule executive review',
                    confidence: patterns.executiveConfidence || 0.8
                });
            }
            
            // Follow-up questions
            const questions = this.generateFollowUpQuestions(lastUpdate, patterns);
            questions.forEach(question => {
                suggestions.push({
                    type: 'follow_up_question',
                    priority: 'medium',
                    title: 'Clarification Needed',
                    description: question,
                    suggestedAction: `Ask: "${question}"`,
                    confidence: 0.7
                });
            });
            
            // Resource suggestions
            const resources = this.suggestResources(patterns, teamContext);
            resources.forEach(resource => {
                suggestions.push({
                    type: 'resource_suggestion',
                    priority: 'low',
                    title: 'Resource Recommendation',
                    description: resource.description,
                    suggestedAction: resource.action,
                    confidence: resource.confidence
                });
            });
            
            // Store suggestions as memory for learning
            await this.storeMemory('insight', {
                type: 'follow_up_suggestions',
                memberName,
                suggestions,
                context: {
                    lastUpdate,
                    patternsAnalyzed: patterns.length || 0,
                    generatedAt: Date.now()
                }
            }, {
                source: 'ai_suggestions',
                importance: 'normal',
                tags: ['suggestions', 'follow_up', memberName.toLowerCase()]
            });
            
            return suggestions.sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            });
            
        } catch (error) {
            this.logger.error('Failed to generate follow-up suggestions', { error, context });
            return [];
        }
    }
    
    /**
     * Create contextual AI prompt with memory
     */
    async createContextualPrompt(userMessage, options = {}) {
        try {
            const {
                memberName,
                conversationId,
                includeTeamContext = true,
                includeExecutiveContext = false,
                maxContextLength = 3000
            } = options;
            
            let contextParts = [];
            
            // Get conversation history
            if (memberName) {
                const conversationContext = await this.getConversationContext(memberName, 5);
                if (conversationContext.length > 0) {
                    contextParts.push('Recent conversation history:');
                    conversationContext.forEach(conv => {
                        contextParts.push(`- ${conv.content.memberName}: ${conv.content.message}`);
                        contextParts.push(`- AI: ${conv.content.response}`);
                    });
                    contextParts.push('');
                }
            }
            
            // Get team context
            if (includeTeamContext) {
                const teamPatterns = await this.getTeamPatterns(memberName);
                if (teamPatterns.length > 0) {
                    contextParts.push('Relevant team context:');
                    teamPatterns.slice(0, 3).forEach(pattern => {
                        if (pattern.content.insights) {
                            contextParts.push(`- ${pattern.content.insights}`);
                        }
                    });
                    contextParts.push('');
                }
            }
            
            // Get executive context
            if (includeExecutiveContext) {
                const executiveMemories = await this.getContextualMemories(userMessage, {
                    type: 'executive',
                    limit: 3,
                    importance: 'high'
                });
                
                if (executiveMemories.length > 0) {
                    contextParts.push('Executive decisions and directives:');
                    executiveMemories.forEach(exec => {
                        contextParts.push(`- ${exec.content.executiveType}: ${exec.content.content}`);
                    });
                    contextParts.push('');
                }
            }
            
            // Truncate context if too long
            let contextText = contextParts.join('\n');
            if (contextText.length > maxContextLength) {
                contextText = contextText.substring(0, maxContextLength) + '...\n';
            }
            
            const prompt = `${contextText}Alright, so ${memberName || 'someone from the team'} just said: ${userMessage}
            
Given what we've talked about before and what's been happening with the team, how would you respond to help them out?`;
            
            return prompt;
            
        } catch (error) {
            this.logger.error('Failed to create contextual prompt', { error, userMessage });
            return userMessage; // Fallback to original message
        }
    }
    
    // Utility methods
    
    generateMemoryId(type) {
        const typePrefix = this.config.memoryTypes[type] || type.substring(0, 4);
        return `${typePrefix}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    }
    
    calculateTTL(memory) {
        const baseTime = this.config.defaultTTL;
        const importance = memory.metadata.importance;
        
        switch (importance) {
            case 'urgent':
            case 'high':
                return baseTime * 3; // Keep longer
            case 'low':
                return baseTime * 0.5; // Shorter retention
            default:
                return baseTime;
        }
    }
    
    async updateIndices(memory) {
        try {
            // Type index
            await this.redis.zadd(
                `index:type:${memory.type}`,
                memory.metadata.timestamp,
                memory.id
            );
            
            // Tag indices
            if (memory.metadata.tags) {
                for (const tag of memory.metadata.tags) {
                    await this.redis.zadd(
                        `index:tag:${tag}`,
                        memory.metadata.timestamp,
                        memory.id
                    );
                }
            }
            
            // Importance index
            await this.redis.zadd(
                `index:importance:${memory.metadata.importance}`,
                memory.metadata.timestamp,
                memory.id
            );
            
        } catch (error) {
            this.logger.warn('Failed to update indices', { error, memoryId: memory.id });
        }
    }
    
    matchesFilters(memory, filters) {
        if (filters.type && memory.type !== filters.type) {
            return false;
        }
        
        if (filters.importance && memory.metadata.importance !== filters.importance) {
            return false;
        }
        
        if (filters.timeRange) {
            const now = Date.now();
            const timeLimit = now - (filters.timeRange.hours || 0) * 3600000 
                                 - (filters.timeRange.days || 0) * 86400000;
            
            if (memory.metadata.timestamp < timeLimit) {
                return false;
            }
        }
        
        if (filters.tags && filters.tags.length > 0) {
            const memoryTags = memory.metadata.tags || [];
            const hasMatchingTag = filters.tags.some(tag => 
                memoryTags.includes(tag.toLowerCase())
            );
            if (!hasMatchingTag) {
                return false;
            }
        }
        
        return true;
    }
    
    async calculateRelevance(memory, query) {
        try {
            // Simple relevance calculation based on text similarity
            const queryLower = query.toLowerCase();
            const contentText = JSON.stringify(memory.content).toLowerCase();
            const metadataText = JSON.stringify(memory.metadata).toLowerCase();
            
            let score = 0;
            
            // Check for direct keyword matches
            const queryWords = queryLower.split(' ').filter(word => word.length > 2);
            const totalText = contentText + ' ' + metadataText;
            
            queryWords.forEach(word => {
                const matches = (totalText.match(new RegExp(word, 'g')) || []).length;
                score += matches * 0.1;
            });
            
            // Boost score for recent memories
            const age = Date.now() - memory.metadata.timestamp;
            const ageBoost = Math.max(0, 1 - (age / (7 * 24 * 3600000))); // Decay over 7 days
            score += ageBoost * 0.3;
            
            // Boost score for important memories
            const importanceBoost = {
                urgent: 0.4,
                high: 0.3,
                normal: 0.1,
                low: 0.05
            };
            score += importanceBoost[memory.metadata.importance] || 0.1;
            
            return Math.min(1, score);
            
        } catch (error) {
            this.logger.warn('Failed to calculate relevance', { error, query });
            return 0.1; // Low default score
        }
    }
    
    async getRelatedMemories(memories) {
        const related = [];
        
        for (const memory of memories.slice(0, 5)) { // Limit to prevent explosion
            if (memory.metadata.relationships) {
                for (const relationshipId of memory.metadata.relationships) {
                    const relatedMemory = await this.getMemory(relationshipId);
                    if (relatedMemory && !related.find(r => r.id === relatedMemory.id)) {
                        relatedMemory.relationshipType = 'related';
                        related.push(relatedMemory);
                    }
                }
            }
        }
        
        return related.slice(0, 10); // Limit related memories
    }
    
    addToContextCache(memory) {
        if (this.contextCache.size >= this.maxCacheSize) {
            // Remove oldest entries
            const oldestKey = this.contextCache.keys().next().value;
            this.contextCache.delete(oldestKey);
        }
        
        this.contextCache.set(memory.id, memory);
    }
    
    generateCacheKey(query, options) {
        return `cache:${Buffer.from(query + JSON.stringify(options)).toString('base64').slice(0, 32)}`;
    }
    
    addToCacheWithExpiry(key, value, ttlMs) {
        this.contextCache.set(key, value);
        setTimeout(() => {
            this.contextCache.delete(key);
        }, ttlMs);
    }
    
    // Analysis methods for follow-up suggestions
    
    analyzePatterns(memories) {
        const patterns = {
            frequency: this.analyzeFrequency(memories),
            sentiment: this.analyzeSentiment(memories),
            topics: this.analyzeTopics(memories),
            urgency: this.analyzeUrgency(memories),
            executiveConfidence: this.calculateExecutiveConfidence(memories)
        };
        
        patterns.length = memories.length;
        return patterns;
    }
    
    analyzeFrequency(memories) {
        // Analyze update frequency patterns
        if (memories.length < 2) return { trend: 'insufficient_data' };
        
        const timestamps = memories.map(m => m.metadata.timestamp).sort();
        const intervals = [];
        
        for (let i = 1; i < timestamps.length; i++) {
            intervals.push(timestamps[i] - timestamps[i-1]);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const hoursSinceLastUpdate = (Date.now() - timestamps[timestamps.length - 1]) / 3600000;
        
        return {
            avgIntervalHours: avgInterval / 3600000,
            hoursSinceLastUpdate,
            trend: hoursSinceLastUpdate > avgInterval * 2 ? 'decreasing' : 'normal'
        };
    }
    
    analyzeSentiment(memories) {
        // Simple sentiment analysis
        const sentiments = memories.map(m => m.content.sentiment || 'neutral');
        const positiveCount = sentiments.filter(s => s === 'positive').length;
        const negativeCount = sentiments.filter(s => s === 'negative').length;
        
        return {
            overall: positiveCount > negativeCount ? 'positive' : 
                    negativeCount > positiveCount ? 'negative' : 'neutral',
            positiveRatio: positiveCount / sentiments.length,
            negativeRatio: negativeCount / sentiments.length
        };
    }
    
    analyzeTopics(memories) {
        // Extract common topics/keywords
        const allText = memories.map(m => 
            JSON.stringify(m.content).toLowerCase()
        ).join(' ');
        
        const words = allText.match(/\b\w{4,}\b/g) || [];
        const wordFreq = {};
        
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
        
        const topics = Object.entries(wordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([word, freq]) => ({ word, frequency: freq }));
        
        return topics;
    }
    
    analyzeUrgency(memories) {
        const urgentCount = memories.filter(m => 
            m.metadata.importance === 'urgent' || m.metadata.importance === 'high'
        ).length;
        
        return {
            urgentRatio: urgentCount / memories.length,
            hasRecentUrgent: memories.some(m => 
                m.metadata.importance === 'urgent' && 
                (Date.now() - m.metadata.timestamp) < 86400000 // 24 hours
            )
        };
    }
    
    calculateExecutiveConfidence(memories) {
        let confidence = 0;
        
        // Check for escalation patterns
        const hasEscalations = memories.some(m => 
            m.metadata.tags && m.metadata.tags.includes('escalation')
        );
        if (hasEscalations) confidence += 0.3;
        
        // Check for high-value deals
        const hasHighValue = memories.some(m => 
            JSON.stringify(m.content).toLowerCase().includes('deal') ||
            JSON.stringify(m.content).toLowerCase().includes('contract')
        );
        if (hasHighValue) confidence += 0.2;
        
        // Check for blocked/stuck situations
        const hasBlockers = memories.some(m => 
            JSON.stringify(m.content).toLowerCase().includes('blocked') ||
            JSON.stringify(m.content).toLowerCase().includes('stuck') ||
            JSON.stringify(m.content).toLowerCase().includes('issue')
        );
        if (hasBlockers) confidence += 0.4;
        
        return Math.min(1, confidence);
    }
    
    requiresExecutiveAttention(patterns) {
        return patterns.executiveConfidence > 0.6 ||
               patterns.urgency.hasRecentUrgent ||
               patterns.frequency.trend === 'decreasing';
    }
    
    generateExecutiveAttentionReason(patterns) {
        const reasons = [];
        
        if (patterns.executiveConfidence > 0.6) {
            reasons.push('Complex decision or high-value opportunity detected');
        }
        
        if (patterns.urgency.hasRecentUrgent) {
            reasons.push('Recent urgent updates require executive review');
        }
        
        if (patterns.frequency.trend === 'decreasing') {
            reasons.push('Decreased communication frequency may indicate issues');
        }
        
        return reasons.join('. ') || 'Pattern analysis suggests executive attention needed';
    }
    
    generateFollowUpQuestions(lastUpdate, patterns) {
        const questions = [];
        
        // Questions based on sentiment
        if (patterns.sentiment.negativeRatio > 0.5) {
            questions.push('What challenges are you currently facing that I can help with?');
        }
        
        // Questions based on topics
        if (patterns.topics.some(t => t.word.includes('issue') || t.word.includes('problem'))) {
            questions.push('Do you need additional resources to resolve the current issues?');
        }
        
        // Questions based on frequency
        if (patterns.frequency.trend === 'decreasing') {
            questions.push('Is there anything preventing you from providing regular updates?');
        }
        
        // Generic follow-ups
        questions.push('What are your main priorities for the next few days?');
        questions.push('Are there any blockers I should escalate to leadership?');
        
        return questions.slice(0, 3); // Limit to 3 questions
    }
    
    suggestResources(patterns, teamContext) {
        const resources = [];
        
        // Resource suggestions based on patterns
        if (patterns.urgency.urgentRatio > 0.3) {
            resources.push({
                description: 'Consider additional team support for urgent items',
                action: 'Review resource allocation with team lead',
                confidence: 0.7
            });
        }
        
        if (patterns.topics.some(t => t.word.includes('technical'))) {
            resources.push({
                description: 'Technical expertise may be needed',
                action: 'Connect with technical team lead',
                confidence: 0.6
            });
        }
        
        return resources;
    }
    
    // Compression methods
    
    async compressContent(content) {
        try {
            // Simple compression - in production, use actual compression library
            const jsonString = JSON.stringify(content);
            // This is a placeholder - implement actual compression
            return Buffer.from(jsonString).toString('base64');
        } catch (error) {
            this.logger.warn('Compression failed', { error });
            return content;
        }
    }
    
    async decompressContent(compressedContent) {
        try {
            // Simple decompression - in production, use actual compression library
            const jsonString = Buffer.from(compressedContent, 'base64').toString();
            return JSON.parse(jsonString);
        } catch (error) {
            this.logger.warn('Decompression failed', { error });
            return compressedContent;
        }
    }
    
    // Maintenance and statistics
    
    async loadStats() {
        try {
            const statsData = await this.redis.get('memory:stats');
            if (statsData) {
                this.stats = { ...this.stats, ...JSON.parse(statsData) };
            }
        } catch (error) {
            this.logger.warn('Failed to load memory stats', { error });
        }
    }
    
    async saveStats() {
        try {
            await this.redis.setex('memory:stats', 3600, JSON.stringify(this.stats));
        } catch (error) {
            this.logger.warn('Failed to save memory stats', { error });
        }
    }
    
    startMaintenanceTasks() {
        // Save stats every 5 minutes
        setInterval(() => {
            this.saveStats();
        }, 5 * 60 * 1000);
        
        // Cleanup expired indices every hour
        setInterval(() => {
            this.cleanupIndices();
        }, 60 * 60 * 1000);
        
        this.logger.debug('Memory engine maintenance tasks started');
    }
    
    async cleanupIndices() {
        try {
            const now = Date.now();
            const cutoff = now - (this.config.defaultTTL * 1000);
            
            // Clean up type indices
            const indexKeys = await this.redis.keys('index:*');
            for (const key of indexKeys) {
                await this.redis.zremrangebyscore(key, 0, cutoff);
            }
            
            this.logger.debug('Cleaned up memory indices');
        } catch (error) {
            this.logger.warn('Failed to cleanup indices', { error });
        }
    }
    
    /**
     * Get memory engine statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.contextCache.size,
            redisStatus: this.redis.status
        };
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Memory Engine...');
            await this.saveStats();
            await this.redis.disconnect();
            this.logger.info('Memory Engine shutdown complete');
        } catch (error) {
            this.logger.error('Error during Memory Engine shutdown', { error });
        }
    }
}