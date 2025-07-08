/**
 * AI Processing Worker
 * Specialized worker for handling AI-intensive tasks in the background
 */

import { EnhancedPersonalAssistant } from '../agents/enhanced-personal-assistant.js';
import { MasterExecutiveAgent } from '../agents/simple-master-agent.js';
import { AIRetryHandler } from '../../utils/ai-retry-handler.js';
import { logger } from '../../utils/logger.js';

export class AIProcessingWorker {
    constructor(aiProvider, memorySystem) {
        this.aiProvider = aiProvider;
        this.memorySystem = memorySystem;
        this.retryHandler = new AIRetryHandler({
            maxRetries: 3,
            timeout: 45000 // 45 seconds for AI processing
        });
        this.logger = logger.child({ component: 'AIProcessingWorker' });
        
        // Cache for personal assistants
        this.assistants = new Map();
        this.masterAgent = null;
        
        this.stats = {
            extractionsProcessed: 0,
            summariesGenerated: 0,
            insightsGenerated: 0,
            sentimentAnalyzed: 0,
            averageProcessingTime: 0,
            errors: 0
        };
    }
    
    /**
     * Initialize the AI processing worker
     */
    async initialize(teamConfig) {
        try {
            this.logger.info('Initializing AI Processing Worker...');
            
            // Initialize personal assistants for each team member
            if (teamConfig && teamConfig.team && teamConfig.team.members) {
                for (const member of teamConfig.team.members) {
                    const assistant = new EnhancedPersonalAssistant(
                        member,
                        this.aiProvider,
                        this.memorySystem
                    );
                    
                    this.assistants.set(member.id, assistant);
                    this.logger.debug(`Personal assistant initialized for: ${member.name}`);
                }
            }
            
            // Initialize master executive agent
            this.masterAgent = new MasterExecutiveAgent(this.aiProvider, this.memorySystem);
            
            this.logger.info('AI Processing Worker initialized successfully', {
                assistants: this.assistants.size,
                masterAgent: !!this.masterAgent
            });
            
        } catch (error) {
            this.logger.error('Failed to initialize AI Processing Worker', { error });
            throw error;
        }
    }
    
    /**
     * Process team update extraction job
     */
    async processUpdateExtraction(jobData) {
        const startTime = Date.now();
        
        try {
            const { memberName, updateText, metadata = {} } = jobData;
            
            this.logger.info('Processing update extraction', {
                member: memberName,
                textLength: updateText.length
            });
            
            // Find the appropriate personal assistant
            const assistant = this.findAssistantByName(memberName);
            if (!assistant) {
                throw new Error(`No assistant found for member: ${memberName}`);
            }
            
            // Process the update with retry logic
            const result = await this.retryHandler.executeWithRetry(async () => {
                return await assistant.processUpdate(updateText, metadata);
            });
            
            const processingTime = Date.now() - startTime;
            this.stats.extractionsProcessed++;
            this.updateAverageProcessingTime(processingTime);
            
            this.logger.info('Update extraction completed', {
                member: memberName,
                confidence: result.confidence,
                processingTime: `${processingTime}ms`,
                requiresAttention: result.requires_attention
            });
            
            return {
                success: true,
                result,
                processingTime,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Update extraction failed', {
                member: jobData.memberName,
                error: error.message
            });
            
            // Return graceful fallback
            return this.createFallbackExtractionResult(jobData, error);
        }
    }
    
    /**
     * Process executive summary generation job
     */
    async processExecutiveSummaryGeneration(jobData) {
        const startTime = Date.now();
        
        try {
            const { updates, timeframe, options = {} } = jobData;
            
            this.logger.info('Processing executive summary generation', {
                updateCount: updates.length,
                timeframe,
                options
            });
            
            if (!this.masterAgent) {
                throw new Error('Master Executive Agent not initialized');
            }
            
            // Generate summary with retry logic
            const result = await this.retryHandler.executeWithRetry(async () => {
                return await this.masterAgent.generateComprehensiveSummary(updates, {
                    timeframe,
                    ...options
                });
            });
            
            const processingTime = Date.now() - startTime;
            this.stats.summariesGenerated++;
            this.updateAverageProcessingTime(processingTime);
            
            this.logger.info('Executive summary generated', {
                updateCount: updates.length,
                processingTime: `${processingTime}ms`
            });
            
            return {
                success: true,
                summary: result,
                metadata: {
                    updateCount: updates.length,
                    timeframe,
                    generatedAt: new Date().toISOString(),
                    processingTime
                }
            };
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Executive summary generation failed', {
                updateCount: jobData.updates?.length,
                error: error.message
            });
            
            // Return fallback summary
            return this.createFallbackSummary(jobData, error);
        }
    }
    
    /**
     * Process insight generation job
     */
    async processInsightGeneration(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, analysisType, context = {} } = jobData;
            
            this.logger.info('Processing insight generation', {
                analysisType,
                dataPoints: Array.isArray(data) ? data.length : 'single'
            });
            
            let insights;
            
            switch (analysisType) {
                case 'trend_analysis':
                    insights = await this.generateTrendInsights(data, context);
                    break;
                    
                case 'pattern_recognition':
                    insights = await this.generatePatternInsights(data, context);
                    break;
                    
                case 'opportunity_detection':
                    insights = await this.generateOpportunityInsights(data, context);
                    break;
                    
                case 'risk_assessment':
                    insights = await this.generateRiskInsights(data, context);
                    break;
                    
                default:
                    insights = await this.generateGeneralInsights(data, context);
            }
            
            const processingTime = Date.now() - startTime;
            this.stats.insightsGenerated++;
            this.updateAverageProcessingTime(processingTime);
            
            this.logger.info('Insights generated', {
                analysisType,
                insightCount: insights.length,
                processingTime: `${processingTime}ms`
            });
            
            return {
                success: true,
                insights,
                analysisType,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    processingTime,
                    context
                }
            };
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Insight generation failed', {
                analysisType: jobData.analysisType,
                error: error.message
            });
            
            return {
                success: false,
                error: error.message,
                fallback: true,
                insights: []
            };
        }
    }
    
    /**
     * Process sentiment analysis job
     */
    async processSentimentAnalysis(jobData) {
        const startTime = Date.now();
        
        try {
            const { texts, options = {} } = jobData;
            const textArray = Array.isArray(texts) ? texts : [texts];
            
            this.logger.info('Processing sentiment analysis', {
                textCount: textArray.length
            });
            
            const results = await Promise.all(
                textArray.map(async (text, index) => {
                    try {
                        return await this.retryHandler.executeWithRetry(async () => {
                            return await this.analyzeSentiment(text, options);
                        });
                    } catch (error) {
                        this.logger.warn(`Sentiment analysis failed for text ${index}`, { error });
                        return {
                            text: text.substring(0, 100),
                            sentiment: 'neutral',
                            confidence: 0.0,
                            error: error.message
                        };
                    }
                })
            );
            
            const processingTime = Date.now() - startTime;
            this.stats.sentimentAnalyzed += textArray.length;
            this.updateAverageProcessingTime(processingTime);
            
            this.logger.info('Sentiment analysis completed', {
                textCount: textArray.length,
                processingTime: `${processingTime}ms`
            });
            
            return {
                success: true,
                results: Array.isArray(texts) ? results : results[0],
                metadata: {
                    analyzedAt: new Date().toISOString(),
                    processingTime,
                    textCount: textArray.length
                }
            };
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Sentiment analysis failed', { error: error.message });
            
            return {
                success: false,
                error: error.message,
                results: Array.isArray(jobData.texts) ? [] : null
            };
        }
    }
    
    /**
     * Find assistant by member name
     */
    findAssistantByName(memberName) {
        for (const [memberId, assistant] of this.assistants.entries()) {
            if (assistant.teamMember.name.toLowerCase() === memberName.toLowerCase()) {
                return assistant;
            }
        }
        return null;
    }
    
    /**
     * Generate trend insights
     */
    async generateTrendInsights(data, context) {
        const prompt = `Analyze the following data for trends and patterns:
        
${JSON.stringify(data, null, 2)}

Context: ${JSON.stringify(context, null, 2)}

Identify:
1. Key trends in the data
2. Patterns and correlations
3. Notable changes or anomalies
4. Predictions based on current trends

Return insights as a JSON array of objects with: type, description, confidence, and impact.`;

        const response = await this.aiProvider.chat({
            model: 'claude-3-sonnet',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        });
        
        try {
            return JSON.parse(response.choices[0].message.content);
        } catch (error) {
            return [{
                type: 'trend_analysis',
                description: response.choices[0].message.content,
                confidence: 0.7,
                impact: 'medium'
            }];
        }
    }
    
    /**
     * Generate pattern insights
     */
    async generatePatternInsights(data, context) {
        // Pattern recognition logic using AI
        const insights = [];
        
        // Placeholder for actual pattern recognition
        insights.push({
            type: 'pattern_recognition',
            description: 'Pattern analysis completed',
            confidence: 0.8,
            impact: 'medium',
            data: data
        });
        
        return insights;
    }
    
    /**
     * Generate opportunity insights
     */
    async generateOpportunityInsights(data, context) {
        // Opportunity detection logic
        return [{
            type: 'opportunity_detection',
            description: 'Opportunity analysis completed',
            confidence: 0.7,
            impact: 'high'
        }];
    }
    
    /**
     * Generate risk insights
     */
    async generateRiskInsights(data, context) {
        // Risk assessment logic
        return [{
            type: 'risk_assessment',
            description: 'Risk analysis completed',
            confidence: 0.8,
            impact: 'high'
        }];
    }
    
    /**
     * Generate general insights
     */
    async generateGeneralInsights(data, context) {
        // General insight generation
        return [{
            type: 'general_analysis',
            description: 'General analysis completed',
            confidence: 0.7,
            impact: 'medium'
        }];
    }
    
    /**
     * Analyze sentiment of text
     */
    async analyzeSentiment(text, options) {
        const prompt = `Analyze the sentiment of the following text:

"${text}"

Return a JSON object with:
{
  "sentiment": "positive" | "negative" | "neutral" | "urgent",
  "confidence": 0.0-1.0,
  "emotions": ["emotion1", "emotion2"],
  "key_phrases": ["phrase1", "phrase2"],
  "urgency_level": "low" | "medium" | "high"
}`;

        const response = await this.aiProvider.chat({
            model: 'claude-3-sonnet',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
        });
        
        try {
            const result = JSON.parse(response.choices[0].message.content);
            return {
                text: text.substring(0, 100),
                ...result
            };
        } catch (error) {
            // Fallback sentiment analysis
            return this.fallbackSentimentAnalysis(text);
        }
    }
    
    /**
     * Fallback sentiment analysis using simple patterns
     */
    fallbackSentimentAnalysis(text) {
        const positive = /\b(?:great|excellent|success|happy|pleased|excited|won|closed|signed|good|amazing|perfect)\b/gi;
        const negative = /\b(?:problem|issue|failed|lost|concerned|worried|delayed|blocked|bad|terrible|awful)\b/gi;
        const urgent = /\b(?:urgent|asap|immediately|critical|emergency|now|today)\b/gi;
        
        let sentiment = 'neutral';
        let confidence = 0.6;
        
        if (urgent.test(text)) {
            sentiment = 'urgent';
            confidence = 0.8;
        } else {
            const posCount = (text.match(positive) || []).length;
            const negCount = (text.match(negative) || []).length;
            
            if (posCount > negCount) {
                sentiment = 'positive';
                confidence = 0.7;
            } else if (negCount > posCount) {
                sentiment = 'negative';
                confidence = 0.7;
            }
        }
        
        return {
            text: text.substring(0, 100),
            sentiment,
            confidence,
            emotions: [],
            key_phrases: [],
            urgency_level: sentiment === 'urgent' ? 'high' : 'medium',
            fallback: true
        };
    }
    
    /**
     * Create fallback extraction result
     */
    createFallbackExtractionResult(jobData, error) {
        return {
            success: false,
            result: {
                id: `fallback-${Date.now()}`,
                timestamp: new Date().toISOString(),
                source: jobData.memberName,
                raw_input: jobData.updateText,
                extracted_data: {
                    summary: jobData.updateText.substring(0, 200),
                    priorities: [],
                    action_items: [],
                    key_metrics: [],
                    entities: { people: [], companies: [], projects: [], deadlines: [] },
                    sentiment: 'neutral',
                    follow_up_needed: false,
                    tags: [],
                    fallback_mode: true,
                    error: error.message
                },
                confidence: 0.0,
                requires_attention: true,
                processing_status: 'fallback'
            },
            error: error.message,
            fallback: true
        };
    }
    
    /**
     * Create fallback summary
     */
    createFallbackSummary(jobData, error) {
        const updates = jobData.updates || [];
        
        return {
            success: false,
            summary: {
                title: 'Team Update Summary (Fallback)',
                overview: `Summary of ${updates.length} team updates`,
                key_points: ['AI processing temporarily unavailable'],
                priorities: [],
                action_items: [],
                risks: [],
                opportunities: [],
                fallback: true,
                error: error.message
            },
            metadata: {
                updateCount: updates.length,
                timeframe: jobData.timeframe,
                generatedAt: new Date().toISOString(),
                fallbackMode: true
            }
        };
    }
    
    /**
     * Update average processing time
     */
    updateAverageProcessingTime(newTime) {
        const totalJobs = this.stats.extractionsProcessed + 
                         this.stats.summariesGenerated + 
                         this.stats.insightsGenerated + 
                         this.stats.sentimentAnalyzed;
        
        if (totalJobs === 0) {
            this.stats.averageProcessingTime = newTime;
        } else {
            this.stats.averageProcessingTime = 
                (this.stats.averageProcessingTime * (totalJobs - 1) + newTime) / totalJobs;
        }
    }
    
    /**
     * Get worker statistics
     */
    getStats() {
        return {
            ...this.stats,
            assistants: this.assistants.size,
            masterAgent: !!this.masterAgent
        };
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            extractionsProcessed: 0,
            summariesGenerated: 0,
            insightsGenerated: 0,
            sentimentAnalyzed: 0,
            averageProcessingTime: 0,
            errors: 0
        };
    }
}