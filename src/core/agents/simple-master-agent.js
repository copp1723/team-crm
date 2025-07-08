import { v4 as uuidv4 } from 'uuid';

export class MasterExecutiveAgent {
    constructor(globalConfig) {
        this.globalConfig = globalConfig;
        this.executive = globalConfig.team.executives[0]; // Tre
        this.pendingUpdates = [];
        this.summaryHistory = [];
        this.totalSummariesGenerated = 0;
        this.lastSummaryTime = null;
        this.summaryThreshold = 3; // Generate summary after 3 updates
    }

    async receiveUpdate(structuredUpdate) {
        try {
            console.log(`Master Agent received update from ${structuredUpdate.memberName}`);
            
            // Add to pending updates
            this.pendingUpdates.push(structuredUpdate);
            
            // Check if we should generate a summary
            const shouldGenerateSummary = this.shouldGenerateSummary();
            
            if (shouldGenerateSummary) {
                const summary = await this.generateSummary();
                return {
                    status: 'summary_generated',
                    summary: summary,
                    processedUpdates: this.pendingUpdates.length,
                    updateReceived: true
                };
            }
            
            return {
                status: 'update_received',
                pendingUpdates: this.pendingUpdates.length,
                nextSummaryIn: this.summaryThreshold - this.pendingUpdates.length
            };

        } catch (error) {
            console.error('Error in Master Agent receiving update:', error);
            throw error;
        }
    }

    shouldGenerateSummary() {
        // Generate summary if:
        // 1. We have enough pending updates
        // 2. Or it's been more than 30 minutes since last summary
        const hasEnoughUpdates = this.pendingUpdates.length >= this.summaryThreshold;
        const timeSinceLastSummary = this.lastSummaryTime ? 
            Date.now() - new Date(this.lastSummaryTime).getTime() : Infinity;
        const timeThreshold = 30 * 60 * 1000; // 30 minutes

        return hasEnoughUpdates || timeSinceLastSummary > timeThreshold;
    }

    async generateSummary() {
        try {
            const summaryId = uuidv4();
            const timestamp = new Date().toISOString();
            
            // Analyze pending updates
            const analysis = this.analyzeUpdates(this.pendingUpdates);
            
            // Create executive summary
            const summary = {
                id: summaryId,
                timestamp,
                executive: this.executive.name,
                timeframe: 'Recent updates',
                criticalAttentionAreas: analysis.criticalAreas,
                resourceAllocation: analysis.resourceNeeds,
                revenueOpportunities: analysis.revenueOps,
                riskFactors: analysis.risks,
                strategicRecommendations: analysis.recommendations,
                executiveSummary: this.createExecutiveSummaryText(analysis),
                sourceUpdates: this.pendingUpdates.length,
                confidence: 0.8
            };

            // Store summary
            this.summaryHistory.push(summary);
            this.totalSummariesGenerated++;
            this.lastSummaryTime = timestamp;

            // Clear pending updates
            this.pendingUpdates = [];

            // Keep only last 20 summaries
            if (this.summaryHistory.length > 20) {
                this.summaryHistory = this.summaryHistory.slice(-10);
            }

            console.log(`Executive summary generated: ${summaryId}`);
            return summary;

        } catch (error) {
            console.error('Error generating executive summary:', error);
            throw error;
        }
    }

    analyzeUpdates(updates) {
        const analysis = {
            criticalAreas: [],
            resourceNeeds: [],
            revenueOps: [],
            risks: [],
            recommendations: []
        };

        // Analyze each update
        updates.forEach(update => {
            const extracted = update.extracted;
            
            // Critical areas from high priority items
            if (extracted.priorities?.length > 0) {
                extracted.priorities.forEach(priority => {
                    if (priority.urgency === 'high') {
                        analysis.criticalAreas.push({
                            area: priority.item,
                            urgency: 'critical',
                            impact: 'operational',
                            recommendedAction: 'Immediate attention required',
                            timeline: 'immediate',
                            source: update.memberName
                        });
                    }
                });
            }

            // Resource allocation needs
            if (extracted.actionItems?.length > 0) {
                extracted.actionItems.forEach(action => {
                    if (action.assignee) {
                        analysis.resourceNeeds.push({
                            resource: action.assignee,
                            currentAllocation: 'Review needed',
                            recommendedChange: `Assign to: ${action.task}`,
                            expectedOutcome: 'Task completion',
                            source: update.memberName
                        });
                    }
                });
            }

            // Revenue opportunities
            if (extracted.revenueInfo?.length > 0) {
                extracted.revenueInfo.forEach(revenue => {
                    analysis.revenueOps.push({
                        opportunity: revenue.opportunity,
                        potentialValue: revenue.value || 'TBD',
                        probability: revenue.probability || 'medium',
                        nextSteps: 'Follow up and assess',
                        source: update.memberName
                    });
                });
            }

            // Risk factors from client issues
            if (extracted.clientInfo?.length > 0) {
                extracted.clientInfo.forEach(client => {
                    if (client.status === 'negative') {
                        analysis.risks.push({
                            risk: `Client satisfaction issue: ${client.client}`,
                            probability: 'medium',
                            impact: 'high',
                            mitigation: 'Immediate client outreach recommended',
                            source: update.memberName
                        });
                    }
                });
            }

            // Technical risks
            if (extracted.technicalInfo?.length > 0) {
                extracted.technicalInfo.forEach(tech => {
                    if (tech.severity === 'high') {
                        analysis.risks.push({
                            risk: tech.issue,
                            probability: 'high',
                            impact: 'operational',
                            mitigation: 'Technical review and resolution needed',
                            source: update.memberName
                        });
                    }
                });
            }
        });

        // Generate strategic recommendations
        analysis.recommendations = this.generateRecommendations(analysis, updates);

        return analysis;
    }

    generateRecommendations(analysis, updates) {
        const recommendations = [];

        // High priority recommendation
        if (analysis.criticalAreas.length > 0) {
            recommendations.push({
                recommendation: `Address ${analysis.criticalAreas.length} critical areas requiring immediate attention`,
                rationale: 'Multiple high-priority items identified across team updates',
                successMetrics: 'Resolution of critical items within 24-48 hours'
            });
        }

        // Resource allocation recommendation
        if (analysis.resourceNeeds.length > 0) {
            recommendations.push({
                recommendation: 'Review current resource allocation and priorities',
                rationale: `${analysis.resourceNeeds.length} resource allocation needs identified`,
                successMetrics: 'Clear task assignments and ownership established'
            });
        }

        // Revenue opportunity recommendation
        if (analysis.revenueOps.length > 0) {
            recommendations.push({
                recommendation: 'Prioritize revenue opportunity follow-up',
                rationale: `${analysis.revenueOps.length} revenue opportunities identified`,
                successMetrics: 'Revenue opportunities converted or qualified within 1 week'
            });
        }

        // Team communication recommendation
        const teamMembers = [...new Set(updates.map(u => u.memberName))];
        if (teamMembers.length > 1) {
            recommendations.push({
                recommendation: 'Ensure cross-team coordination on shared priorities',
                rationale: `Updates from ${teamMembers.length} team members indicate overlapping concerns`,
                successMetrics: 'Alignment meeting scheduled and action items clarified'
            });
        }

        return recommendations;
    }

    createExecutiveSummaryText(analysis) {
        let summary = `🎯 EXECUTIVE SUMMARY\n\n`;

        // Critical attention areas
        if (analysis.criticalAreas.length > 0) {
            summary += `ATTENTION REQUIRED:\n`;
            analysis.criticalAreas.slice(0, 3).forEach(area => {
                summary += `• ${area.area} (${area.source})\n`;
            });
            summary += `\n`;
        }

        // Resource allocation
        if (analysis.resourceNeeds.length > 0) {
            summary += `RESOURCE ALLOCATION:\n`;
            analysis.resourceNeeds.slice(0, 2).forEach(resource => {
                summary += `• ${resource.recommendedChange}\n`;
            });
            summary += `\n`;
        }

        // Revenue opportunities
        if (analysis.revenueOps.length > 0) {
            summary += `REVENUE IMPACT:\n`;
            analysis.revenueOps.slice(0, 2).forEach(rev => {
                summary += `• ${rev.opportunity} - ${rev.potentialValue}\n`;
            });
            summary += `\n`;
        }

        // Top recommendations
        if (analysis.recommendations.length > 0) {
            summary += `NEXT STEPS:\n`;
            analysis.recommendations.slice(0, 3).forEach(rec => {
                summary += `• ${rec.recommendation}\n`;
            });
        }

        return summary;
    }

    async forceGenerateSummary() {
        if (this.pendingUpdates.length === 0) {
            return {
                status: 'no_updates',
                message: 'No pending updates to summarize',
                lastSummary: this.summaryHistory.length > 0 ? 
                            this.summaryHistory[this.summaryHistory.length - 1] : null
            };
        }

        const summary = await this.generateSummary();
        return {
            status: 'summary_generated',
            summary: summary,
            processedUpdates: summary.sourceUpdates,
            forced: true
        };
    }

    getAgentStats() {
        return {
            pendingUpdates: this.pendingUpdates.length,
            totalSummariesGenerated: this.totalSummariesGenerated,
            lastSummaryTime: this.lastSummaryTime,
            nextSummaryIn: this.pendingUpdates.length >= this.summaryThreshold ? 'ready' : 
                          `${this.summaryThreshold - this.pendingUpdates.length} more updates`,
            recentSummaries: this.summaryHistory.slice(-3)
        };
    }
}