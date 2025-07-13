/**
 * AI INTELLIGENCE ENGINE
 * Implements smart context, memory, and proactive sales intelligence
 */

import { db, dbHelpers } from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

export class AIIntelligenceEngine {
    constructor(apiKey) {
        this.openai = new OpenAI({ 
            apiKey: apiKey,
            baseURL: 'https://openrouter.ai/api/v1' 
        });
        this.initialized = false;
        this.memoryCache = new Map();
        this.riskCheckInterval = null;
    }

    /**
     * Initialize the intelligence engine
     */
    async initialize() {
        try {
            console.log('🧠 Initializing AI Intelligence Engine...');
            
            // Load existing memory into cache
            await this.loadMemoryCache();
            
            // Start periodic risk detection
            this.startRiskDetection();
            
            this.initialized = true;
            console.log('✅ AI Intelligence Engine initialized');
        } catch (error) {
            console.error('❌ AI Intelligence Engine initialization failed:', error);
            throw error;
        }
    }

    /**
     * Load AI memory into cache for faster access
     */
    async loadMemoryCache() {
        try {
            const memories = await db.query(`
                SELECT * FROM ai_context_memory 
                ORDER BY last_updated DESC
            `);
            
            for (const memory of memories.rows) {
                const key = `${memory.entity_type}:${memory.entity_id}:${memory.context_type}`;
                this.memoryCache.set(key, memory);
            }
            
            console.log(`📚 Loaded ${memories.rows.length} memories into cache`);
        } catch (error) {
            console.error('Error loading memory cache:', error);
        }
    }

    /**
     * Process a team update with intelligent extraction
     */
    async processTeamUpdate(updateId, memberName, updateText) {
        try {
            // Get member context
            const memberResult = await db.query(
                'SELECT * FROM team_members WHERE external_id = $1', 
                [memberName]
            );
            const member = memberResult.rows[0];
            
            if (!member) {
                throw new Error(`Team member ${memberName} not found`);
            }

            // Get historical context for the member
            const memberContext = await this.getEntityContext('member', member.id);
            
            // Extract structured information using AI
            const extractions = await this.extractUpdateIntelligence(
                updateText, 
                member, 
                memberContext
            );
            
            // Process each extraction
            for (const extraction of extractions) {
                await this.processExtraction(updateId, member.id, extraction);
            }
            
            // Update member's AI context
            await this.updateMemberContext(member.id, updateText, extractions);
            
            // Check for follow-up suggestions
            await this.generateFollowUpSuggestions(member.id, extractions);
            
            return extractions;
        } catch (error) {
            console.error('Error processing team update:', error);
            throw error;
        }
    }

    /**
     * Extract intelligence from update text
     */
    async extractUpdateIntelligence(updateText, member, memberContext) {
        const contextSummary = memberContext
            .map(c => c.context_data.summary || '')
            .join('\n');

        const prompt = `You are an AI sales intelligence assistant analyzing a team update from ${member.name} (${member.role}).

Previous context about this team member:
${contextSummary || 'No previous context available.'}

Current update:
"${updateText}"

Extract and categorize ALL relevant information from this update about automotive dealerships and AI solutions. Return a JSON array of extractions, where each extraction has:
{
  "type": "deal_update" | "dealer_feedback" | "action_item" | "risk" | "opportunity" | "competitor_intel" | "pilot_update",
  "confidence": 0.0-1.0,
  "data": {
    // Type-specific fields
    // For deal_update: dealershipName, stage, monthlyValue, implementationFee, probability, expectedCloseDate, solutionType, notes
    // For dealer_feedback: dealershipName, sentiment, feedback, gmName, impact
    // For pilot_update: dealershipName, status, feedback, metrics, nextSteps
    // For action_item: task, assignee, dueDate, priority
    // For risk: description, severity, dealershipName, mitigation
    // For opportunity: description, potential, dealershipName, expansionType, nextSteps
    // For competitor_intel: competitor, intel, impact, source
  },
  "entities": {
    "dealerships": ["DealerName1", "DealerName2"],
    "deals": ["DealName1", "DealName2"],
    "competitors": ["CompetitorName1"],
    "brands": ["Ford", "Toyota", "etc"]
  }
}

Be thorough and extract multiple items if the update contains different pieces of information.`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: 'anthropic/claude-3-sonnet',
                messages: [
                    { role: 'system', content: 'You are a sales intelligence extraction expert. Always return valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 2000
            });

            const responseText = completion.choices[0].message.content;
            const extractions = JSON.parse(responseText);
            
            return Array.isArray(extractions) ? extractions : [extractions];
        } catch (error) {
            console.error('Error extracting intelligence:', error);
            return [];
        }
    }

    /**
     * Process a single extraction
     */
    async processExtraction(updateId, memberId, extraction) {
        try {
            // Save the extraction
            const savedExtraction = await db.query(`
                INSERT INTO update_extractions (
                    update_id, extraction_type, content, confidence_score
                ) VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [updateId, extraction.type, extraction.data, extraction.confidence]);

            const extractionId = savedExtraction.rows[0].id;

            // Process based on type
            switch (extraction.type) {
                case 'deal_update':
                    await this.processDealUpdate(extractionId, memberId, extraction);
                    break;
                case 'dealer_feedback':
                    await this.processDealerFeedback(extractionId, extraction);
                    break;
                case 'pilot_update':
                    await this.processPilotUpdate(extractionId, memberId, extraction);
                    break;
                case 'risk':
                    await this.processRisk(extractionId, memberId, extraction);
                    break;
                case 'opportunity':
                    await this.processOpportunity(extractionId, memberId, extraction);
                    break;
                case 'competitor_intel':
                    await this.processCompetitorIntel(extractionId, extraction);
                    break;
                case 'action_item':
                    await this.processActionItem(extractionId, memberId, extraction);
                    break;
            }

            // Update entity contexts
            for (const [entityType, entities] of Object.entries(extraction.entities || {})) {
                for (const entityName of entities) {
                    await this.updateEntityMention(entityType, entityName, extraction);
                }
            }
        } catch (error) {
            console.error('Error processing extraction:', error);
        }
    }

    /**
     * Process deal update extraction
     */
    async processDealUpdate(extractionId, memberId, extraction) {
        const { dealName, stage, amount, probability, expectedCloseDate, notes } = extraction.data;
        
        // Find or create deal
        let dealResult = await db.query(
            'SELECT * FROM deals WHERE name = $1 AND owner_id = $2',
            [dealName, memberId]
        );
        
        let dealId;
        if (dealResult.rows.length === 0) {
            // Create new deal
            dealId = uuidv4();
            await dbHelpers.upsertDeal({
                id: dealId,
                owner_id: memberId,
                name: dealName,
                stage: stage || 'prospect',
                amount,
                probability: probability || 0,
                expected_close_date: expectedCloseDate,
                notes
            });
        } else {
            dealId = dealResult.rows[0].id;
            const currentDeal = dealResult.rows[0];
            
            // Update existing deal and track changes
            const updates = {};
            const activities = [];
            
            if (stage && stage !== currentDeal.stage) {
                updates.stage = stage;
                activities.push({
                    type: 'stage_change',
                    old: currentDeal.stage,
                    new: stage
                });
            }
            
            if (amount && amount !== currentDeal.amount) {
                updates.amount = amount;
                activities.push({
                    type: 'amount_change',
                    old: currentDeal.amount,
                    new: amount
                });
            }
            
            if (probability !== undefined && probability !== currentDeal.probability) {
                updates.probability = probability;
                activities.push({
                    type: 'probability_change',
                    old: currentDeal.probability,
                    new: probability
                });
            }
            
            // Update deal if changes exist
            if (Object.keys(updates).length > 0) {
                await dbHelpers.upsertDeal({
                    id: dealId,
                    ...currentDeal,
                    ...updates,
                    expected_close_date: expectedCloseDate || currentDeal.expected_close_date,
                    notes: notes || currentDeal.notes
                });
                
                // Record activities
                for (const activity of activities) {
                    await dbHelpers.recordDealActivity(
                        dealId,
                        null, // updateId could be passed here
                        memberId,
                        activity.type,
                        activity.old,
                        activity.new,
                        `${activity.type.replace('_', ' ')} from ${activity.old} to ${activity.new}`
                    );
                }
            }
        }
        
        // Update extraction with deal ID
        await db.query(
            'UPDATE update_extractions SET deal_id = $1 WHERE id = $2',
            [dealId, extractionId]
        );
        
        // Update deal AI context
        await this.updateDealContext(dealId, extraction);
    }

    /**
     * Process dealer feedback
     */
    async processDealerFeedback(extractionId, extraction) {
        const { dealershipName, sentiment, feedback, gmName } = extraction.data;
        
        // Find or create dealership
        let dealerResult = await db.query(
            'SELECT * FROM dealerships WHERE name = $1',
            [dealershipName]
        );
        
        let dealershipId;
        if (dealerResult.rows.length === 0) {
            dealershipId = uuidv4();
            await db.query(`
                INSERT INTO dealerships (id, name, gm_name)
                VALUES ($1, $2, $3)
            `, [dealershipId, dealershipName, gmName || null]);
        } else {
            dealershipId = dealerResult.rows[0].id;
            // Update GM name if provided
            if (gmName) {
                await db.query(
                    'UPDATE dealerships SET gm_name = $1 WHERE id = $2',
                    [gmName, dealershipId]
                );
            }
        }
        
        // Update extraction with dealership ID
        await db.query(
            'UPDATE update_extractions SET dealership_id = $1 WHERE id = $2',
            [dealershipId, extractionId]
        );
        
        // Update dealer AI context with feedback
        await this.updateDealerContext(dealershipId, sentiment, feedback);
    }

    /**
     * Process pilot update
     */
    async processPilotUpdate(extractionId, memberId, extraction) {
        const { dealershipName, status, feedback, metrics, nextSteps } = extraction.data;
        
        // Find the deal associated with this dealership pilot
        const dealResult = await db.query(
            'SELECT d.* FROM deals d JOIN dealerships ds ON d.dealership_id = ds.id WHERE ds.name = $1 AND d.pilot_start_date IS NOT NULL',
            [dealershipName]
        );
        
        if (dealResult.rows.length > 0) {
            const deal = dealResult.rows[0];
            
            // Update deal based on pilot status
            const updates = {};
            if (status === 'success' || metrics?.includes('positive')) {
                updates.probability = Math.min(90, deal.probability + 20);
                updates.stage = 'negotiation';
            } else if (status === 'struggling') {
                updates.probability = Math.max(20, deal.probability - 10);
            }
            
            if (Object.keys(updates).length > 0) {
                await db.query(
                    'UPDATE deals SET probability = $1, stage = COALESCE($2, stage) WHERE id = $3',
                    [updates.probability, updates.stage, deal.id]
                );
            }
            
            // Create follow-up for next steps
            if (nextSteps) {
                await db.query(`
                    INSERT INTO ai_follow_ups (
                        deal_id, member_id, suggestion_text, reason, priority, suggested_date
                    ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + INTERVAL '2 days')
                `, [
                    deal.id,
                    memberId,
                    nextSteps,
                    `Pilot update action for ${dealershipName}`,
                    'high'
                ]);
            }
        }
    }

    /**
     * Process risk identification
     */
    async processRisk(extractionId, memberId, extraction) {
        const { description, severity, dealName, mitigation } = extraction.data;
        
        // If associated with a deal, find it
        if (dealName) {
            const dealResult = await db.query(
                'SELECT id FROM deals WHERE name = $1',
                [dealName]
            );
            
            if (dealResult.rows.length > 0) {
                const dealId = dealResult.rows[0].id;
                
                // Update deal priority if high risk
                if (severity === 'high' || severity === 'critical') {
                    await db.query(
                        'UPDATE deals SET priority = $1 WHERE id = $2',
                        ['high', dealId]
                    );
                }
                
                // Add to deal context
                await this.addDealRisk(dealId, description, severity, mitigation);
            }
        }
        
        // Create follow-up for risk mitigation
        if (mitigation) {
            await db.query(`
                INSERT INTO ai_follow_ups (
                    member_id, suggestion_text, reason, priority, suggested_date
                ) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '2 days')
            `, [
                memberId,
                `Risk mitigation: ${mitigation}`,
                `Identified risk: ${description}`,
                severity === 'critical' ? 'critical' : 'high'
            ]);
        }
    }

    /**
     * Process opportunity identification
     */
    async processOpportunity(extractionId, memberId, extraction) {
        const { description, potential, clientName, nextSteps } = extraction.data;
        
        // Create follow-up for opportunity
        if (nextSteps) {
            await db.query(`
                INSERT INTO ai_follow_ups (
                    member_id, suggestion_text, reason, priority, suggested_date
                ) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '3 days')
            `, [
                memberId,
                nextSteps,
                `Opportunity: ${description}`,
                potential === 'high' ? 'high' : 'medium'
            ]);
        }
    }

    /**
     * Process competitor intelligence
     */
    async processCompetitorIntel(extractionId, extraction) {
        const { competitor, intel, impact } = extraction.data;
        
        // Store in AI context for competitive analysis
        await dbHelpers.saveAIContext(
            'competitor_intel',
            'competitor',
            competitor,
            {
                latestIntel: intel,
                impact,
                timestamp: new Date().toISOString()
            },
            0.9
        );
    }

    /**
     * Process action item
     */
    async processActionItem(extractionId, memberId, extraction) {
        const { task, assignee, dueDate, priority } = extraction.data;
        
        // Find assignee if specified
        let assigneeId = memberId;
        if (assignee && assignee !== 'self') {
            const assigneeResult = await db.query(
                'SELECT id FROM team_members WHERE name ILIKE $1',
                [`%${assignee}%`]
            );
            
            if (assigneeResult.rows.length > 0) {
                assigneeId = assigneeResult.rows[0].id;
            }
        }
        
        // Create follow-up
        await db.query(`
            INSERT INTO ai_follow_ups (
                member_id, suggestion_text, reason, priority, suggested_date
            ) VALUES ($1, $2, $3, $4, $5)
        `, [
            assigneeId,
            task,
            'Action item from team update',
            priority || 'medium',
            dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Default 1 week
        ]);
    }

    /**
     * Update member context with new information
     */
    async updateMemberContext(memberId, updateText, extractions) {
        const existingContext = await this.getEntityContext('member', memberId);
        
        // Summarize recent activity
        const recentActivity = {
            lastUpdate: new Date().toISOString(),
            updateSummary: updateText.substring(0, 200),
            extractionTypes: extractions.map(e => e.type),
            dealsMentioned: extractions
                .filter(e => e.data.dealName)
                .map(e => e.data.dealName),
            clientsMentioned: extractions
                .filter(e => e.data.clientName)
                .map(e => e.data.clientName)
        };
        
        // Update context
        const contextData = existingContext.length > 0 
            ? { ...existingContext[0].context_data, recentActivity }
            : { recentActivity };
            
        await dbHelpers.saveAIContext(
            'team_behavior',
            'member',
            memberId,
            contextData,
            0.95
        );
    }

    /**
     * Update deal context
     */
    async updateDealContext(dealId, extraction) {
        const existingContext = await this.getEntityContext('deal', dealId);
        
        const update = {
            lastUpdated: new Date().toISOString(),
            latestInfo: extraction.data,
            updateType: extraction.type
        };
        
        const history = existingContext.length > 0 && existingContext[0].context_data.history
            ? [...existingContext[0].context_data.history, update]
            : [update];
            
        // Keep last 10 updates
        if (history.length > 10) {
            history.shift();
        }
        
        await dbHelpers.saveAIContext(
            'deal_pattern',
            'deal',
            dealId,
            { history, summary: this.summarizeDealHistory(history) },
            0.9
        );
    }

    /**
     * Update dealer context
     */
    async updateDealerContext(dealershipId, sentiment, feedback) {
        const existingContext = await this.getEntityContext('dealership', dealershipId);
        
        const feedbackEntry = {
            date: new Date().toISOString(),
            sentiment,
            feedback
        };
        
        const feedbackHistory = existingContext.length > 0 && existingContext[0].context_data.feedbackHistory
            ? [...existingContext[0].context_data.feedbackHistory, feedbackEntry]
            : [feedbackEntry];
            
        // Calculate overall sentiment
        const sentimentScores = {
            positive: 1,
            neutral: 0,
            negative: -1
        };
        
        const avgSentiment = feedbackHistory.reduce((sum, f) => 
            sum + (sentimentScores[f.sentiment] || 0), 0
        ) / feedbackHistory.length;
        
        await dbHelpers.saveAIContext(
            'dealer_profile',
            'dealership',
            dealershipId,
            { 
                feedbackHistory, 
                overallSentiment: avgSentiment > 0.3 ? 'positive' : avgSentiment < -0.3 ? 'negative' : 'neutral',
                lastFeedback: feedbackEntry
            },
            0.85
        );
    }

    /**
     * Add risk to deal context
     */
    async addDealRisk(dealId, description, severity, mitigation) {
        const existingContext = await this.getEntityContext('deal', dealId);
        
        const risk = {
            identified: new Date().toISOString(),
            description,
            severity,
            mitigation,
            resolved: false
        };
        
        const risks = existingContext.length > 0 && existingContext[0].context_data.risks
            ? [...existingContext[0].context_data.risks, risk]
            : [risk];
            
        const contextData = existingContext.length > 0
            ? { ...existingContext[0].context_data, risks }
            : { risks };
            
        await dbHelpers.saveAIContext(
            'deal_pattern',
            'deal',
            dealId,
            contextData,
            0.9
        );
    }

    /**
     * Update entity mention in context
     */
    async updateEntityMention(entityType, entityName, extraction) {
        // This tracks how often entities are mentioned together
        const mention = {
            date: new Date().toISOString(),
            context: extraction.type,
            associatedEntities: extraction.entities
        };
        
        await dbHelpers.saveAIContext(
            'entity_associations',
            entityType,
            entityName,
            { mentions: [mention] },
            0.7
        );
    }

    /**
     * Generate follow-up suggestions based on extractions
     */
    async generateFollowUpSuggestions(memberId, extractions) {
        // Analyze patterns in extractions
        const dealUpdates = extractions.filter(e => e.type === 'deal_update');
        const risks = extractions.filter(e => e.type === 'risk');
        
        // Suggest follow-ups for stalled deals
        for (const dealUpdate of dealUpdates) {
            if (dealUpdate.data.stage === 'proposal' && dealUpdate.data.probability < 50) {
                await db.query(`
                    INSERT INTO ai_follow_ups (
                        member_id, suggestion_text, reason, priority, suggested_date
                    ) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '3 days')
                `, [
                    memberId,
                    `Follow up on ${dealUpdate.data.dealName} proposal - probability is low`,
                    'Low probability in proposal stage indicates potential issues',
                    'high'
                ]);
            }
        }
    }

    /**
     * Get entity context from cache or database
     */
    async getEntityContext(entityType, entityId) {
        const cacheKey = `${entityType}:${entityId}:*`;
        
        // Check cache first
        const cached = [];
        for (const [key, value] of this.memoryCache) {
            if (key.startsWith(`${entityType}:${entityId}:`)) {
                cached.push(value);
            }
        }
        
        if (cached.length > 0) {
            return cached;
        }
        
        // Load from database
        return await dbHelpers.getAIContext(entityType, entityId);
    }

    /**
     * Summarize deal history for context
     */
    summarizeDealHistory(history) {
        if (!history || history.length === 0) return 'No history available';
        
        const latest = history[history.length - 1];
        const stages = history
            .filter(h => h.latestInfo?.stage)
            .map(h => h.latestInfo.stage);
            
        const uniqueStages = [...new Set(stages)];
        
        return {
            currentStage: latest.latestInfo?.stage || 'unknown',
            stageProgression: uniqueStages,
            updateCount: history.length,
            lastUpdate: latest.lastUpdated
        };
    }

    /**
     * Start periodic risk detection
     */
    startRiskDetection() {
        // Check for risks every 6 hours
        this.riskCheckInterval = setInterval(async () => {
            await this.detectAndFlagRisks();
        }, 6 * 60 * 60 * 1000);
        
        // Run initial check
        this.detectAndFlagRisks();
    }

    /**
     * Detect and flag at-risk deals
     */
    async detectAndFlagRisks() {
        try {
            console.log('🔍 Running risk detection...');
            
            // Find stalled deals
            const stalledDeals = await db.query(`
                SELECT d.*, tm.name as owner_name,
                       EXTRACT(days FROM NOW() - d.updated_at) as days_since_update
                FROM deals d
                JOIN team_members tm ON d.owner_id = tm.id
                WHERE d.stage NOT IN ('closed_won', 'closed_lost')
                AND d.updated_at < NOW() - INTERVAL '14 days'
            `);
            
            for (const deal of stalledDeals.rows) {
                // Check if we already have a recent follow-up
                const existingFollowUp = await db.query(`
                    SELECT * FROM ai_follow_ups
                    WHERE deal_id = $1
                    AND created_at > NOW() - INTERVAL '7 days'
                    AND completed = false
                `, [deal.id]);
                
                if (existingFollowUp.rows.length === 0) {
                    await db.query(`
                        INSERT INTO ai_follow_ups (
                            deal_id, member_id, suggestion_text, reason, priority, suggested_date
                        ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + INTERVAL '1 day')
                    `, [
                        deal.id,
                        deal.owner_id,
                        `Check on ${deal.name} - no updates in ${deal.days_since_update} days`,
                        'Deal appears to be stalled',
                        'high'
                    ]);
                }
            }
            
            // Find deals with approaching close dates
            const approachingDeals = await db.query(`
                SELECT d.*, tm.name as owner_name,
                       EXTRACT(days FROM d.expected_close_date - NOW()) as days_until_close
                FROM deals d
                JOIN team_members tm ON d.owner_id = tm.id
                WHERE d.stage NOT IN ('closed_won', 'closed_lost')
                AND d.expected_close_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
            `);
            
            for (const deal of approachingDeals.rows) {
                await db.query(`
                    INSERT INTO ai_follow_ups (
                        deal_id, member_id, suggestion_text, reason, priority, suggested_date
                    ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
                    ON CONFLICT DO NOTHING
                `, [
                    deal.id,
                    deal.owner_id,
                    `${deal.name} closing in ${deal.days_until_close} days - ensure all requirements are met`,
                    'Approaching expected close date',
                    'critical'
                ]);
            }
            
            console.log(`✅ Risk detection complete. Found ${stalledDeals.rows.length} stalled deals and ${approachingDeals.rows.length} approaching closes.`);
        } catch (error) {
            console.error('Error in risk detection:', error);
        }
    }

    /**
     * Get intelligent summary for executive
     */
    async generateExecutiveIntelligence(executiveId) {
        try {
            // Gather all relevant data
            const pipeline = await dbHelpers.getPipelineSummary();
            const teamPerf = await dbHelpers.getTeamPerformance();
            const recentRisks = await this.getRecentRisks();
            const recentOpportunities = await this.getRecentOpportunities();
            const upcomingFollowUps = await this.getUpcomingFollowUps();
            
            // Get competitive intelligence
            const competitorIntel = await db.query(`
                SELECT * FROM ai_context_memory
                WHERE context_type = 'competitor_intel'
                AND last_updated > NOW() - INTERVAL '7 days'
                ORDER BY last_updated DESC
                LIMIT 5
            `);
            
            // Generate executive summary
            const summary = {
                generated: new Date().toISOString(),
                pipelineSummary: this.summarizePipeline(pipeline),
                teamPerformance: this.summarizeTeamPerformance(teamPerf),
                attentionRequired: [
                    ...recentRisks.map(r => ({
                        type: 'risk',
                        priority: r.severity,
                        message: r.description,
                        action: r.mitigation
                    })),
                    ...upcomingFollowUps
                        .filter(f => f.priority === 'critical' || f.priority === 'high')
                        .map(f => ({
                            type: 'follow_up',
                            priority: f.priority,
                            message: f.suggestion_text,
                            action: f.reason
                        }))
                ],
                opportunities: recentOpportunities.map(o => ({
                    description: o.description,
                    potential: o.potential,
                    nextSteps: o.nextSteps
                })),
                competitiveInsights: competitorIntel.rows.map(ci => ({
                    competitor: ci.entity_id,
                    insight: ci.context_data.latestIntel,
                    impact: ci.context_data.impact
                }))
            };
            
            // Save the summary
            await db.query(`
                INSERT INTO executive_summaries (
                    executive_id, summary_date, content, 
                    key_highlights, attention_required, revenue_impact, team_performance
                ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
            `, [
                executiveId,
                JSON.stringify(summary),
                summary.pipelineSummary,
                summary.attentionRequired,
                summary.opportunities,
                summary.teamPerformance
            ]);
            
            return summary;
        } catch (error) {
            console.error('Error generating executive intelligence:', error);
            throw error;
        }
    }

    /**
     * Get recent risks
     */
    async getRecentRisks() {
        const result = await db.query(`
            SELECT ue.content->>'description' as description,
                   ue.content->>'severity' as severity,
                   ue.content->>'mitigation' as mitigation
            FROM update_extractions ue
            WHERE ue.extraction_type = 'risk'
            AND ue.created_at > NOW() - INTERVAL '7 days'
            ORDER BY ue.created_at DESC
            LIMIT 10
        `);
        
        return result.rows;
    }

    /**
     * Get recent opportunities
     */
    async getRecentOpportunities() {
        const result = await db.query(`
            SELECT ue.content->>'description' as description,
                   ue.content->>'potential' as potential,
                   ue.content->>'nextSteps' as nextSteps
            FROM update_extractions ue
            WHERE ue.extraction_type = 'opportunity'
            AND ue.created_at > NOW() - INTERVAL '7 days'
            ORDER BY ue.created_at DESC
            LIMIT 10
        `);
        
        return result.rows;
    }

    /**
     * Get upcoming follow-ups
     */
    async getUpcomingFollowUps() {
        const result = await db.query(`
            SELECT f.*, tm.name as member_name
            FROM ai_follow_ups f
            JOIN team_members tm ON f.member_id = tm.id
            WHERE f.completed = false
            AND f.suggested_date <= NOW() + INTERVAL '7 days'
            ORDER BY f.priority DESC, f.suggested_date ASC
            LIMIT 20
        `);
        
        return result.rows;
    }

    /**
     * Summarize pipeline for executive
     */
    summarizePipeline(pipeline) {
        const totalValue = pipeline.reduce((sum, s) => sum + (s.weighted_value || 0), 0);
        const totalDeals = pipeline.reduce((sum, s) => sum + s.deal_count, 0);
        
        return {
            totalPipelineValue: totalValue,
            totalDeals,
            stageBreakdown: pipeline.map(s => ({
                stage: s.stage,
                count: s.deal_count,
                value: s.total_value,
                weightedValue: s.weighted_value
            })),
            insights: this.generatePipelineInsights(pipeline)
        };
    }

    /**
     * Generate pipeline insights
     */
    generatePipelineInsights(pipeline) {
        const insights = [];
        
        // Check for bottlenecks
        const stages = ['prospect', 'qualified', 'proposal', 'negotiation'];
        for (let i = 0; i < stages.length - 1; i++) {
            const current = pipeline.find(p => p.stage === stages[i]);
            const next = pipeline.find(p => p.stage === stages[i + 1]);
            
            if (current && next && current.deal_count > next.deal_count * 3) {
                insights.push({
                    type: 'bottleneck',
                    message: `Potential bottleneck between ${stages[i]} and ${stages[i + 1]} stages`,
                    recommendation: `Review ${stages[i]} deals for advancement opportunities`
                });
            }
        }
        
        return insights;
    }

    /**
     * Summarize team performance
     */
    summarizeTeamPerformance(teamPerf) {
        return teamPerf.map(member => ({
            name: member.name,
            role: member.role,
            activeDeals: member.active_deals,
            revenueClosed: member.revenue_closed,
            lastActivity: member.last_update,
            performance: this.assessMemberPerformance(member)
        }));
    }

    /**
     * Assess individual member performance
     */
    assessMemberPerformance(member) {
        const daysSinceUpdate = member.last_update 
            ? (Date.now() - new Date(member.last_update).getTime()) / (1000 * 60 * 60 * 24)
            : 999;
            
        if (daysSinceUpdate > 7) {
            return { level: 'needs_attention', reason: 'No recent updates' };
        }
        
        if (member.active_deals === 0) {
            return { level: 'needs_attention', reason: 'No active deals' };
        }
        
        if (member.revenue_closed > 100000) {
            return { level: 'high_performer', reason: 'Strong revenue performance' };
        }
        
        return { level: 'on_track', reason: 'Normal activity levels' };
    }

    /**
     * Clean up resources
     */
    async shutdown() {
        if (this.riskCheckInterval) {
            clearInterval(this.riskCheckInterval);
        }
        this.memoryCache.clear();
        console.log('AI Intelligence Engine shut down');
    }
}

// Export singleton factory
export const createAIIntelligenceEngine = (apiKey) => {
    return new AIIntelligenceEngine(apiKey);
};