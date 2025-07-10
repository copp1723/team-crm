/**
 * REAL AI PROCESSOR
 * Replaces the mock keyword-based extraction with actual AI processing
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

export class RealAIProcessor {
    constructor(config = {}) {
        this.config = {
            apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
            baseUrl: 'https://openrouter.ai/api/v1',
            defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
            timeout: 30000,
            maxRetries: 3,
            ...config
        };
        
        this.logger = logger.child({ component: 'RealAIProcessor' });
        this.stats = {
            requestsProcessed: 0,
            successfulRequests: 0,
            averageResponseTime: 0,
            lastError: null
        };
    }

    /**
     * Process team update with real AI analysis
     */
    async processTeamUpdate(memberName, updateText, memberConfig = {}) {
        const startTime = Date.now();
        
        try {
            this.logger.info('Processing team update with AI', {
                memberName,
                textLength: updateText.length
            });

            // Create context-aware prompt
            const systemPrompt = this.buildSystemPrompt(memberName, memberConfig);
            const analysisPrompt = this.buildAnalysisPrompt(updateText, memberName, memberConfig);

            // Make AI request with retries
            const response = await this.makeAIRequest(systemPrompt, analysisPrompt);
            
            // Parse and validate response
            const analysis = this.parseAIResponse(response);
            
            // Update statistics
            this.updateStats(startTime, true);
            
            this.logger.info('AI processing completed successfully', {
                memberName,
                confidence: analysis.metadata?.confidence,
                actionItems: analysis.actionItems?.length || 0,
                processingTime: Date.now() - startTime
            });

            return {
                success: true,
                processingTime: (Date.now() - startTime) / 1000,
                analysis,
                metadata: {
                    modelUsed: this.config.defaultModel,
                    timestamp: new Date().toISOString(),
                    processingVersion: '2.0.0'
                }
            };

        } catch (error) {
            this.updateStats(startTime, false, error);
            this.logger.error('AI processing failed', { error, memberName });
            
            // Return graceful fallback
            return this.createFallbackResponse(memberName, updateText, error);
        }
    }

    /**
     * Build system prompt for AI context
     */
    buildSystemPrompt(memberName, memberConfig) {
        const role = memberConfig.role || 'Team Member';
        const focusAreas = memberConfig.focus_areas || [];
        
        return `Hey, I need your help with something. You know how we're always trying to keep track of what everyone's working on? Well, ${memberName} just dropped an update and I could use your sharp eye to catch the important stuff.

Quick background - ${memberName} is our ${role}${focusAreas.length > 0 ? ` who mainly works on ${focusAreas.join(', ')}` : ''}. You know them, right?

Here's what I'm looking for when you read their update:
- Any to-dos that need to happen (and who's on the hook for them)
- Client situations that might need some love or extra attention
- Anything that sounds like it could blow up if we don't handle it
- Revenue stuff - both the good opportunities and the "uh oh" moments
- Things that the bosses might want to know about sooner rather than later

You're really good at reading between the lines, so trust your gut. If something feels important but you can't quite put your finger on why, just flag it anyway. And hey, if you're not totally sure about something, just let me know your confidence level - we're all just doing our best here.

Oh, one more thing - can you format your thoughts as JSON? Makes it easier for me to process. Thanks!`;
    }

    /**
     * Build analysis prompt for specific update
     */
    buildAnalysisPrompt(updateText, memberName, memberConfig) {
        return `Alright, so ${memberName} just posted this update:

"${updateText}"

Can you work your magic and help me figure out what we need to pay attention to here? I've got this template that helps me stay organized - just fill it in with what you spot:

{
  "actionItems": [
    {
      "id": "make_it_unique_somehow",
      "text": "the actual thing someone needs to do",
      "priority": 1, // 1-5, where 1 is "when you get to it" and 5 is "drop everything NOW"
      "assignee": "who's gonna handle it (leave null if it's not clear)",
      "deadline": "2025-07-15T17:00:00Z", // if they mentioned a date, otherwise null
      "confidence": 0.8, // how sure are you? 0 = wild guess, 1 = crystal clear
      "source": "quote the bit that made you think this"
    }
  ],
  "clients": [
    {
      "name": "which client are we talking about",
      "status": "active", // active (all good), at_risk (yikes), opportunity (cha-ching!), or lost (RIP)
      "dealValue": 250000, // if they mentioned dollars, otherwise null
      "riskFactors": ["anything that sounds worrying"],
      "opportunities": ["anything that sounds promising"],
      "confidence": 0.9
    }
  ],
  "priorities": [
    {
      "item": "the thing that jumped out at you",
      "urgency": "high", // low (can wait), medium (soon-ish), high (this week), critical (yesterday)
      "businessImpact": "why we should care about this",
      "confidence": 0.7
    }
  ],
  "sentimentAnalysis": {
    "overall": "positive", // positive (feeling good), neutral (just business), negative (not great), concerned (worried)
    "confidence": 0.8,
    "factors": ["what made you think they're feeling this way"]
  },
  "executiveEscalation": {
    "required": true, // should we loop in the big shots?
    "urgency": "high", // if yes, how fast?
    "reason": "what's the elevator pitch for why they should care"
  },
  "keyInsights": [
    {
      "insight": "anything interesting you noticed",
      "category": "revenue", // revenue (money stuff), operational (how we work), strategic (big picture), relationship (people stuff)
      "confidence": 0.6
    }
  ],
  "metadata": {
    "overallConfidence": 0.75, // how confident are you about this whole analysis?
    "processingNotes": "any thoughts about your analysis or things I should know"
  }
}

Look, I know this is a lot of structure, but don't stress about filling in every single thing. Just grab what actually matters from their update. And seriously, I'd rather you tell me "I'm 40% sure about this" than pretend you're certain when you're not. We're all just trying to keep the important stuff from falling through the cracks here.`;
    }

    /**
     * Make AI request with error handling and retries
     */
    async makeAIRequest(systemPrompt, userPrompt, retryCount = 0) {
        try {
            const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://team-crm-foundation.local',
                    'X-Title': 'Team CRM Foundation'
                },
                body: JSON.stringify({
                    model: this.config.defaultModel,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user', 
                            content: userPrompt
                        }
                    ],
                    max_tokens: 4000,
                    temperature: 0.3, // Lower temperature for more consistent extraction
                    top_p: 0.9
                }),
                timeout: this.config.timeout
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI API request failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid AI response format');
            }

            return data.choices[0].message.content;

        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                this.logger.warn(`AI request failed, retrying (${retryCount + 1}/${this.config.maxRetries})`, { error });
                await this.delay(1000 * (retryCount + 1)); // Exponential backoff
                return this.makeAIRequest(systemPrompt, userPrompt, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Parse and validate AI response
     */
    parseAIResponse(responseText) {
        try {
            // Clean up response text (remove any markdown formatting)
            const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const parsed = JSON.parse(cleanText);
            
            // Validate required structure
            const analysis = {
                actionItems: this.validateArray(parsed.actionItems, 'actionItems'),
                clients: this.validateArray(parsed.clients, 'clients'),
                priorities: this.validateArray(parsed.priorities, 'priorities'),
                sentimentAnalysis: parsed.sentimentAnalysis || { overall: 'neutral', confidence: 0.5 },
                executiveEscalation: parsed.executiveEscalation || { required: false },
                keyInsights: this.validateArray(parsed.keyInsights, 'keyInsights'),
                metadata: {
                    overallConfidence: parsed.metadata?.overallConfidence || 0.7,
                    processingNotes: parsed.metadata?.processingNotes || '',
                    extractedEntities: parsed.metadata?.extractedEntities || []
                }
            };

            return analysis;

        } catch (error) {
            this.logger.error('Failed to parse AI response', { error, responseText });
            throw new Error(`AI response parsing failed: ${error.message}`);
        }
    }

    /**
     * Create fallback response when AI processing fails
     */
    createFallbackResponse(memberName, updateText, error) {
        this.logger.info('Creating fallback response', { memberName });

        // Use basic keyword extraction as fallback
        const fallbackAnalysis = this.basicExtraction(updateText, memberName);

        return {
            success: false,
            fallback: true,
            processingTime: 0.1,
            analysis: fallbackAnalysis,
            error: {
                message: 'Hey, looks like our AI buddy is taking a coffee break. I did a quick scan with some basic keyword matching instead - not as thorough, but better than nothing!',
                type: 'ai_service_busy',
                fallbackUsed: true
            },
            metadata: {
                modelUsed: 'basic-keywords',
                timestamp: new Date().toISOString(),
                processingVersion: '2.0.0-fallback'
            }
        };
    }

    /**
     * Basic keyword extraction fallback
     */
    basicExtraction(text, memberName) {
        const lowerText = text.toLowerCase();
        
        const actionItems = [];
        const priorities = [];
        const clients = [];
        const keyInsights = [];

        // Basic action item detection
        if (lowerText.includes('need to') || lowerText.includes('should') || lowerText.includes('will')) {
            actionItems.push({
                id: `fallback_${Date.now()}`,
                text: 'Follow up on items mentioned in update',
                priority: 3,
                assignee: memberName,
                deadline: null,
                confidence: 0.3,
                source: 'keyword-based detection'
            });
        }

        // Basic client detection
        if (lowerText.includes('client') || lowerText.includes('customer') || lowerText.includes('corp')) {
            clients.push({
                name: 'Client (name not extracted)',
                status: 'active',
                dealValue: null,
                riskFactors: [],
                opportunities: [],
                confidence: 0.2
            });
        }

        // Basic priority detection
        if (lowerText.includes('urgent') || lowerText.includes('critical') || lowerText.includes('asap')) {
            priorities.push({
                item: 'High priority matter mentioned',
                urgency: 'high',
                businessImpact: 'Requires attention',
                confidence: 0.4
            });
        }

        return {
            actionItems,
            clients,
            priorities,
            sentimentAnalysis: { overall: 'neutral', confidence: 0.1 },
            executiveEscalation: { required: false },
            keyInsights,
            metadata: {
                overallConfidence: 0.2,
                processingNotes: 'Fallback extraction used due to AI service unavailability',
                extractedEntities: []
            }
        };
    }

    /**
     * Validate array fields from AI response
     */
    validateArray(arr, fieldName) {
        if (!Array.isArray(arr)) {
            this.logger.warn(`Invalid ${fieldName} field in AI response`, { arr });
            return [];
        }
        return arr;
    }

    /**
     * Update processing statistics
     */
    updateStats(startTime, success, error = null) {
        this.stats.requestsProcessed++;
        
        if (success) {
            this.stats.successfulRequests++;
        } else {
            this.stats.lastError = {
                timestamp: new Date().toISOString(),
                message: error?.message || 'Unknown error'
            };
        }

        const responseTime = Date.now() - startTime;
        this.stats.averageResponseTime = 
            (this.stats.averageResponseTime * (this.stats.requestsProcessed - 1) + responseTime) / 
            this.stats.requestsProcessed;
    }

    /**
     * Get processor statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.requestsProcessed > 0 ? 
                this.stats.successfulRequests / this.stats.requestsProcessed : 0,
            isHealthy: this.stats.successfulRequests > 0 || this.stats.requestsProcessed === 0
        };
    }

    /**
     * Simple delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
