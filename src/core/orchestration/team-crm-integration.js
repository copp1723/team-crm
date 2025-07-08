/**
 * INTEGRATION MODULE
 * Connects the Analytics Engine and AI Intelligence Engine with the Team Orchestrator
 */

import { db } from '../database/connection.js';
import { analyticsEngine } from '../analytics/analytics-engine.js';
import { createAIIntelligenceEngine } from '../intelligence/ai-intelligence-engine.js';

export class TeamCRMIntegration {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.aiIntelligence = null;
        this.initialized = false;
    }

    /**
     * Initialize all components
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Team CRM Integration...');

            // Initialize database
            await db.initialize();

            // Initialize analytics engine
            await analyticsEngine.initialize();

            // Initialize AI intelligence engine
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                console.warn('⚠️  No OpenRouter API key found - AI features will be limited');
            } else {
                this.aiIntelligence = createAIIntelligenceEngine(apiKey);
                await this.aiIntelligence.initialize();
            }

            // Hook into orchestrator events
            this.setupOrchestratorHooks();

            this.initialized = true;
            console.log('✅ Team CRM Integration initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Team CRM Integration:', error);
            throw error;
        }
    }

    /**
     * Setup hooks to capture orchestrator events
     */
    setupOrchestratorHooks() {
        // Store reference to original processUpdate
        const originalProcessUpdate = this.orchestrator.processUpdate.bind(this.orchestrator);

        // Override processUpdate to capture updates
        this.orchestrator.processUpdate = async (memberName, updateText, metadata = {}) => {
            try {
                // Process with original orchestrator
                const result = await originalProcessUpdate(memberName, updateText, metadata);

                // Persist the update
                const teamUpdate = await this.persistTeamUpdate(memberName, updateText, metadata);

                // Process with AI intelligence if available
                if (this.aiIntelligence && teamUpdate) {
                    const extractions = await this.aiIntelligence.processTeamUpdate(
                        teamUpdate.id,
                        memberName,
                        updateText
                    );

                    // Enhance result with AI extractions
                    result.aiExtractions = extractions;
                }

                // Trigger analytics snapshot if significant update
                if (this.isSignificantUpdate(result)) {
                    await analyticsEngine.captureCurrentMetrics();
                }

                return result;
            } catch (error) {
                console.error('Error in integrated update processing:', error);
                // Fall back to original processing
                return originalProcessUpdate(memberName, updateText, metadata);
            }
        };

        // Hook into summary generation
        if (this.orchestrator.masterAgent) {
            const originalGenerateSummary = this.orchestrator.masterAgent.generateExecutiveSummary.bind(
                this.orchestrator.masterAgent
            );

            this.orchestrator.masterAgent.generateExecutiveSummary = async (updates) => {
                try {
                    // Get original summary
                    const summary = await originalGenerateSummary(updates);

                    // Enhance with analytics data
                    const analyticsData = await this.getAnalyticsEnhancement();
                    summary.analytics = analyticsData;

                    // Enhance with AI intelligence if available
                    if (this.aiIntelligence) {
                        const executiveId = await this.getExecutiveId();
                        const aiSummary = await this.aiIntelligence.generateExecutiveIntelligence(executiveId);
                        summary.intelligence = aiSummary;
                    }

                    // Persist the summary
                    await this.persistExecutiveSummary(summary);

                    return summary;
                } catch (error) {
                    console.error('Error in enhanced summary generation:', error);
                    return originalGenerateSummary(updates);
                }
            };
        }
    }

    /**
     * Persist team update to database
     */
    async persistTeamUpdate(memberName, updateText, metadata) {
        try {
            // Get member ID
            const memberResult = await db.query(
                'SELECT id FROM team_members WHERE external_id = $1',
                [memberName]
            );

            if (memberResult.rows.length === 0) {
                console.warn(`Team member ${memberName} not found in database`);
                return null;
            }

            const memberId = memberResult.rows[0].id;

            // Insert update
            const updateResult = await db.query(`
                INSERT INTO team_updates (
                    member_id, update_text, source, priority, is_urgent
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [
                memberId,
                updateText,
                metadata.source || 'chat',
                metadata.priority || null,
                metadata.urgent || false
            ]);

            return updateResult.rows[0];
        } catch (error) {
            console.error('Error persisting team update:', error);
            return null;
        }
    }

    /**
     * Check if update is significant enough to trigger analytics
     */
    isSignificantUpdate(result) {
        // Trigger analytics for:
        // - Deal updates
        // - Revenue mentions
        // - Stage changes
        // - High priority items
        
        if (!result || !result.extraction) return false;

        const extraction = result.extraction;
        
        return (
            extraction.priorities?.some(p => p.includes('deal') || p.includes('revenue')) ||
            extraction.clientInfo?.length > 0 ||
            extraction.actionItems?.length > 0 ||
            result.priority === 'high'
        );
    }

    /**
     * Get analytics enhancement for summary
     */
    async getAnalyticsEnhancement() {
        try {
            const pipeline = await db.query('SELECT * FROM pipeline_summary');
            const teamPerf = await db.query('SELECT * FROM team_performance');
            
            // Get trends for key metrics
            const pipelineTrend = await analyticsEngine.getTrendAnalysis('pipeline_value', 30);
            const conversionTrend = await analyticsEngine.getTrendAnalysis('conversion_rate', 30);
            
            // Get forecast
            const forecast = await analyticsEngine.generateForecast('pipeline_value', 30);

            return {
                current: {
                    pipeline: pipeline.rows,
                    teamPerformance: teamPerf.rows
                },
                trends: {
                    pipeline: pipelineTrend,
                    conversion: conversionTrend
                },
                forecast: forecast,
                exportReady: true
            };
        } catch (error) {
            console.error('Error getting analytics enhancement:', error);
            return null;
        }
    }

    /**
     * Get executive ID from config
     */
    async getExecutiveId() {
        try {
            const executiveResult = await db.query(
                'SELECT id FROM team_members WHERE external_id = $1',
                ['tre'] // Default executive ID from config
            );

            return executiveResult.rows[0]?.id || null;
        } catch (error) {
            console.error('Error getting executive ID:', error);
            return null;
        }
    }

    /**
     * Persist executive summary
     */
    async persistExecutiveSummary(summary) {
        try {
            const executiveId = await this.getExecutiveId();
            if (!executiveId) return;

            await db.query(`
                INSERT INTO executive_summaries (
                    executive_id, summary_date, content, key_highlights
                ) VALUES ($1, CURRENT_DATE, $2, $3)
                ON CONFLICT (executive_id, summary_date) DO UPDATE
                SET content = EXCLUDED.content,
                    key_highlights = EXCLUDED.key_highlights
            `, [
                executiveId,
                JSON.stringify(summary),
                summary.keyHighlights || []
            ]);
        } catch (error) {
            console.error('Error persisting executive summary:', error);
        }
    }

    /**
     * API endpoints for the enhanced features
     */
    getAPIEndpoints() {
        return {
            // Analytics endpoints
            '/api/analytics/trends/:metric': async (req, res) => {
                const { metric } = req.params;
                const { days = 30, dimension } = req.query;
                
                try {
                    const trend = await analyticsEngine.getTrendAnalysis(
                        metric, 
                        parseInt(days), 
                        dimension
                    );
                    res.json(trend);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            },

            '/api/analytics/forecast/:metric': async (req, res) => {
                const { metric } = req.params;
                const { days = 30 } = req.query;
                
                try {
                    const forecast = await analyticsEngine.generateForecast(
                        metric, 
                        parseInt(days)
                    );
                    res.json(forecast);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            },

            '/api/analytics/export': async (req, res) => {
                const { startDate, endDate, format = 'json' } = req.query;
                
                try {
                    const data = await analyticsEngine.exportAnalytics(
                        startDate, 
                        endDate, 
                        format
                    );
                    
                    if (format === 'csv') {
                        res.setHeader('Content-Type', 'text/csv');
                        res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
                    }
                    
                    res.send(data);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            },

            // AI Intelligence endpoints
            '/api/intelligence/follow-ups': async (req, res) => {
                try {
                    const followUps = await db.query(`
                        SELECT f.*, tm.name as member_name, d.name as deal_name
                        FROM ai_follow_ups f
                        JOIN team_members tm ON f.member_id = tm.id
                        LEFT JOIN deals d ON f.deal_id = d.id
                        WHERE f.completed = false
                        ORDER BY f.priority DESC, f.suggested_date ASC
                        LIMIT 50
                    `);
                    
                    res.json(followUps.rows);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            },

            '/api/intelligence/risks': async (req, res) => {
                try {
                    const risks = await db.query(`
                        SELECT 
                            d.name as deal_name,
                            d.stage,
                            d.amount,
                            tm.name as owner_name,
                            acm.context_data->>'risks' as risks
                        FROM deals d
                        JOIN team_members tm ON d.owner_id = tm.id
                        LEFT JOIN ai_context_memory acm ON acm.entity_id = d.id::text
                        WHERE d.stage NOT IN ('closed_won', 'closed_lost')
                        AND acm.context_type = 'deal_pattern'
                        AND acm.context_data->>'risks' IS NOT NULL
                        ORDER BY d.priority DESC
                    `);
                    
                    res.json(risks.rows);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            },

            '/api/intelligence/opportunities': async (req, res) => {
                try {
                    const opportunities = await db.query(`
                        SELECT 
                            ue.content->>'description' as description,
                            ue.content->>'potential' as potential,
                            ue.content->>'clientName' as client_name,
                            ue.content->>'nextSteps' as next_steps,
                            ue.created_at,
                            tm.name as identified_by
                        FROM update_extractions ue
                        JOIN team_updates tu ON ue.update_id = tu.id
                        JOIN team_members tm ON tu.member_id = tm.id
                        WHERE ue.extraction_type = 'opportunity'
                        AND ue.created_at > NOW() - INTERVAL '30 days'
                        ORDER BY 
                            CASE ue.content->>'potential'
                                WHEN 'high' THEN 1
                                WHEN 'medium' THEN 2
                                ELSE 3
                            END,
                            ue.created_at DESC
                    `);
                    
                    res.json(opportunities.rows);
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            },

            // Combined dashboard endpoint
            '/api/dashboard/executive': async (req, res) => {
                try {
                    const executiveId = await this.getExecutiveId();
                    
                    // Get latest AI intelligence summary
                    let intelligence = null;
                    if (this.aiIntelligence) {
                        intelligence = await this.aiIntelligence.generateExecutiveIntelligence(executiveId);
                    }
                    
                    // Get analytics data
                    const analytics = await this.getAnalyticsEnhancement();
                    
                    // Get recent updates
                    const recentUpdates = await db.query(`
                        SELECT 
                            tu.update_text,
                            tu.created_at,
                            tm.name as member_name,
                            tm.role as member_role
                        FROM team_updates tu
                        JOIN team_members tm ON tu.member_id = tm.id
                        ORDER BY tu.created_at DESC
                        LIMIT 10
                    `);
                    
                    res.json({
                        intelligence,
                        analytics,
                        recentUpdates: recentUpdates.rows,
                        generated: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            }
        };
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown() {
        console.log('Shutting down Team CRM Integration...');
        
        if (this.aiIntelligence) {
            await this.aiIntelligence.shutdown();
        }
        
        await analyticsEngine.shutdown();
        await db.close();
        
        console.log('Team CRM Integration shut down complete');
    }
}

// Export factory function
export const createTeamCRMIntegration = (orchestrator) => {
    return new TeamCRMIntegration(orchestrator);
};