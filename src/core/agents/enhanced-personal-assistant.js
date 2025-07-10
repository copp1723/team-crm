import { v4 as uuidv4 } from 'uuid';
import { RealAIProcessor } from '../../ai/real-ai-processor.js';

export class PersonalAssistant {
    constructor(memberConfig, globalConfig) {
        this.memberConfig = memberConfig;
        this.memberName = memberConfig.name;
        this.memberRole = memberConfig.role;
        this.memberKey = memberConfig.id;
        this.globalConfig = globalConfig;
        this.processingHistory = [];
        this.totalUpdatesProcessed = 0;
        
        // Initialize real AI processor
        this.aiProcessor = new RealAIProcessor({
            apiKey: globalConfig.ai?.apiKey || process.env.OPENROUTER_API_KEY,
            defaultModel: memberConfig.ai_model || globalConfig.ai?.models?.extraction || 'anthropic/claude-3-5-sonnet-20241022'
        });
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
                sentiment: update.extracted.detailedAnalysis?.sentimentAnalysis?.overall || 'neutral'
            }));
    }
}
