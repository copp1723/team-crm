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
            
            // Calculate priority score including keyword analysis
            const priorityScore = this.calculatePriorityScore(structuredUpdate);
            structuredUpdate.priorityScore = priorityScore;
            
            // Add to pending updates
            this.pendingUpdates.push(structuredUpdate);
            
            // Check if we should generate a summary (including keyword escalation)
            const shouldGenerateSummary = this.shouldGenerateSummary(structuredUpdate);
            
            if (shouldGenerateSummary) {
                const summary = await this.generateSummary();
                return {
                    status: 'summary_generated',
                    summary: summary,
                    processedUpdates: this.pendingUpdates.length,
                    updateReceived: true,
                    keywordEscalated: structuredUpdate.keywordAnalysis?.shouldEscalate || false
                };
            }
            
            return {
                status: 'update_received',
                pendingUpdates: this.pendingUpdates.length,
                nextSummaryIn: this.summaryThreshold - this.pendingUpdates.length,
                priorityScore: priorityScore,
                keywordBoost: structuredUpdate.keywordAnalysis?.priorityBoost || 0
            };

        } catch (error) {
            console.error('Error in Master Agent receiving update:', error);
            throw error;
        }
    }
    
    /**
     * Receive email escalation for executive attention
     */
    async receiveEscalation(escalation) {
        try {
            console.log(`Master Agent received escalation: ${escalation.subject}`);
            
            // Create high-priority update from escalation
            const escalationUpdate = {
                id: `escalation_${Date.now()}`,
                memberName: 'Email System',
                timestamp: escalation.timestamp,
                source: 'email_escalation',
                extracted: {
                    priorities: [{
                        item: `Email escalation: ${escalation.subject}`,
                        urgency: 'high',
                        source: escalation.source.address || escalation.source
                    }],
                    emailEscalation: {
                        from: escalation.source,
                        subject: escalation.subject,
                        reason: escalation.reason,
                        urgency: escalation.urgency
                    }
                },
                priorityScore: 50, // High priority for escalations
                requires_attention: true
            };
            
            // Add to pending updates
            this.pendingUpdates.push(escalationUpdate);
            
            // Force summary generation for escalations
            const summary = await this.generateSummary();
            
            return {
                status: 'escalation_processed',
                summary: summary,
                escalation: escalation
            };
            
        } catch (error) {
            console.error('Error processing email escalation:', error);
            throw error;
        }
    }

    shouldGenerateSummary(latestUpdate = null) {
        // Generate summary if:
        // 1. We have enough pending updates
        // 2. Or it's been more than 30 minutes since last summary
        // 3. Or keyword analysis indicates escalation is needed
        const hasEnoughUpdates = this.pendingUpdates.length >= this.summaryThreshold;
        const timeSinceLastSummary = this.lastSummaryTime ?
            Date.now() - new Date(this.lastSummaryTime).getTime() : Infinity;
        const timeThreshold = 30 * 60 * 1000; // 30 minutes

        // Check for keyword escalation
        const keywordEscalation = latestUpdate?.keywordAnalysis?.shouldEscalate || false;
        
        // Check if total priority boost warrants immediate summary
        const totalPriorityBoost = this.pendingUpdates.reduce((sum, update) =>
            sum + (update.keywordAnalysis?.priorityBoost || 0), 0);
        const priorityEscalation = totalPriorityBoost >= 20; // Configurable threshold

        if (keywordEscalation || priorityEscalation) {
            console.log('Executive summary triggered by keyword analysis:', {
                keywordEscalation,
                priorityEscalation,
                totalPriorityBoost,
                latestKeywords: latestUpdate?.keywordAnalysis?.foundKeywords?.length || 0
            });
        }

        return hasEnoughUpdates || timeSinceLastSummary > timeThreshold ||
               keywordEscalation || priorityEscalation;
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
                keywordInsights: analysis.keywordInsights,
                confidence: this.calculateSummaryConfidence(analysis)
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

        // Add keyword-based insights
        analysis.keywordInsights = this.analyzeKeywordPatterns(updates);
        
        // Add email escalation insights
        analysis.emailEscalations = this.analyzeEmailEscalations(updates);

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

    /**
     * Calculate priority score for an update including keyword analysis
     */
    calculatePriorityScore(update) {
        let score = 0;
        const extracted = update.extracted;

        // Base priority scoring from existing business logic
        if (extracted.priorities?.length > 0) {
            const highPriorities = extracted.priorities.filter(p => p.urgency === 'high').length;
            score += highPriorities * 10;
        }

        if (extracted.revenueInfo?.length > 0) {
            score += extracted.revenueInfo.length * 15;
        }

        if (extracted.clientInfo?.length > 0) {
            const negativeClient = extracted.clientInfo.filter(c => c.status === 'negative').length;
            score += negativeClient * 12;
        }

        if (extracted.technicalInfo?.length > 0) {
            const criticalTech = extracted.technicalInfo.filter(t => t.severity === 'high').length;
            score += criticalTech * 8;
        }

        // Add keyword priority boost if available
        if (update.keywordAnalysis?.priorityBoost) {
            score += update.keywordAnalysis.priorityBoost;
            console.log(`Priority boost applied: +${update.keywordAnalysis.priorityBoost} for ${update.memberName}`);
        }

        return score;
    }

    createExecutiveSummaryText(analysis) {
        let summary = `🎯 EXECUTIVE SUMMARY\n\n`;

        // Keyword alerts (if any high-priority keywords detected)
        if (analysis.keywordInsights?.criticalKeywords?.length > 0) {
            summary += `🚨 KEYWORD ALERTS:\n`;
            analysis.keywordInsights.criticalKeywords.slice(0, 3).forEach(keyword => {
                summary += `• ${keyword.keyword} (${keyword.priority}) - ${keyword.context}\n`;
            });
            summary += `\n`;
        }

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

        // Email escalations
        if (analysis.emailEscalations?.count > 0) {
            summary += `📧 EMAIL ESCALATIONS:\n`;
            summary += `• ${analysis.emailEscalations.count} emails escalated to executive attention\n`;
            analysis.emailEscalations.subjects.slice(0, 2).forEach(subject => {
                summary += `• ${subject}\n`;
            });
            summary += `\n`;
        }
        
        // Keyword summary
        if (analysis.keywordInsights?.totalKeywords > 0) {
            summary += `KEYWORD INTELLIGENCE:\n`;
            summary += `• ${analysis.keywordInsights.totalKeywords} keywords detected across ${analysis.keywordInsights.updatesWithKeywords} updates\n`;
            summary += `• Total priority boost: +${analysis.keywordInsights.totalPriorityBoost}\n`;
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

    /**
     * Analyze keyword patterns across updates
     */
    analyzeKeywordPatterns(updates) {
        const insights = {
            totalKeywords: 0,
            totalPriorityBoost: 0,
            updatesWithKeywords: 0,
            criticalKeywords: [],
            keywordsByPriority: {
                critical: [],
                high: [],
                medium: [],
                low: []
            }
        };

        updates.forEach(update => {
            if (update.keywordAnalysis?.foundKeywords?.length > 0) {
                insights.updatesWithKeywords++;
                insights.totalKeywords += update.keywordAnalysis.foundKeywords.length;
                insights.totalPriorityBoost += update.keywordAnalysis.priorityBoost || 0;

                // Categorize keywords by priority
                update.keywordAnalysis.foundKeywords.forEach(keywordMatch => {
                    const keywordData = {
                        keyword: keywordMatch.keyword,
                        priority: keywordMatch.priority,
                        context: keywordMatch.context,
                        source: update.memberName
                    };

                    insights.keywordsByPriority[keywordMatch.priority].push(keywordData);

                    // Add to critical keywords if high priority
                    if (keywordMatch.priority === 'critical' || keywordMatch.priority === 'high') {
                        insights.criticalKeywords.push(keywordData);
                    }
                });
            }
        });

        return insights;
    }
    
    /**
     * Analyze email escalations in updates
     */
    analyzeEmailEscalations(updates) {
        const escalations = updates.filter(update => update.source === 'email_escalation');
        
        if (escalations.length === 0) {
            return null;
        }
        
        return {
            count: escalations.length,
            urgencyLevels: escalations.reduce((acc, esc) => {
                const urgency = esc.extracted?.emailEscalation?.urgency || 'medium';
                acc[urgency] = (acc[urgency] || 0) + 1;
                return acc;
            }, {}),
            subjects: escalations.map(esc => esc.extracted?.emailEscalation?.subject).filter(Boolean),
            sources: escalations.map(esc => esc.extracted?.emailEscalation?.from?.address).filter(Boolean)
        };
    }

    /**
     * Calculate confidence score based on analysis quality
     */
    calculateSummaryConfidence(analysis) {
        let confidence = 0.8; // Base confidence

        // Boost confidence if we have keyword analysis
        if (analysis.keywordInsights?.totalKeywords > 0) {
            confidence += 0.1;
        }

        // Reduce confidence if very few data points
        if (analysis.criticalAreas.length === 0 && analysis.revenueOps.length === 0) {
            confidence -= 0.2;
        }

        // Boost confidence for more data sources
        const uniqueSources = new Set(
            [...(analysis.criticalAreas || []), ...(analysis.revenueOps || [])]
                .map(item => item.source)
        ).size;
        
        if (uniqueSources > 2) {
            confidence += 0.1;
        }

        return Math.min(Math.max(confidence, 0.3), 1.0); // Clamp between 0.3 and 1.0
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