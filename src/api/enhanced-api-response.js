/**
 * ENHANCED API RESPONSE SYSTEM
 * Provides structured, reliable, and informative API responses
 */

export class EnhancedAPIResponse {
    
    /**
     * Create a successful update processing response
     */
    static createUpdateSuccess(processingResult) {
        const analysis = processingResult.extracted?.detailedAnalysis || {};
        
        return {
            success: true,
            timestamp: new Date().toISOString(),
            updateId: processingResult.updateId,
            memberName: processingResult.memberName,
            
            // Core extraction data (backward compatible)
            extracted: {
                totalItems: processingResult.extracted?.totalItems || 0,
                priorities: processingResult.extracted?.priorities || [],
                actionItems: processingResult.extracted?.actionItems || [],
                clientInfo: processingResult.extracted?.clientInfo || [],
                technicalInfo: processingResult.extracted?.technicalInfo || [],
                revenueInfo: processingResult.extracted?.revenueInfo || [],
                keyInsights: processingResult.extracted?.keyInsights || []
            },
            
            // Enhanced analysis data
            analysis: {
                confidence: analysis.confidence || 0.5,
                processingTime: processingResult.processingTime || 0,
                processingMethod: processingResult.fallbackUsed ? 'fallback' : 'ai',
                
                // Detailed structured data
                actionItems: (analysis.actionItemsDetailed || []).map(item => ({
                    id: item.id,
                    text: item.text,
                    priority: item.priority,
                    assignee: item.assignee,
                    deadline: item.deadline,
                    confidence: item.confidence,
                    urgency: this.mapPriorityToUrgency(item.priority)
                })),
                
                clients: (analysis.clientsDetailed || []).map(client => ({
                    name: client.name,
                    status: client.status,
                    dealValue: client.dealValue,
                    riskLevel: this.assessRiskLevel(client),
                    opportunities: client.opportunities || [],
                    riskFactors: client.riskFactors || [],
                    confidence: client.confidence
                })),
                
                priorities: (analysis.prioritiesDetailed || []).map(priority => ({
                    item: priority.item,
                    urgency: priority.urgency,
                    businessImpact: priority.businessImpact,
                    confidence: priority.confidence
                })),
                
                sentiment: {
                    overall: analysis.sentimentAnalysis?.overall || 'neutral',
                    confidence: analysis.sentimentAnalysis?.confidence || 0.5,
                    factors: analysis.sentimentAnalysis?.factors || []
                },
                
                executiveEscalation: {
                    required: analysis.executiveEscalation?.required || false,
                    urgency: analysis.executiveEscalation?.urgency || 'low',
                    reason: analysis.executiveEscalation?.reason || null,
                    suggestedAction: analysis.executiveEscalation?.suggestedAction || null
                }
            },
            
            // Actionable recommendations
            recommendations: this.generateRecommendations(processingResult),
            
            // Quality indicators
            quality: {
                confidence: analysis.confidence || 0.5,
                completeness: this.assessCompleteness(processingResult),
                actionability: this.assessActionability(processingResult),
                businessValue: this.assessBusinessValue(processingResult)
            },
            
            // System metadata
            metadata: {
                apiVersion: '2.0.0',
                processingVersion: processingResult.aiResult?.metadata?.processingVersion || '1.0.0',
                modelUsed: processingResult.aiResult?.metadata?.modelUsed || 'unknown',
                fallbackUsed: processingResult.fallbackUsed || false,
                processingTime: processingResult.processingTime || 0
            }
        };
    }
    
    /**
     * Create an error response with helpful information
     */
    static createError(error, context = {}) {
        const errorType = this.classifyError(error);
        
        return {
            success: false,
            timestamp: new Date().toISOString(),
            error: {
                type: errorType.type,
                message: errorType.userMessage,
                code: errorType.code,
                retryable: errorType.retryable,
                estimatedRetryTime: errorType.estimatedRetryTime
            },
            context: {
                memberName: context.memberName,
                requestId: context.requestId,
                endpoint: context.endpoint
            },
            support: {
                documentation: 'https://team-crm-foundation.local/api/docs',
                troubleshooting: this.getTroubleshootingSteps(errorType),
                contactSupport: errorType.severity === 'high'
            },
            metadata: {
                apiVersion: '2.0.0',
                timestamp: new Date().toISOString()
            }
        };
    }
    
    /**
     * Create a processing status response (for async operations)
     */
    static createProcessingStatus(updateId, status, progress = null) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            updateId,
            status, // 'queued', 'processing', 'completed', 'failed'
            progress: progress || {
                percentage: status === 'completed' ? 100 : (status === 'processing' ? 50 : 0),
                currentStep: this.getStatusDescription(status),
                estimatedTimeRemaining: this.getEstimatedTime(status)
            },
            metadata: {
                apiVersion: '2.0.0'
            }
        };
    }
    
    /**
     * Create health check response
     */
    static createHealthResponse(systemHealth) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            status: systemHealth.status,
            services: {
                ai: {
                    status: systemHealth.components?.ai?.status || 'unknown',
                    responseTime: systemHealth.components?.ai?.responseTime || null,
                    successRate: systemHealth.components?.ai?.successRate || null
                },
                database: {
                    status: systemHealth.components?.database?.status || 'unknown',
                    connectionPool: systemHealth.components?.database?.connectionPool || null
                },
                memory: {
                    heapUsed: systemHealth.components?.memory?.heapUsed || null,
                    uptime: systemHealth.components?.memory?.uptime || null
                }
            },
            performance: {
                averageResponseTime: systemHealth.performance?.averageResponseTime || null,
                requestsPerMinute: systemHealth.performance?.requestsPerMinute || null,
                errorRate: systemHealth.performance?.errorRate || null
            },
            issues: systemHealth.recentErrors || [],
            metadata: {
                apiVersion: '2.0.0',
                systemVersion: systemHealth.version || '1.0.0'
            }
        };
    }
    
    // Helper methods
    
    static mapPriorityToUrgency(priority) {
        if (priority >= 4) return 'critical';
        if (priority >= 3) return 'high';
        if (priority >= 2) return 'medium';
        return 'low';
    }
    
    static assessRiskLevel(client) {
        if (client.status === 'lost') return 'lost';
        if (client.status === 'at_risk') return 'high';
        if (client.riskFactors && client.riskFactors.length > 2) return 'medium';
        if (client.riskFactors && client.riskFactors.length > 0) return 'low';
        return 'minimal';
    }
    
    static generateRecommendations(processingResult) {
        const recommendations = [];
        const analysis = processingResult.extracted?.detailedAnalysis || {};
        
        // Executive escalation recommendations
        if (analysis.executiveEscalation?.required) {
            recommendations.push({
                type: 'escalation',
                priority: 'high',
                action: analysis.executiveEscalation.suggestedAction || 'Schedule executive review',
                reason: analysis.executiveEscalation.reason
            });
        }
        
        // High-priority action item recommendations
        const highPriorityActions = (analysis.actionItemsDetailed || [])
            .filter(item => item.priority >= 4);
        
        if (highPriorityActions.length > 0) {
            recommendations.push({
                type: 'urgent_action',
                priority: 'high',
                action: `Address ${highPriorityActions.length} urgent action item(s)`,
                details: highPriorityActions.map(item => item.text)
            });
        }
        
        // Client risk recommendations
        const riskClients = (analysis.clientsDetailed || [])
            .filter(client => client.status === 'at_risk');
        
        if (riskClients.length > 0) {
            recommendations.push({
                type: 'client_risk',
                priority: 'medium',
                action: `Review ${riskClients.length} at-risk client(s)`,
                details: riskClients.map(client => client.name)
            });
        }
        
        // Follow-up recommendations
        if (analysis.confidence < 0.7) {
            recommendations.push({
                type: 'clarification',
                priority: 'low',
                action: 'Request clarification on unclear items',
                reason: 'Low confidence in some extracted information'
            });
        }
        
        return recommendations;
    }
    
    static assessCompleteness(processingResult) {
        const extracted = processingResult.extracted || {};
        const totalItems = extracted.totalItems || 0;
        
        if (totalItems === 0) return 0.1;
        if (totalItems < 3) return 0.5;
        if (totalItems < 6) return 0.7;
        return 0.9;
    }
    
    static assessActionability(processingResult) {
        const analysis = processingResult.extracted?.detailedAnalysis || {};
        const actionItems = analysis.actionItemsDetailed || [];
        const hasDeadlines = actionItems.some(item => item.deadline);
        const hasAssignees = actionItems.some(item => item.assignee);
        
        let score = 0.3; // Base score
        if (actionItems.length > 0) score += 0.3;
        if (hasDeadlines) score += 0.2;
        if (hasAssignees) score += 0.2;
        
        return Math.min(score, 1.0);
    }
    
    static assessBusinessValue(processingResult) {
        const analysis = processingResult.extracted?.detailedAnalysis || {};
        const hasRevenue = (analysis.clientsDetailed || []).some(client => client.dealValue);
        const hasEscalation = analysis.executiveEscalation?.required;
        const hasClients = (analysis.clientsDetailed || []).length > 0;
        
        let score = 0.2; // Base score
        if (hasClients) score += 0.3;
        if (hasRevenue) score += 0.3;
        if (hasEscalation) score += 0.2;
        
        return Math.min(score, 1.0);
    }
    
    static classifyError(error) {
        const message = error.message || error.toString();
        
        if (message.includes('API') || message.includes('fetch')) {
            return {
                type: 'ai_service_error',
                code: 'AI_SERVICE_BUSY',
                userMessage: 'The AI service is temporarily busy. Your update was saved and we\'ll process it as soon as possible.',
                retryable: true,
                estimatedRetryTime: '2-5 minutes',
                severity: 'medium'
            };
        }
        
        if (message.includes('timeout')) {
            return {
                type: 'timeout_error',
                code: 'TOOK_TOO_LONG',
                userMessage: 'Processing took longer than expected. Try breaking your update into smaller parts.',
                retryable: true,
                estimatedRetryTime: '30 seconds',
                severity: 'low'
            };
        }
        
        if (message.includes('validation') || message.includes('Invalid')) {
            return {
                type: 'validation_error',
                code: 'INVALID_INPUT',
                userMessage: 'Something\'s not right with the update format. Please check and try again.',
                retryable: false,
                estimatedRetryTime: null,
                severity: 'low'
            };
        }
        
        return {
            type: 'system_error',
            code: 'SOMETHING_WENT_WRONG',
            userMessage: 'Something unexpected happened. We\'ve been notified and will look into it.',
            retryable: true,
            estimatedRetryTime: '5-10 minutes',
            severity: 'high'
        };
    }
    
    static getTroubleshootingSteps(errorType) {
        const steps = {
            'ai_service_error': [
                'Wait a couple minutes and try again',
                'Check your internet connection',
                'Try a shorter update if yours was really long'
            ],
            'timeout_error': [
                'Break your update into smaller chunks',
                'Try again with less text',
                'Make sure your connection is stable'
            ],
            'validation_error': [
                'Make sure your update is between 10-10,000 characters',
                'Remove any weird formatting or special characters',
                'Double-check that you selected your name'
            ],
            'system_error': [
                'Wait a few minutes and try again',
                'Check if others are having the same issue',
                'Reach out to support if it keeps happening'
            ]
        };
        
        return steps[errorType.type] || steps['system_error'];
    }
    
    static getStatusDescription(status) {
        const descriptions = {
            'queued': 'Update queued for processing',
            'processing': 'AI analysis in progress',
            'completed': 'Processing completed successfully',
            'failed': 'Processing failed'
        };
        
        return descriptions[status] || 'Unknown status';
    }
    
    static getEstimatedTime(status) {
        const times = {
            'queued': '15-30 seconds',
            'processing': '10-20 seconds',
            'completed': '0 seconds',
            'failed': null
        };
        
        return times[status];
    }
}
