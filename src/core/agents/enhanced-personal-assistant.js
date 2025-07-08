/**
 * Enhanced Personal Assistant with Improved Stability and Intelligence
 * Hardened version with retry logic, better prompts, and graceful degradation
 */

import { v4 as uuidv4 } from 'uuid';
import { AIRetryHandler } from '../../utils/ai-retry-handler.js';

export class EnhancedPersonalAssistant {
    constructor(teamMember, aiProvider, memorySystem) {
        this.id = `assistant-${teamMember.id}`;
        this.teamMember = teamMember;
        this.aiProvider = aiProvider;
        this.memory = memorySystem;
        this.learningHistory = [];
        this.retryHandler = new AIRetryHandler({
            maxRetries: 3,
            timeout: 30000
        });
        
        // Cache for recent extractions to improve consistency
        this.extractionCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async processUpdate(rawUpdate, context = {}) {
        const updateId = uuidv4();
        const timestamp = new Date().toISOString();
        
        try {
            // Input validation
            if (!rawUpdate || typeof rawUpdate !== 'string' || rawUpdate.trim().length === 0) {
                throw new Error('Invalid update: empty or non-string input');
            }
            
            // Sanitize input
            const sanitizedUpdate = this.sanitizeInput(rawUpdate);
            
            // Extract structured information with retry logic
            const extraction = await this.extractInformationWithRetry(sanitizedUpdate);
            
            // Apply business context and learning
            const enrichedData = await this.enrichWithContext(extraction, context);
            
            // Store in memory for learning (non-blocking)
            this.storeInteractionAsync(updateId, sanitizedUpdate, enrichedData);

            return {
                id: updateId,
                timestamp,
                source: this.teamMember.name,
                raw_input: sanitizedUpdate,
                extracted_data: enrichedData,
                confidence: extraction.confidence || 0.7,
                requires_attention: this.assessUrgency(enrichedData),
                processing_status: 'success'
            };

        } catch (error) {
            console.error(`Enhanced Personal Assistant Error (${this.teamMember.name}):`, error);
            
            // Return graceful degradation response
            return this.createGracefulResponse(updateId, timestamp, rawUpdate, error);
        }
    }

    async extractInformationWithRetry(sanitizedUpdate) {
        // Check cache first
        const cacheKey = this.generateCacheKey(sanitizedUpdate);
        const cached = this.extractionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        
        try {
            const extraction = await this.retryHandler.executeWithRetry(
                async () => this.extractInformation(sanitizedUpdate),
                { context: 'information_extraction', member: this.teamMember.name }
            );
            
            // Cache successful extraction
            this.extractionCache.set(cacheKey, {
                data: extraction,
                timestamp: Date.now()
            });
            
            // Clean old cache entries
            this.cleanCache();
            
            return extraction;
        } catch (error) {
            // Fallback extraction using simple patterns
            return this.fallbackExtraction(sanitizedUpdate);
        }
    }

    async extractInformation(rawUpdate) {
        const prompt = this.buildEnhancedExtractionPrompt(rawUpdate);
        
        const response = await this.aiProvider.chat({
            model: this.teamMember.ai_model || 'claude-3-sonnet',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 1500
        });

        try {
            const parsed = JSON.parse(response.choices[0].message.content);
            return {
                ...parsed,
                confidence: this.calculateConfidence(parsed)
            };
        } catch (parseError) {
            // Handle non-JSON responses
            return this.parseNonJsonResponse(response.choices[0].message.content);
        }
    }

    buildEnhancedExtractionPrompt(rawUpdate) {
        const memberContext = this.getMemberContext();
        
        return `You are an AI assistant for ${this.teamMember.name} (${this.teamMember.role || 'Team Member'}).

Extract key information from this team update. Focus on actionable insights and important details.

Team Update: "${rawUpdate}"

${memberContext}

Extract and return a JSON object with these fields:
{
    "summary": "Brief 1-2 sentence summary",
    "priorities": ["High priority items that need attention"],
    "action_items": [{"action": "What needs to be done", "owner": "Who should do it", "deadline": "When if mentioned"}],
    "key_metrics": [{"metric": "Name", "value": "Value", "context": "Why it matters"}],
    "entities": {
        "people": ["Names of people mentioned"],
        "companies": ["Company/client names"],
        "projects": ["Project names"],
        "deadlines": ["Specific dates or timeframes"]
    },
    "sentiment": "positive/neutral/negative/urgent",
    "follow_up_needed": true/false,
    "tags": ["Relevant tags for categorization"]
}

Important:
- Extract dollar amounts and percentages as metrics
- Identify any blockers or risks
- Note any decisions that were made
- Flag items that require executive attention
- Be specific and actionable`;
    }

    getMemberContext() {
        // Customize based on team member role
        const roleContexts = {
            'Team Lead': 'Focus on client relationships, project status, and team coordination.',
            'Technical Lead': 'Focus on technical challenges, development progress, and system issues.',
            'Business Analyst': 'Focus on metrics, revenue impact, and strategic insights.',
            'Sales': 'Focus on deals, pipeline, client sentiment, and revenue opportunities.'
        };
        
        return roleContexts[this.teamMember.role] || 'Focus on key updates and action items.';
    }

    fallbackExtraction(rawUpdate) {
        // Simple pattern-based extraction as fallback
        const extraction = {
            summary: rawUpdate.substring(0, 200),
            priorities: [],
            action_items: [],
            key_metrics: [],
            entities: {
                people: this.extractPeople(rawUpdate),
                companies: this.extractCompanies(rawUpdate),
                projects: [],
                deadlines: this.extractDates(rawUpdate)
            },
            sentiment: this.detectSentiment(rawUpdate),
            follow_up_needed: false,
            tags: [],
            fallback_mode: true,
            confidence: 0.3
        };
        
        // Extract dollar amounts
        const dollarMatches = rawUpdate.match(/\$[\d,]+(?:\.\d{2})?[kKmM]?/g);
        if (dollarMatches) {
            extraction.key_metrics = dollarMatches.map(amount => ({
                metric: 'Revenue/Cost',
                value: amount,
                context: 'Mentioned in update'
            }));
        }
        
        return extraction;
    }

    extractPeople(text) {
        // Simple name extraction - looks for capitalized words
        const names = text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || [];
        return [...new Set(names)];
    }

    extractCompanies(text) {
        // Look for common company patterns
        const patterns = [
            /\b[A-Z][a-zA-Z]+ (?:Inc|Corp|LLC|Ltd|Company|Co)\b/g,
            /\b[A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+(?= deal| contract| client| meeting)/g
        ];
        
        const companies = [];
        patterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            companies.push(...matches);
        });
        
        return [...new Set(companies)];
    }

    extractDates(text) {
        const datePatterns = [
            /\b(?:today|tomorrow|yesterday)\b/gi,
            /\b(?:next|this|last) (?:week|month|quarter|year)\b/gi,
            /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
            /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:, \d{4})?\b/gi
        ];
        
        const dates = [];
        datePatterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            dates.push(...matches);
        });
        
        return [...new Set(dates)];
    }

    detectSentiment(text) {
        const positive = /\b(?:great|excellent|success|happy|pleased|excited|won|closed|signed)\b/gi;
        const negative = /\b(?:problem|issue|failed|lost|concerned|worried|delayed|blocked)\b/gi;
        const urgent = /\b(?:urgent|asap|immediately|critical|blocker|emergency)\b/gi;
        
        if (urgent.test(text)) return 'urgent';
        
        const posCount = (text.match(positive) || []).length;
        const negCount = (text.match(negative) || []).length;
        
        if (posCount > negCount) return 'positive';
        if (negCount > posCount) return 'negative';
        return 'neutral';
    }

    calculateConfidence(extraction) {
        let confidence = 0.5;
        
        // Increase confidence based on extracted data
        if (extraction.summary && extraction.summary.length > 20) confidence += 0.1;
        if (extraction.priorities && extraction.priorities.length > 0) confidence += 0.1;
        if (extraction.action_items && extraction.action_items.length > 0) confidence += 0.1;
        if (extraction.key_metrics && extraction.key_metrics.length > 0) confidence += 0.1;
        if (extraction.entities && Object.values(extraction.entities).some(arr => arr.length > 0)) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    async enrichWithContext(extraction, context) {
        try {
            // Get recent memory context if available
            const memoryContext = await this.getMemoryContext();
            
            return {
                ...extraction,
                context: {
                    ...context,
                    team_member: this.teamMember.name,
                    role: this.teamMember.role,
                    timestamp: new Date().toISOString(),
                    memory_context: memoryContext
                }
            };
        } catch (error) {
            // Continue without memory context
            return {
                ...extraction,
                context: {
                    ...context,
                    team_member: this.teamMember.name,
                    role: this.teamMember.role,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    async getMemoryContext() {
        if (!this.memory || !this.memory.enabled) {
            return null;
        }
        
        try {
            // Get recent relevant memories
            const recentMemories = await this.memory.getRecentInteractions(this.teamMember.id, 5);
            return {
                recent_topics: this.extractTopics(recentMemories),
                patterns: this.identifyPatterns(recentMemories)
            };
        } catch (error) {
            console.warn('Failed to retrieve memory context:', error);
            return null;
        }
    }

    extractTopics(memories) {
        // Extract common topics from recent memories
        const topics = new Map();
        
        memories.forEach(memory => {
            if (memory.extracted_data?.tags) {
                memory.extracted_data.tags.forEach(tag => {
                    topics.set(tag, (topics.get(tag) || 0) + 1);
                });
            }
        });
        
        return Array.from(topics.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([topic]) => topic);
    }

    identifyPatterns(memories) {
        // Simple pattern identification
        const patterns = [];
        
        // Check for recurring entities
        const entityCounts = {};
        memories.forEach(memory => {
            if (memory.extracted_data?.entities) {
                Object.values(memory.extracted_data.entities).flat().forEach(entity => {
                    entityCounts[entity] = (entityCounts[entity] || 0) + 1;
                });
            }
        });
        
        Object.entries(entityCounts).forEach(([entity, count]) => {
            if (count >= 2) {
                patterns.push(`Recurring mention: ${entity}`);
            }
        });
        
        return patterns;
    }

    assessUrgency(enrichedData) {
        if (enrichedData.sentiment === 'urgent') return true;
        if (enrichedData.priorities && enrichedData.priorities.length > 0) return true;
        if (enrichedData.follow_up_needed) return true;
        
        // Check for urgent keywords in action items
        const urgentActions = enrichedData.action_items?.some(item => 
            /urgent|asap|immediately|today|critical/i.test(item.action)
        );
        
        return urgentActions || false;
    }

    sanitizeInput(input) {
        // Remove potentially harmful content while preserving meaning
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove HTML-like tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .substring(0, 5000); // Limit length
    }

    generateCacheKey(input) {
        // Simple hash for cache key
        return `${this.teamMember.id}_${input.length}_${input.substring(0, 50)}`;
    }

    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.extractionCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.extractionCache.delete(key);
            }
        }
    }

    async storeInteractionAsync(updateId, sanitizedUpdate, enrichedData) {
        // Non-blocking storage
        setImmediate(async () => {
            try {
                if (this.memory && this.memory.enabled) {
                    await this.memory.storeInteraction({
                        id: updateId,
                        member_id: this.teamMember.id,
                        raw_input: sanitizedUpdate,
                        extracted_data: enrichedData,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Failed to store interaction in memory:', error);
                // Don't throw - this is non-critical
            }
        });
    }

    createGracefulResponse(updateId, timestamp, rawInput, error) {
        return {
            id: updateId,
            timestamp,
            source: this.teamMember.name,
            raw_input: rawInput,
            extracted_data: {
                summary: rawInput.substring(0, 200),
                error: error.message,
                fallback: true,
                requires_manual_review: true
            },
            confidence: 0.0,
            requires_attention: true,
            processing_status: 'degraded',
            message: 'Update recorded but AI processing temporarily unavailable'
        };
    }

    parseNonJsonResponse(content) {
        // Attempt to extract structured data from non-JSON response
        const extraction = {
            summary: '',
            priorities: [],
            action_items: [],
            key_metrics: [],
            entities: { people: [], companies: [], projects: [], deadlines: [] },
            sentiment: 'neutral',
            follow_up_needed: false,
            tags: [],
            parse_error: true
        };
        
        // Extract summary (first paragraph or sentence)
        const summaryMatch = content.match(/^(.+?)(?:\n|$)/);
        if (summaryMatch) {
            extraction.summary = summaryMatch[1].trim();
        }
        
        return extraction;
    }
}