/**
 * ENHANCED MEMORY INTEGRATION
 * Copied from multi-agent-orchestrator for team CRM use case
 * 
 * Provides persistent memory capabilities for:
 * - Learning team member communication patterns
 * - Remembering client context and history
 * - Tracking project progress and patterns
 * - Cross-session learning for better extraction and summarization
 * - Executive summary history and trends
 */

import fetch from 'node-fetch';

export class EnhancedMemoryIntegration {
    constructor(config = {}) {
        this.config = {
            baseUrl: process.env.SUPERMEMORY_BASE_URL || config.baseUrl || 'https://api.supermemory.ai',
            apiKey: process.env.SUPERMEMORY_API_KEY || config.apiKey,
            collection: config.collection || 'team-crm-default',
            timeout: config.timeout || 30000,
            ...config
        };
        
        this.enabled = Boolean(this.config.apiKey);
        this.memoryCache = new Map();
        this.lastCleanup = Date.now();
        
        if (!this.enabled) {
            console.log('SuperMemory integration disabled - no API key provided');
        } else {
            console.log(`Memory integration initialized for collection: ${this.config.collection}`);
        }
    }
    
    /**
     * Store a memory for future retrieval and learning
     */
    async storeMemory(memoryId, content, metadata = {}) {
        if (!this.enabled) {
            console.log('Memory storage skipped - integration disabled');
            return false;
        }
        
        try {
            const memoryData = {
                id: memoryId,
                content: typeof content === 'string' ? content : JSON.stringify(content),
                metadata: {
                    ...metadata,
                    collection: this.config.collection,
                    timestamp: new Date().toISOString(),
                    source: 'team-crm'
                }
            };
            
            const response = await this.makeRequest('/memories', {
                method: 'POST',
                body: JSON.stringify(memoryData)
            });
            
            if (response.success) {
                // Cache locally for quick access
                this.memoryCache.set(memoryId, {
                    content,
                    metadata: memoryData.metadata,
                    storedAt: Date.now()
                });
                
                console.log(`Memory stored: ${memoryId}`);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('Error storing memory:', error);
            return false;
        }
    }
    
    /**
     * Search for relevant memories based on query
     */
    async searchRelevantMemories(query, options = {}) {
        if (!this.enabled) {
            return [];
        }
        
        try {
            const searchParams = {
                query,
                collection: this.config.collection,
                limit: options.maxResults || 10,
                minScore: options.minRelevance || 0.7,
                ...options
            };
            
            const response = await this.makeRequest('/memories/search', {
                method: 'POST',
                body: JSON.stringify(searchParams)
            });
            
            if (response.success && response.data) {
                console.log(`Found ${response.data.length} relevant memories for query: "${query.substring(0, 50)}..."`);
                return response.data.map(memory => ({
                    id: memory.id,
                    content: this.parseMemoryContent(memory.content),
                    metadata: memory.metadata || {},
                    relevanceScore: memory.score || 0
                }));
            }
            
            return [];
            
        } catch (error) {
            console.error('Error searching memories:', error);
            return [];
        }
    }
    
    /**
     * Get memories for a specific team member
     */
    async getMemberMemories(memberName, options = {}) {
        try {
            const query = `member:${memberName}`;
            const searchOptions = {
                ...options,
                filter: {
                    member: memberName,
                    ...options.filter
                }
            };
            
            return await this.searchRelevantMemories(query, searchOptions);
            
        } catch (error) {
            console.error(`Error getting memories for ${memberName}:`, error);
            return [];
        }
    }
    
    /**
     * Get executive summary history
     */
    async getExecutiveSummaryHistory(options = {}) {
        try {
            const query = 'executive summary';
            const searchOptions = {
                ...options,
                filter: {
                    type: 'executive-summary',
                    ...options.filter
                }
            };
            
            return await this.searchRelevantMemories(query, searchOptions);
            
        } catch (error) {
            console.error('Error getting executive summary history:', error);
            return [];
        }
    }
    
    /**
     * Store team update pattern for learning
     */
    async storeTeamPattern(patternId, pattern, memberName) {
        const patternData = {
            pattern,
            memberName,
            type: 'team-pattern',
            learnedAt: new Date().toISOString()
        };
        
        return await this.storeMemory(
            `pattern-${memberName}-${patternId}`,
            patternData,
            {
                type: 'pattern',
                member: memberName,
                category: 'team-communication'
            }
        );
    }
    
    /**
     * Get learned patterns for better extraction
     */
    async getLearnedPatterns(memberName = null) {
        try {
            const query = memberName ? `patterns ${memberName}` : 'patterns';
            const searchOptions = {
                maxResults: 20,
                minRelevance: 0.6,
                filter: {
                    type: 'pattern',
                    ...(memberName && { member: memberName })
                }
            };
            
            const patterns = await this.searchRelevantMemories(query, searchOptions);
            
            return patterns.map(p => ({
                memberName: p.metadata.member,
                pattern: p.content.pattern,
                confidence: p.relevanceScore,
                learnedAt: p.content.learnedAt
            }));
            
        } catch (error) {
            console.error('Error getting learned patterns:', error);
            return [];
        }
    }
    
    /**
     * Store client context for future reference
     */
    async storeClientContext(clientName, context, source) {
        const contextData = {
            clientName,
            context,
            source,
            updatedAt: new Date().toISOString()
        };
        
        return await this.storeMemory(
            `client-${clientName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            contextData,
            {
                type: 'client-context',
                client: clientName,
                source
            }
        );
    }
    
    /**
     * Get client context and history
     */
    async getClientContext(clientName) {
        try {
            const query = `client ${clientName}`;
            const searchOptions = {
                maxResults: 10,
                minRelevance: 0.5,
                filter: {
                    type: 'client-context',
                    client: clientName
                }
            };
            
            return await this.searchRelevantMemories(query, searchOptions);
            
        } catch (error) {
            console.error(`Error getting client context for ${clientName}:`, error);
            return [];
        }
    }
    
    /**
     * Learn from successful extractions to improve future performance
     */
    async learnFromExtraction(memberName, originalText, extractedInfo, confidence) {
        if (confidence < 0.7) {
            return; // Don't learn from low-confidence extractions
        }
        
        const learningData = {
            memberName,
            originalText: originalText.substring(0, 500), // Limit length
            extractedInfo,
            confidence,
            extractionPatterns: this.analyzeExtractionPatterns(originalText, extractedInfo),
            learnedAt: new Date().toISOString()
        };
        
        return await this.storeMemory(
            `extraction-learning-${memberName}-${Date.now()}`,
            learningData,
            {
                type: 'extraction-learning',
                member: memberName,
                confidence
            }
        );
    }
    
    /**
     * Analyze patterns in successful extractions
     */
    analyzeExtractionPatterns(text, extracted) {
        const patterns = [];
        
        // Analyze priority detection patterns
        if (extracted.priorities && extracted.priorities.length > 0) {
            patterns.push({
                type: 'priority-detection',
                indicators: this.extractKeyPhrases(text, ['priority', 'urgent', 'important', 'critical'])
            });
        }
        
        // Analyze action item patterns
        if (extracted.actionItems && extracted.actionItems.length > 0) {
            patterns.push({
                type: 'action-detection',
                indicators: this.extractKeyPhrases(text, ['todo', 'action', 'need to', 'should', 'must'])
            });
        }
        
        // Analyze client mention patterns
        if (extracted.clientInfo && extracted.clientInfo.length > 0) {
            patterns.push({
                type: 'client-detection',
                indicators: this.extractKeyPhrases(text, ['client', 'customer', 'meeting', 'call'])
            });
        }
        
        return patterns;
    }
    
    /**
     * Extract key phrases around specific indicators
     */
    extractKeyPhrases(text, indicators) {
        const phrases = [];
        const words = text.toLowerCase().split(/\s+/);
        
        indicators.forEach(indicator => {
            const index = words.indexOf(indicator);
            if (index !== -1) {
                const start = Math.max(0, index - 3);
                const end = Math.min(words.length, index + 4);
                phrases.push(words.slice(start, end).join(' '));
            }
        });
        
        return phrases;
    }
    
    /**
     * Get memory statistics
     */
    async getMemoryStats() {
        try {
            const response = await this.makeRequest('/memories/stats', {
                method: 'GET'
            });
            
            if (response.success) {
                return {
                    ...response.data,
                    collection: this.config.collection,
                    cacheSize: this.memoryCache.size,
                    enabled: this.enabled
                };
            }
            
            return {
                collection: this.config.collection,
                cacheSize: this.memoryCache.size,
                enabled: this.enabled,
                totalMemories: 0
            };
            
        } catch (error) {
            console.error('Error getting memory stats:', error);
            return {
                collection: this.config.collection,
                cacheSize: this.memoryCache.size,
                enabled: this.enabled,
                error: error.message
            };
        }
    }
    
    /**
     * Clean up old cached memories
     */
    cleanupCache() {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour
        
        for (const [key, memory] of this.memoryCache.entries()) {
            if (now - memory.storedAt > maxAge) {
                this.memoryCache.delete(key);
            }
        }
        
        this.lastCleanup = now;
        console.log(`Memory cache cleaned. Current size: ${this.memoryCache.size}`);
    }
    
    /**
     * Make HTTP request to SuperMemory API
     */
    async makeRequest(endpoint, options = {}) {
        if (!this.config.apiKey) {
            throw new Error('SuperMemory API key not configured');
        }
        
        const url = `${this.config.baseUrl}${endpoint}`;
        const requestOptions = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
                ...options.headers
            },
            timeout: this.config.timeout
        };
        
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Parse memory content from storage
     */
    parseMemoryContent(content) {
        try {
            return JSON.parse(content);
        } catch {
            return content; // Return as string if not JSON
        }
    }
    
    /**
     * Disable memory integration
     */
    disable() {
        this.enabled = false;
        console.log('Memory integration disabled');
    }
    
    /**
     * Enable memory integration (if API key available)
     */
    enable() {
        this.enabled = Boolean(this.config.apiKey);
        console.log(`Memory integration ${this.enabled ? 'enabled' : 'still disabled (no API key)'}`);
    }
}