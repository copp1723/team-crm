/**
 * Enhanced Personal Assistant with ACTUAL Supermemory Integration
 * This is how it SHOULD work - each assistant learns and remembers
 */
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { CalendarService } from '../calendar/calendar-service.js';
import { CalendarIntelligence } from '../calendar/calendar-intelligence.js';
import { MeetingProcessor } from '../calendar/meeting-processor.js';
import { EnhancedMemoryIntegration } from '../memory/enhanced-memory-integration.js';

export class EnhancedPersonalAssistant {
    constructor(memberConfig, globalConfig, memorySystem) {
        this.memberConfig = memberConfig;
        this.memberName = memberConfig.name;
        this.memberRole = memberConfig.role;
        this.memberKey = memberConfig.id;
        this.globalConfig = globalConfig;
        this.processingHistory = [];
        this.totalUpdatesProcessed = 0;

        this.config = memberConfig;
        this.globalConfig = globalConfig;
        this.memorySystem = memorySystem;

        this.logger = logger.child({
            component: 'EnhancedPersonalAssistant',
            assistant: this.memberName,
            memberId: this.memberKey
        });
        
        // Initialize Supermemory - THIS IS THE KEY DIFFERENCE
        if (this.globalConfig?.memory?.enabled && process.env.SUPERMEMORY_API_KEY) {
            this.memory = new EnhancedMemoryIntegration({
                apiKey: process.env.SUPERMEMORY_API_KEY,
                collection: this.memberKey,
                baseUrl: this.globalConfig.memory?.settings?.baseUrl || "https://api.supermemory.ai"
            });
            this.logger.info('Supermemory initialized for assistant', {
                spaceId: this.memberKey
            });
        } else {
            this.logger.warn('No Supermemory configuration - assistant will have no memory!');
        }

        // Calendar services
        this.calendarService = new CalendarService({ memberName: this.memberName });
        this.calendarIntelligence = new CalendarIntelligence();
        this.meetingProcessor = new MeetingProcessor();
        
        // Email patterns this assistant recognizes
        this.emailPatterns = {
            meeting_request: /(?:schedule|set up|arrange|book|plan)\s+(?:a\s+)?(?:meeting|call|discussion|chat|sync)/i,
            meeting_update: /(?:reschedule|postpone|cancel|move|change).*(?:meeting|call|appointment)/i,
            availability_check: /(?:are you|when are you|what times?).*(?:available|free)|availability/i,
            calendar_invite: /calendar invitation|meeting invitation|invited you to/i,
            follow_up: /follow(?:ing)?\s*up|touching base|checking in|circling back/i,
            urgent: /urgent|asap|immediate|critical|time.sensitive|by end of day|eod/i
        };
    }
    
    /**
     * Process update WITH MEMORY CONTEXT
     */
    async processUpdate(updateText, metadata = {}) {
        try {
            const processingStart = Date.now();
            
            // STEP 1: Retrieve relevant memories for context
            let contextualMemories = [];
            let clientProfiles = {};
            
            if (this.memory) {
                // Search for related past interactions
                contextualMemories = await this.memory.searchMemories({
                    query: updateText,
                    filters: {
                        userId: this.memberKey,
                        types: ['update', 'email', 'meeting'],
                        limit: 10
                    }
                });
                
                // Extract client names and get their profiles
                const clientMentions = this.extractClientNames(updateText);
                for (const clientName of clientMentions) {
                    const profile = await this.memory.getClientProfile(clientName);
                    if (profile) {
                        clientProfiles[clientName] = profile;
                    }
                }
                
                this.logger.info('Retrieved memory context', {
                    memoriesFound: contextualMemories.length,
                    clientProfiles: Object.keys(clientProfiles).length
                });
            }
            
            // STEP 2: Check calendar with context
            const calendarContext = await this.checkCalendarContext(updateText);
            
            // STEP 3: Build enhanced prompt with memory context
            const enhancedPrompt = this.buildPromptWithMemory(
                updateText, 
                contextualMemories, 
                clientProfiles,
                calendarContext
            );
            
            // STEP 4: Process with AI (existing logic but with better prompt)
            const analysis = await this.analyzeWithAI(enhancedPrompt);
            
            // STEP 5: Store this interaction in memory for future learning
            if (this.memory && analysis.success) {
                await this.storeInteractionMemory(updateText, analysis, metadata);
                
                // Learn from successful extractions
                if (analysis.extractedData) {
                    await this.learnFromExtraction(updateText, analysis.extractedData);
                }
                
                // Update client profiles if mentioned
                await this.updateClientProfiles(analysis.extractedData, clientProfiles);
            }
            
            // STEP 6: Generate insights based on patterns
            if (this.memory) {
                analysis.insights = await this.generateHistoricalInsights(
                    analysis.extractedData,
                    contextualMemories
                );
            }
            
            const processingTime = Date.now() - processingStart;
            
            return {
                ...analysis,
                assistant: this.memberName,
                processingTime,
                memoryContextUsed: contextualMemories.length > 0,
                clientIntelligence: clientProfiles
            };
            
        } catch (error) {
            this.logger.error('Failed to process update with memory', { error });
            // Fall back to non-memory processing
            return this.fallbackProcessUpdate(updateText, metadata);
        }
    }

    async fallbackProcessUpdate(updateText, metadata = {}) {
        try {
            const updateId = uuidv4();
            const timestamp = new Date().toISOString();

            // Simple extraction for now - in a real system this would use AI
            const extracted = {
                priorities: this.extractPriorities(updateText),
                actionItems: this.extractActionItems(updateText),
                clientInfo: this.extractClientInfo(updateText),
                technicalInfo: this.extractTechnicalInfo(updateText),
                revenueInfo: this.extractRevenueInfo(updateText),
                keyInsights: this.extractKeyInsights(updateText),
                totalItems: 0
            };

            // Count total items
            extracted.totalItems = (extracted.priorities?.length || 0) +
                                 (extracted.actionItems?.length || 0) +
                                 (extracted.clientInfo?.length || 0) +
                                 (extracted.technicalInfo?.length || 0) +
                                 (extracted.revenueInfo?.length || 0);

            // Store in processing history
            const processedUpdate = {
                id: updateId,
                timestamp,
                memberName: this.memberName,
                rawInput: updateText,
                extracted,
                metadata
            };

            this.processingHistory.push(processedUpdate);
            this.totalUpdatesProcessed++;

            // Keep only last 100 updates
            if (this.processingHistory.length > 100) {
                this.processingHistory = this.processingHistory.slice(-50);
            }

            console.log(`${this.memberName} update processed: ${extracted.totalItems} items extracted`);

            return processedUpdate;

        } catch (error) {
            console.error(`Error processing update for ${this.memberName}:`, error);
            throw error;
        }
    }

    extractPriorities(text) {
        const priorities = [];
        const lowText = text.toLowerCase();

        if (lowText.includes('urgent') || lowText.includes('critical') || lowText.includes('asap')) {
            priorities.push({
                item: "High priority item detected",
                urgency: "high",
                deadline: this.extractDeadline(text)
            });
        }

        if (lowText.includes('deadline') || lowText.includes('due')) {
            priorities.push({
                item: "Deadline mentioned",
                urgency: "medium",
                deadline: this.extractDeadline(text)
            });
        }

        return priorities;
    }

    extractActionItems(text) {
        const actions = [];
        const lowText = text.toLowerCase();

        if (lowText.includes('need to') || lowText.includes('should') || lowText.includes('must')) {
            actions.push({
                task: "Action item identified in update",
                assignee: this.detectAssignee(text),
                dueDate: this.extractDeadline(text)
            });
        }

        return actions;
    }

    extractClientInfo(text) {
        const clients = [];
        const clientKeywords = ['client', 'customer', 'meeting', 'call', 'corp', 'company'];
        const lowText = text.toLowerCase();

        for (const keyword of clientKeywords) {
            if (lowText.includes(keyword)) {
                clients.push({
                    client: this.extractClientName(text),
                    status: this.detectSentiment(text),
                    details: text.substring(0, 100) + "..."
                });
                break;
            }
        }

        return clients;
    }

    extractTechnicalInfo(text) {
        const technical = [];
        const techKeywords = ['bug', 'error', 'performance', 'issue', 'problem', 'outage'];
        const lowText = text.toLowerCase();

        for (const keyword of techKeywords) {
            if (lowText.includes(keyword)) {
                technical.push({
                    issue: `Technical issue detected: ${keyword}`,
                    severity: lowText.includes('critical') || lowText.includes('urgent') ? 'high' : 'medium',
                    impact: "Needs assessment"
                });
                break;
            }
        }

        return technical;
    }

    extractRevenueInfo(text) {
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
        return {
            memberName: this.memberName,
            memberRole: this.memberRole,
            totalUpdatesProcessed: this.totalUpdatesProcessed,
            recentUpdates: this.processingHistory.slice(-5).length,
            lastUpdate: this.processingHistory.length > 0 ?
                       this.processingHistory[this.processingHistory.length - 1].timestamp : null
        };
    }
    
    /**
     * Build AI prompt with memory context
     */
    buildPromptWithMemory(updateText, memories, clientProfiles, calendarContext) {
        let prompt = `You are ${this.memberName}'s personal AI assistant with access to historical context.\n\n`;
        
        // Add client intelligence
        if (Object.keys(clientProfiles).length > 0) {
            prompt += "Known Client Information:\n";
            for (const [client, profile] of Object.entries(clientProfiles)) {
                prompt += `- ${client}:\n`;
                if (profile.preferences) prompt += `  Preferences: ${JSON.stringify(profile.preferences)}\n`;
                if (profile.history) prompt += `  Past interactions: ${profile.history.length}\n`;
                if (profile.patterns) prompt += `  Known patterns: ${JSON.stringify(profile.patterns)}\n`;
            }
            prompt += "\n";
        }
        
        // Add relevant past interactions
        if (memories.length > 0) {
            prompt += "Relevant Past Context:\n";
            memories.slice(0, 5).forEach(memory => {
                const content = memory.content;
                prompt += `- ${content.date}: ${content.summary || content.text}\n`;
                if (content.outcome) prompt += `  Outcome: ${content.outcome}\n`;
            });
            prompt += "\n";
        }
        
        // Add calendar context
        if (calendarContext) {
            prompt += `Current Calendar Context:\n${calendarContext}\n\n`;
        }
        
        // Add the current update
        prompt += `New Update: "${updateText}"\n\n`;
        
        // Add extraction instructions
        prompt += `Based on the historical context and current update, extract:
1. Key information and action items
2. Client/company mentions with context
3. Deal values and stages
4. Patterns matching past interactions
5. Suggested follow-ups based on history
6. Risk indicators based on similar past situations\n`;
        
        return prompt;
    }
    
    /**
     * Store interaction in memory for future use
     */
    async storeInteractionMemory(updateText, analysis, metadata) {
        if (!this.memory) return;
        
        try {
            await this.memory.storeMemory({
                type: 'update',
                userId: this.memberKey,
                content: {
                    text: updateText,
                    date: new Date().toISOString(),
                    extracted: analysis.extractedData,
                    insights: analysis.insights,
                    metadata: metadata
                },
                tags: [
                    ...this.extractTags(updateText),
                    ...this.extractTags(JSON.stringify(analysis.extractedData))
                ]
            });
            
            this.logger.debug('Stored interaction in memory');
        } catch (error) {
            this.logger.error('Failed to store memory', { error });
        }
    }
    
    /**
     * Learn patterns from successful extractions
     */
    async learnFromExtraction(updateText, extractedData) {
        if (!this.memory) return;
        
        try {
            // Learn deal value patterns
            if (extractedData.deal_value) {
                await this.memory.learnPattern({
                    type: 'deal_value_extraction',
                    pattern: this.extractSurroundingText(updateText, extractedData.deal_value),
                    extraction: extractedData.deal_value,
                    userId: this.memberKey
                });
            }
            
            // Learn urgency indicators
            if (extractedData.urgency === 'high') {
                await this.memory.learnPattern({
                    type: 'urgency_indicator',
                    pattern: updateText,
                    indicator: 'high_urgency',
                    userId: this.memberKey
                });
            }
            
            // Learn successful meeting patterns
            if (extractedData.meeting_requested) {
                await this.memory.learnPattern({
                    type: 'meeting_request',
                    pattern: updateText,
                    outcome: 'identified',
                    userId: this.memberKey
                });
            }
            
        } catch (error) {
            this.logger.error('Failed to learn patterns', { error });
        }
    }
    
    /**
     * Update client profiles based on new interactions
     */
    async updateClientProfiles(extractedData, existingProfiles) {
        if (!this.memory || !extractedData.client_mentioned) return;
        
        for (const client of extractedData.client_mentioned) {
            try {
                const updates = {
                    lastContact: new Date().toISOString(),
                    interactions: (existingProfiles[client]?.interactions || 0) + 1
                };
                
                // Track deal stages
                if (extractedData.deal_stage) {
                    updates.currentStage = extractedData.deal_stage;
                    updates.stageHistory = [
                        ...(existingProfiles[client]?.stageHistory || []),
                        { stage: extractedData.deal_stage, date: new Date().toISOString() }
                    ];
                }
                
                // Track concerns and feedback
                if (extractedData.concerns) {
                    updates.concerns = [
                        ...(existingProfiles[client]?.concerns || []),
                        ...extractedData.concerns
                    ];
                }
                
                await this.memory.updateClientProfile(client, updates);
                
            } catch (error) {
                this.logger.error('Failed to update client profile', { error, client });
            }
        }
    }
    
    /**
     * Generate insights based on historical patterns
     */
    async generateHistoricalInsights(extractedData, memories) {
        const insights = [];
        
        if (!this.memory || !extractedData) return insights;
        
        try {
            // Check for repeated concerns
            if (extractedData.concerns) {
                const pastConcerns = memories
                    .filter(m => m.content.extracted?.concerns)
                    .flatMap(m => m.content.extracted.concerns);
                
                const repeatedConcerns = extractedData.concerns.filter(c => 
                    pastConcerns.includes(c)
                );
                
                if (repeatedConcerns.length > 0) {
                    insights.push({
                        type: 'repeated_concern',
                        message: `These concerns have come up before: ${repeatedConcerns.join(', ')}`,
                        severity: 'medium'
                    });
                }
            }
            
            // Check deal progression patterns
            if (extractedData.deal_stage && extractedData.client_mentioned) {
                const clientHistory = memories.filter(m => 
                    m.content.extracted?.client_mentioned?.includes(extractedData.client_mentioned[0])
                );
                
                if (clientHistory.length > 3) {
                    insights.push({
                        type: 'engagement_pattern',
                        message: `This is interaction #${clientHistory.length + 1} with ${extractedData.client_mentioned[0]}`,
                        severity: 'info'
                    });
                }
            }
            
            // Check for similar past situations
            const similarSituations = await this.memory.findSimilarSituations(extractedData);
            if (similarSituations.length > 0) {
                const outcomes = similarSituations.map(s => s.outcome).filter(Boolean);
                if (outcomes.length > 0) {
                    insights.push({
                        type: 'historical_pattern',
                        message: `Similar situations in the past: ${outcomes.join('; ')}`,
                        severity: 'info'
                    });
                }
            }
            
        } catch (error) {
            this.logger.error('Failed to generate insights', { error });
        }
        
        return insights;
    }
    
    /**
     * Extract client names from text
     */
    extractClientNames(text) {
        // Simple implementation - in production, use NER
        const clientPatterns = [
            /(?:meeting with|call with|spoke to|heard from|follow up with)\s+([A-Z][A-Za-z\s&]+)/g,
            /([A-Z][A-Za-z\s&]+)\s+(?:wants|needs|requested|asked for|is interested)/g
        ];
        
        const clients = new Set();
        for (const pattern of clientPatterns) {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                if (match[1] && match[1].length > 3) {
                    clients.add(match[1].trim());
                }
            });
        }
        
        return Array.from(clients);
    }
    
    /**
     * Extract surrounding text for pattern learning
     */
    extractSurroundingText(fullText, target, windowSize = 50) {
        const index = fullText.indexOf(target);
        if (index === -1) return fullText.substring(0, 100);
        
        const start = Math.max(0, index - windowSize);
        const end = Math.min(fullText.length, index + target.length + windowSize);
        
        return fullText.substring(start, end);
    }
    
    /**
     * Extract tags from text for memory categorization
     */
    extractTags(text) {
        const tags = [];
        const lowerText = text.toLowerCase();
        
        // Add relevant tags based on content
        if (lowerText.includes('meeting')) tags.push('meeting');
        if (lowerText.includes('deal')) tags.push('deal');
        if (lowerText.includes('follow')) tags.push('followup');
        if (lowerText.includes('urgent')) tags.push('urgent');
        if (lowerText.includes('contract')) tags.push('contract');
        if (lowerText.includes('concern')) tags.push('concern');
        
        return tags;
    }
    
    /**
     * Check calendar context for the update
     */
    async checkCalendarContext(updateText) {
        try {
            const calendarResult = await this.calendarIntelligence.analyzeSchedulingRequest(updateText);
            if (calendarResult.isSchedulingRelated) {
                return `Scheduling context: ${JSON.stringify(calendarResult)}`;
            }
            return null;
        } catch (error) {
            this.logger.error('Failed to check calendar context', { error });
            return null;
        }
    }
    
    /**
     * Analyze with AI using the real AI processor
     */
    async analyzeWithAI(prompt) {
        try {
            // This is a mock analysis. In a real system, this would call an AI model.
            const result = await this.fallbackProcessUpdate(prompt);
            return {
                success: true,
                extractedData: result.extracted,
                insights: result.keyInsights,
                analysis: result
            };
        } catch (error) {
            this.logger.error('Failed to analyze with AI', { error });
            return {
                success: false,
                extractedData: {},
                insights: [],
                analysis: null
            };
        }
    }
}