/**
 * EXECUTIVE SUMMARY ENGINE
 * Enhanced filtering and prioritization for executive intelligence
 */

export class ExecutiveSummaryEngine {
    constructor() {
        this.priorityWeights = {
            deal_value: 0.4,
            urgency: 0.3,
            client_tier: 0.2,
            timeline_risk: 0.1
        };
        
        this.urgencyLevels = {
            critical: 100,
            high: 75,
            medium: 50,
            low: 25
        };
    }

    /**
     * Enhanced filtering of attention items
     */
    filterAttentionItems(items) {
        return items
            .filter(item => this.shouldEscalateToExecutive(item))
            .sort((a, b) => this.calculatePriority(b) - this.calculatePriority(a))
            .slice(0, 10); // Top 10 most critical
    }

    /**
     * Determine if item requires executive attention
     */
    shouldEscalateToExecutive(item) {
        const dealValue = item.dealValue || 0;
        const urgency = item.urgency || 'low';
        const context = item.context || {};
        
        // Auto-escalate conditions
        if (dealValue >= 500000) return true;
        if (urgency === 'critical') return true;
        if (context.executiveMeetingRequested) return true;
        if (context.competitorThreat) return true;
        if (context.clientEscalation) return true;
        
        return false;
    }

    /**
     * Calculate priority score for sorting
     */
    calculatePriority(item) {
        let score = 0;
        
        // Deal value component
        const dealValue = item.dealValue || 0;
        score += Math.min(dealValue / 1000000, 1) * this.priorityWeights.deal_value * 100;
        
        // Urgency component
        const urgencyScore = this.urgencyLevels[item.urgency] || 0;
        score += urgencyScore * this.priorityWeights.urgency;
        
        // Client tier component
        const context = item.context || {};
        const clientTier = context.clientTier === 'enterprise' ? 100 : 50;
        score += clientTier * this.priorityWeights.client_tier;
        
        // Timeline risk component
        const timelineRisk = context.timelineRisk === 'high' ? 100 : 
                           context.timelineRisk === 'medium' ? 50 : 25;
        score += timelineRisk * this.priorityWeights.timeline_risk;
        
        return score;
    }

    /**
     * Enhanced activity filtering with intelligence extraction
     */
    filterTeamActivity(activities) {
        return activities
            .filter(activity => this.hasExecutiveRelevance(activity))
            .map(activity => this.enhanceActivityIntelligence(activity))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 15);
    }

    /**
     * Check if activity has executive relevance
     */
    hasExecutiveRelevance(activity) {
        const summary = (activity.summary || '').toLowerCase();
        const context = activity.context || {};
        
        // Executive-relevant keywords
        const executiveKeywords = [
            'ceo', 'executive', 'contract', 'negotiation', 'partnership',
            'strategic', 'competitive', 'risk', 'opportunity', 'escalation',
            'urgent', 'critical', 'blocker', 'timeline', 'budget'
        ];
        
        const hasKeywords = executiveKeywords.some(keyword => 
            summary.includes(keyword)
        );
        
        const hasHighValue = context.dealValue && context.dealValue >= 100000;
        const hasRisk = context.dealRisk === 'high' || context.dealRisk === 'critical';
        
        return hasKeywords || hasHighValue || hasRisk;
    }

    /**
     * Enhance activity with executive intelligence
     */
    enhanceActivityIntelligence(activity) {
        const enhanced = { ...activity };
        const summary = activity.summary || '';
        const context = activity.context || {};
        
        // Extract key insights
        enhanced.executiveInsights = this.extractExecutiveInsights(summary, context);
        
        // Add priority flag
        enhanced.executivePriority = this.determineExecutivePriority(summary, context);
        
        return enhanced;
    }

    /**
     * Extract executive-relevant insights
     */
    extractExecutiveInsights(summary, context) {
        const insights = [];
        const lowerSummary = summary.toLowerCase();
        
        // Deal insights
        if (lowerSummary.includes('contract') || lowerSummary.includes('negotiation')) {
            insights.push('Contract Discussion');
        }
        
        if (lowerSummary.includes('competitive') || lowerSummary.includes('competitor')) {
            insights.push('Competitive Situation');
        }
        
        if (lowerSummary.includes('partnership') || lowerSummary.includes('strategic')) {
            insights.push('Strategic Opportunity');
        }
        
        if (lowerSummary.includes('risk') || lowerSummary.includes('concern')) {
            insights.push('Risk Identified');
        }
        
        if (lowerSummary.includes('timeline') || lowerSummary.includes('delay')) {
            insights.push('Timeline Issue');
        }
        
        // Context-based insights
        if (context.dealValue >= 500000) {
            insights.push('High-Value Deal');
        }
        
        if (context.clientMood === 'negative' || context.dealRisk === 'high') {
            insights.push('Attention Required');
        }
        
        return insights;
    }

    /**
     * Determine executive priority level
     */
    determineExecutivePriority(summary, context) {
        const lowerSummary = summary.toLowerCase();
        
        // Critical priority triggers
        if (lowerSummary.includes('urgent') || lowerSummary.includes('critical') ||
            lowerSummary.includes('escalation') || context.dealRisk === 'critical') {
            return 'critical';
        }
        
        // High priority triggers
        if (lowerSummary.includes('ceo') || lowerSummary.includes('executive') ||
            lowerSummary.includes('competitive') || context.dealValue >= 500000) {
            return 'high';
        }
        
        // Medium priority triggers
        if (lowerSummary.includes('contract') || lowerSummary.includes('partnership') ||
            lowerSummary.includes('strategic') || context.dealValue >= 100000) {
            return 'medium';
        }
        
        return 'low';
    }

    /**
     * Generate executive summary metrics
     */
    generateSummaryMetrics(attentionItems, activities) {
        const metrics = {
            criticalItems: attentionItems.filter(item => item.urgency === 'critical').length,
            highPriorityItems: attentionItems.filter(item => item.urgency === 'high').length,
            totalRevenueAtRisk: attentionItems.reduce((sum, item) => sum + (item.dealValue || 0), 0),
            strategicOpportunities: activities.filter(activity => 
                (activity.executiveInsights || []).includes('Strategic Opportunity')
            ).length,
            competitiveSituations: activities.filter(activity =>
                (activity.executiveInsights || []).includes('Competitive Situation')
            ).length,
            timelineRisks: activities.filter(activity =>
                (activity.executiveInsights || []).includes('Timeline Issue')
            ).length
        };
        
        return metrics;
    }
}