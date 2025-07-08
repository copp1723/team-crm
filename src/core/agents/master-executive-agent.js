import { v4 as uuidv4 } from 'uuid';

export class MasterExecutiveAgent {
  constructor(executiveConfig, aiProvider, memorySystem) {
    this.id = 'master-executive-agent';
    this.executive = executiveConfig;
    this.aiProvider = aiProvider;
    this.memory = memorySystem;
    this.summaryHistory = [];
  }

  async generateExecutiveSummary(teamUpdates, timeframe = '24h') {
    try {
      const summaryId = uuidv4();
      const timestamp = new Date().toISOString();

      // Filter and prioritize updates
      const prioritizedUpdates = this.prioritizeUpdates(teamUpdates);
      
      // Generate strategic insights
      const strategicAnalysis = await this.analyzeStrategicImplications(prioritizedUpdates);
      
      // Create executive summary
      const summary = await this.createSummary(strategicAnalysis, timeframe);
      
      // Store for learning and tracking
      await this.storeSummary(summaryId, summary, prioritizedUpdates);

      return {
        id: summaryId,
        timestamp,
        timeframe,
        executive: this.executive.name,
        summary,
        source_updates: prioritizedUpdates.length,
        confidence: summary.confidence
      };

    } catch (error) {
      console.error('Master Executive Agent Error:', error);
      return this.createErrorSummary(error);
    }
  }

  prioritizeUpdates(teamUpdates) {
    return teamUpdates
      .filter(update => !update.error)
      .map(update => ({
        ...update,
        priority_score: this.calculatePriorityScore(update)
      }))
      .sort((a, b) => b.priority_score - a.priority_score);
  }

  calculatePriorityScore(update) {
    let score = 0;
    const data = update.extracted_data;

    // High priority items
    const highPriorities = data.priorities?.filter(p => p.urgency === 'high').length || 0;
    score += highPriorities * 10;

    // Revenue impact
    const revenueItems = data.revenue_info?.length || 0;
    score += revenueItems * 15;

    // Client issues
    const clientIssues = data.client_info?.filter(c => c.status === 'negative').length || 0;
    score += clientIssues * 12;

    // Technical severity
    const criticalTech = data.technical_info?.filter(t => t.severity === 'high').length || 0;
    score += criticalTech * 8;

    // Deadlines
    const hasDeadlines = data.priorities?.some(p => p.deadline) ? 5 : 0;
    score += hasDeadlines;

    // Business impact
    if (data.business_impact?.level === 'high') score += 10;
    else if (data.business_impact?.level === 'medium') score += 5;

    return score;
  }

  async analyzeStrategicImplications(prioritizedUpdates) {
    const prompt = this.buildAnalysisPrompt(prioritizedUpdates);
    
    const response = await this.aiProvider.chat({
      model: this.executive.ai_model || 'claude-3-opus',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    });

    return this.parseAnalysisResponse(response.content);
  }

  buildAnalysisPrompt(updates) {
    const priorityAreas = this.executive.priority_areas.join(', ');
    const updateSummaries = updates.slice(0, 10).map(update => 
      `${update.source}: ${JSON.stringify(update.extracted_data, null, 2)}`
    ).join('\n\n');

    return `You are an executive AI assistant for ${this.executive.name}, focused on: ${priorityAreas}.

Analyze these team updates and provide strategic insights:

${updateSummaries}

Return JSON with:
{
  "critical_attention_areas": [
    {
      "area": "description",
      "urgency": "critical/high/medium",
      "impact": "revenue/operational/strategic",
      "recommended_action": "specific action",
      "timeline": "immediate/this_week/this_month"
    }
  ],
  "resource_allocation_insights": [
    {
      "resource": "person/team/budget",
      "current_allocation": "description",
      "recommended_change": "specific recommendation",
      "expected_outcome": "business impact"
    }
  ],
  "revenue_opportunities": [
    {
      "opportunity": "description", 
      "potential_value": "estimate",
      "probability": "high/medium/low",
      "next_steps": "action items"
    }
  ],
  "risk_factors": [
    {
      "risk": "description",
      "probability": "high/medium/low", 
      "impact": "high/medium/low",
      "mitigation": "recommended action"
    }
  ],
  "strategic_recommendations": [
    {
      "recommendation": "high-level strategic advice",
      "rationale": "why this matters",
      "success_metrics": "how to measure"
    }
  ],
  "confidence": 0.85
}

Focus on actionable insights that drive business decisions.`;
  }

  parseAnalysisResponse(response) {
    try {
      const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanResponse);
    } catch (error) {
      console.error('Failed to parse analysis response:', error);
      return {
        critical_attention_areas: [],
        resource_allocation_insights: [],
        revenue_opportunities: [],
        risk_factors: [],
        strategic_recommendations: [],
        confidence: 0.5
      };
    }
  }

  async createSummary(analysis, timeframe) {
    const prompt = this.buildSummaryPrompt(analysis, timeframe);
    
    const response = await this.aiProvider.chat({
      model: this.executive.ai_model || 'claude-3-opus',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    return {
      ...analysis,
      executive_summary: response.content,
      generated_at: new Date().toISOString(),
      timeframe
    };
  }

  buildSummaryPrompt(analysis, timeframe) {
    return `Create an executive summary for ${this.executive.name} based on this analysis.

Analysis Data:
${JSON.stringify(analysis, null, 2)}

Timeframe: ${timeframe}

Write a concise executive summary that:
1. Highlights the top 3 items requiring immediate attention
2. Provides clear resource allocation recommendations  
3. Identifies revenue opportunities and risks
4. Gives specific next steps

Style: Direct, actionable, strategic focus. Use bullet points and clear priorities.
Length: 200-300 words maximum.

Format as professional executive briefing.`;
  }

  async storeSummary(summaryId, summary, sourceUpdates) {
    await this.memory.store({
      id: summaryId,
      agent_id: this.id,
      executive: this.executive.id,
      timestamp: new Date().toISOString(),
      summary,
      source_updates: sourceUpdates.map(u => u.id),
      type: 'executive_summary'
    });

    this.summaryHistory.push({
      id: summaryId,
      timestamp: new Date().toISOString(),
      confidence: summary.confidence
    });
  }

  createErrorSummary(error) {
    return {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      executive: this.executive.name,
      error: true,
      error_message: error.message,
      summary: {
        critical_attention_areas: [{
          area: "System Error",
          urgency: "high",
          impact: "operational",
          recommended_action: "Review system logs and resolve technical issues",
          timeline: "immediate"
        }],
        executive_summary: `Executive Summary Generation Error: ${error.message}. Please review system status and retry.`,
        confidence: 0.0
      }
    };
  }

  async getDashboardData() {
    const recentSummaries = await this.memory.getRecent(this.executive.id, 5);
    const trends = this.analyzeTrends(recentSummaries);

    return {
      executive: this.executive.name,
      role: this.executive.role,
      recent_summaries: recentSummaries.length,
      avg_confidence: this.calculateAverageConfidence(recentSummaries),
      trends,
      last_summary: recentSummaries[0] || null,
      system_health: this.assessSystemHealth()
    };
  }

  analyzeTrends(summaries) {
    if (summaries.length < 2) return { insufficient_data: true };

    const themes = {};
    summaries.forEach(summary => {
      summary.summary?.critical_attention_areas?.forEach(area => {
        const key = area.area.toLowerCase();
        themes[key] = (themes[key] || 0) + 1;
      });
    });

    return {
      recurring_themes: Object.entries(themes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([theme, frequency]) => ({ theme, frequency })),
      summary_frequency: summaries.length,
      avg_critical_items: summaries.reduce((sum, s) => 
        sum + (s.summary?.critical_attention_areas?.length || 0), 0) / summaries.length
    };
  }

  calculateAverageConfidence(summaries) {
    if (summaries.length === 0) return 0;
    return summaries.reduce((sum, s) => sum + (s.summary?.confidence || 0), 0) / summaries.length;
  }

  assessSystemHealth() {
    const recentErrors = this.summaryHistory.filter(s => 
      s.confidence < 0.5 && 
      new Date() - new Date(s.timestamp) < 24 * 60 * 60 * 1000
    ).length;

    return {
      status: recentErrors > 2 ? 'degraded' : 'healthy',
      recent_errors: recentErrors,
      last_successful: this.summaryHistory
        .filter(s => s.confidence > 0.7)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.timestamp || null
    };
  }

  async getStrategicInsights(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentSummaries = await this.memory.getRecent(this.executive.id, 20);
    const relevantSummaries = recentSummaries.filter(s => new Date(s.timestamp) > cutoff);

    return {
      timeframe: `${days} days`,
      total_summaries: relevantSummaries.length,
      key_patterns: this.identifyStrategicPatterns(relevantSummaries),
      resource_trends: this.analyzeResourceTrends(relevantSummaries),
      revenue_pipeline: this.analyzeRevenuePipeline(relevantSummaries)
    };
  }

  identifyStrategicPatterns(summaries) {
    const patterns = {
      attention_areas: {},
      risk_categories: {},
      opportunity_types: {}
    };

    summaries.forEach(summary => {
      summary.summary?.critical_attention_areas?.forEach(area => {
        patterns.attention_areas[area.impact] = (patterns.attention_areas[area.impact] || 0) + 1;
      });

      summary.summary?.risk_factors?.forEach(risk => {
        patterns.risk_categories[risk.risk] = (patterns.risk_categories[risk.risk] || 0) + 1;
      });

      summary.summary?.revenue_opportunities?.forEach(opp => {
        patterns.opportunity_types[opp.opportunity] = (patterns.opportunity_types[opp.opportunity] || 0) + 1;
      });
    });

    return patterns;
  }

  analyzeResourceTrends(summaries) {
    const resourceMentions = {};
    summaries.forEach(summary => {
      summary.summary?.resource_allocation_insights?.forEach(insight => {
        resourceMentions[insight.resource] = (resourceMentions[insight.resource] || 0) + 1;
      });
    });

    return Object.entries(resourceMentions)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([resource, mentions]) => ({ resource, frequency: mentions }));
  }

  analyzeRevenuePipeline(summaries) {
    const opportunities = [];
    summaries.forEach(summary => {
      summary.summary?.revenue_opportunities?.forEach(opp => {
        opportunities.push({
          opportunity: opp.opportunity,
          value: opp.potential_value,
          probability: opp.probability,
          timestamp: summary.timestamp
        });
      });
    });

    return {
      total_opportunities: opportunities.length,
      high_probability: opportunities.filter(o => o.probability === 'high').length,
      recent_opportunities: opportunities.filter(o => 
        new Date() - new Date(o.timestamp) < 3 * 24 * 60 * 60 * 1000
      ).length
    };
  }
}