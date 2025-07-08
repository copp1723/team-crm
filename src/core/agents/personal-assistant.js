import { v4 as uuidv4 } from 'uuid';

export class PersonalAssistant {
  constructor(teamMember, aiProvider, memorySystem) {
    this.id = `assistant-${teamMember.id}`;
    this.teamMember = teamMember;
    this.aiProvider = aiProvider;
    this.memory = memorySystem;
    this.learningHistory = [];
  }

  async processUpdate(rawUpdate, context = {}) {
    try {
      const updateId = uuidv4();
      const timestamp = new Date().toISOString();

      // Extract structured information from natural language
      const extraction = await this.extractInformation(rawUpdate);
      
      // Apply business context and learning
      const enrichedData = await this.enrichWithContext(extraction, context);
      
      // Store in memory for learning
      await this.storeInteraction(updateId, rawUpdate, enrichedData);

      return {
        id: updateId,
        timestamp,
        source: this.teamMember.name,
        raw_input: rawUpdate,
        extracted_data: enrichedData,
        confidence: extraction.confidence,
        requires_attention: this.assessUrgency(enrichedData)
      };

    } catch (error) {
      console.error(`Personal Assistant Error (${this.teamMember.name}):`, error);
      return this.createErrorResponse(rawUpdate, error);
    }
  }

  async extractInformation(rawUpdate) {
    const prompt = this.buildExtractionPrompt(rawUpdate);
    
    const response = await this.aiProvider.chat({
      model: this.teamMember.ai_model || 'claude-3-sonnet',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    return this.parseExtractionResponse(response.content);
  }

  buildExtractionPrompt(rawUpdate) {
    const focusAreas = this.teamMember.focus_areas.join(', ');
    const priorities = this.teamMember.extraction_priorities.join(', ');

    return `You are a personal AI assistant for ${this.teamMember.name}, a ${this.teamMember.role}.

Focus Areas: ${focusAreas}
Extraction Priorities: ${priorities}

Extract structured information from this update:
"${rawUpdate}"

Return JSON with:
{
  "priorities": [{"item": "description", "urgency": "high/medium/low", "deadline": "date or null"}],
  "action_items": [{"task": "description", "assignee": "person or null", "due_date": "date or null"}],
  "client_info": [{"client": "name", "status": "positive/negative/neutral", "details": "context"}],
  "technical_info": [{"issue": "description", "severity": "high/medium/low", "impact": "description"}],
  "revenue_info": [{"opportunity": "description", "value": "amount or estimate", "probability": "high/medium/low"}],
  "key_insights": ["insight1", "insight2"],
  "confidence": 0.85
}

Only include sections with actual information. Be specific and actionable.`;
  }

  parseExtractionResponse(response) {
    try {
      // Clean response and parse JSON
      const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanResponse);
    } catch (error) {
      console.error('Failed to parse extraction response:', error);
      return {
        priorities: [],
        action_items: [],
        client_info: [],
        technical_info: [],
        revenue_info: [],
        key_insights: [],
        confidence: 0.5
      };
    }
  }

  async enrichWithContext(extraction, context) {
    // Add team member context
    extraction.source_role = this.teamMember.role;
    extraction.source_focus = this.teamMember.focus_areas;

    // Apply learned patterns
    const patterns = await this.memory.getPatterns(this.teamMember.id);
    if (patterns.length > 0) {
      extraction.learned_context = this.applyLearningPatterns(extraction, patterns);
    }

    // Business rule application
    extraction.business_impact = this.assessBusinessImpact(extraction);
    
    return extraction;
  }

  assessUrgency(extractedData) {
    const highPriorityCount = extractedData.priorities?.filter(p => p.urgency === 'high').length || 0;
    const hasDeadlines = extractedData.priorities?.some(p => p.deadline) || false;
    const hasRevenue = extractedData.revenue_info?.length > 0 || false;
    const hasCriticalTech = extractedData.technical_info?.some(t => t.severity === 'high') || false;

    return highPriorityCount > 0 || hasDeadlines || hasRevenue || hasCriticalTech;
  }

  assessBusinessImpact(extraction) {
    let impact = 'low';
    let reasons = [];

    if (extraction.revenue_info?.length > 0) {
      impact = 'high';
      reasons.push('Revenue opportunity identified');
    }

    if (extraction.client_info?.some(c => c.status === 'negative')) {
      impact = 'high';
      reasons.push('Client satisfaction risk');
    }

    if (extraction.priorities?.some(p => p.urgency === 'high')) {
      impact = impact === 'low' ? 'medium' : 'high';
      reasons.push('High priority items');
    }

    return { level: impact, reasons };
  }

  applyLearningPatterns(extraction, patterns) {
    // Apply learned communication patterns and preferences
    return patterns.map(pattern => ({
      pattern_type: pattern.type,
      confidence: pattern.confidence,
      suggestion: pattern.suggestion
    }));
  }

  async storeInteraction(updateId, rawInput, extractedData) {
    await this.memory.store({
      id: updateId,
      agent_id: this.id,
      team_member: this.teamMember.id,
      timestamp: new Date().toISOString(),
      raw_input: rawInput,
      extracted_data: extractedData,
      type: 'team_update'
    });
  }

  createErrorResponse(rawUpdate, error) {
    return {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      source: this.teamMember.name,
      raw_input: rawUpdate,
      error: true,
      error_message: error.message,
      extracted_data: {
        priorities: [],
        action_items: [],
        client_info: [],
        technical_info: [],
        revenue_info: [],
        key_insights: [`Error processing update: ${error.message}`],
        confidence: 0.0
      },
      requires_attention: true
    };
  }

  async getInsights() {
    const recentInteractions = await this.memory.getRecent(this.teamMember.id, 10);
    
    return {
      team_member: this.teamMember.name,
      role: this.teamMember.role,
      recent_activity: recentInteractions.length,
      common_themes: this.identifyThemes(recentInteractions),
      productivity_patterns: this.analyzeProductivity(recentInteractions)
    };
  }

  identifyThemes(interactions) {
    const themes = {};
    interactions.forEach(interaction => {
      interaction.extracted_data?.key_insights?.forEach(insight => {
        const key = insight.toLowerCase();
        themes[key] = (themes[key] || 0) + 1;
      });
    });

    return Object.entries(themes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, frequency: count }));
  }

  analyzeProductivity(interactions) {
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const recent = interactions.filter(i => new Date(i.timestamp) > dayAgo);
    const weekly = interactions.filter(i => new Date(i.timestamp) > weekAgo);

    return {
      updates_today: recent.length,
      updates_this_week: weekly.length,
      avg_confidence: weekly.reduce((sum, i) => sum + (i.extracted_data?.confidence || 0), 0) / weekly.length || 0,
      high_priority_items: weekly.reduce((sum, i) => sum + (i.extracted_data?.priorities?.filter(p => p.urgency === 'high').length || 0), 0)
    };
  }
}