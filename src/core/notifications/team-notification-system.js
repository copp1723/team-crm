/**
 * TEAM NOTIFICATION SYSTEM
 * Handles executive comments, team notifications, and real-time communication
 */

import EventEmitter from 'events';

export class TeamNotificationSystem extends EventEmitter {
    constructor(orchestrator, dashboardAPI) {
        super();
        this.orchestrator = orchestrator;
        this.dashboardAPI = dashboardAPI;
        this.activeNotifications = new Map();
        this.notificationHistory = [];
        
        this.setupNotificationHandlers();
    }

    setupNotificationHandlers() {
        // Handle executive comments
        this.on('executiveComment', this.handleExecutiveComment.bind(this));
        this.on('teamReply', this.handleTeamReply.bind(this));
        this.on('urgentAlert', this.handleUrgentAlert.bind(this));
        this.on('dealStatusChange', this.handleDealStatusChange.bind(this));
    }

    /**
     * Process executive comment and notify relevant team members
     */
    async handleExecutiveComment(commentData) {
        const { comment, requiresResponse, dealId, priority } = commentData;
        
        // Determine who should be notified
        const recipients = this.determineRecipients(comment, dealId);
        
        // Create notification
        const notification = {
            id: `notification-${Date.now()}`,
            type: 'executive_comment',
            source: 'Tre',
            message: comment.message,
            priority: priority || 'medium',
            recipients,
            dealId,
            commentId: comment.id,
            requiresResponse,
            timestamp: new Date().toISOString(),
            status: 'active',
            responses: []
        };

        // Store notification
        this.activeNotifications.set(notification.id, notification);
        this.notificationHistory.push(notification);

        // Send to team members
        for (const recipient of recipients) {
            await this.sendNotificationToMember(recipient, notification);
        }

        // If urgent, create high-priority alert
        if (priority === 'high' || requiresResponse) {
            this.createUrgentAlert({
                title: 'Executive Question Requires Response',
                message: `Tre: "${comment.message.substring(0, 100)}..."`,
                dealId,
                commentId: comment.id
            });
        }

        return notification;
    }

    /**
     * Handle team member replies to executive comments
     */
    async handleTeamReply(replyData) {
        const { commentId, reply, memberName } = replyData;
        
        // Find the original notification
        const notification = Array.from(this.activeNotifications.values())
            .find(n => n.commentId === commentId);

        if (notification) {
            notification.responses.push({
                author: memberName,
                message: reply.message,
                timestamp: new Date().toISOString()
            });

            // If question was answered, mark as resolved
            if (notification.requiresResponse) {
                notification.status = 'resolved';
                notification.resolvedAt = new Date().toISOString();
            }

            // Notify Tre of the response
            this.notifyExecutiveOfResponse(notification, reply, memberName);
        }
    }

    /**
     * Handle urgent alerts that need immediate attention
     */
    async handleUrgentAlert(alertData) {
        const alert = {
            id: `alert-${Date.now()}`,
            type: 'urgent',
            title: alertData.title,
            message: alertData.message,
            dealId: alertData.dealId,
            priority: 'critical',
            timestamp: new Date().toISOString(),
            status: 'active'
        };

        // Add to dashboard alerts
        if (this.dashboardAPI) {
            this.dashboardAPI.alerts.unshift(alert);
        }

        // Broadcast to all connected clients
        this.orchestrator.emit('alertTriggered', alert);

        return alert;
    }

    /**
     * Handle deal status changes and notify relevant parties
     */
    async handleDealStatusChange(changeData) {
        const { dealId, previousStage, newStage, value, owner } = changeData;
        
        // Create notification for significant stage changes
        if (this.isSignificantStageChange(previousStage, newStage)) {
            const notification = {
                id: `deal-change-${Date.now()}`,
                type: 'deal_progression',
                dealId,
                previousStage,
                newStage,
                value,
                owner,
                timestamp: new Date().toISOString(),
                message: `Deal moved from ${previousStage} to ${newStage} (${this.formatCurrency(value)})`
            };

            // Notify executive dashboard
            this.orchestrator.emit('dealUpdated', {
                dealId,
                change: notification
            });

            // If deal closed or at risk, create alert
            if (newStage === 'closed_won') {
                this.createUrgentAlert({
                    title: 'Deal Closed Won!',
                    message: `${this.formatCurrency(value)} deal successfully closed by ${owner}`,
                    dealId
                });
            } else if (newStage === 'at_risk') {
                this.createUrgentAlert({
                    title: 'Deal At Risk',
                    message: `${this.formatCurrency(value)} deal needs immediate attention`,
                    dealId
                });
            }
        }
    }

    /**
     * Determine which team members should receive the notification
     */
    determineRecipients(comment, dealId = null) {
        const recipients = [];
        
        // If comment mentions specific deal, notify deal owner
        if (dealId && this.dashboardAPI) {
            const deal = this.dashboardAPI.dealsPipeline.get(dealId);
            if (deal && deal.owner) {
                recipients.push(deal.owner);
            }
        }

        // Check for mentions in comment text
        const commentLower = comment.message.toLowerCase();
        if (commentLower.includes('joe')) recipients.push('joe');
        if (commentLower.includes('charlie')) recipients.push('charlie');
        
        // If no specific recipients, notify all active team members
        if (recipients.length === 0) {
            const teamMembers = this.orchestrator.getTeamMembers();
            recipients.push(...teamMembers.map(m => m.key));
        }

        return [...new Set(recipients)]; // Remove duplicates
    }

    /**
     * Send notification to specific team member
     */
    async sendNotificationToMember(memberKey, notification) {
        const member = this.orchestrator.getTeamMembers()
            .find(m => m.key === memberKey);
        
        if (!member) {
            console.warn(`Team member not found: ${memberKey}`);
            return;
        }

        // Create personalized notification message
        const personalizedNotification = {
            ...notification,
            recipient: member.name,
            personalizedMessage: this.personalizeMessage(notification, member)
        };

        // Emit to WebSocket for real-time delivery
        this.orchestrator.emit('memberNotification', {
            memberKey,
            notification: personalizedNotification
        });

        // Store for member's notification history
        const assistant = this.orchestrator.getPersonalAssistant(memberKey);
        if (assistant && assistant.addNotification) {
            assistant.addNotification(personalizedNotification);
        }

        console.log(`Notification sent to ${member.name}: ${notification.message}`);
    }

    /**
     * Personalize notification message for specific team member
     */
    personalizeMessage(notification, member) {
        const baseMessage = notification.message;
        
        if (notification.type === 'executive_comment') {
            if (notification.dealId) {
                return `Tre has a question about one of your deals: "${baseMessage}"`;
            } else {
                return `Tre has a question for the team: "${baseMessage}"`;
            }
        }
        
        return baseMessage;
    }

    /**
     * Notify executive of team responses
     */
    notifyExecutiveOfResponse(notification, reply, memberName) {
        const executiveNotification = {
            type: 'team_response',
            originalQuestion: notification.message,
            response: reply.message,
            respondent: memberName,
            timestamp: new Date().toISOString(),
            dealId: notification.dealId
        };

        // Emit to dashboard for real-time update
        this.orchestrator.emit('commentReply', {
            commentId: notification.commentId,
            reply: {
                ...reply,
                author: memberName
            }
        });

        console.log(`Executive notified of response from ${memberName}`);
    }

    /**
     * Create urgent alert
     */
    createUrgentAlert(alertData) {
        this.emit('urgentAlert', alertData);
    }

    /**
     * Check if stage change is significant enough to notify
     */
    isSignificantStageChange(previousStage, newStage) {
        const significantChanges = [
            'qualified_to_proposal',
            'proposal_to_negotiation', 
            'negotiation_to_closed_won',
            'any_to_closed_lost',
            'any_to_at_risk'
        ];
        
        return significantChanges.some(change => {
            const [from, to] = change.split('_to_');
            return (from === 'any' || from === previousStage) && 
                   (to === 'any' || to === newStage);
        });
    }

    /**
     * Get notification history for analytics
     */
    getNotificationHistory(days = 7) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return this.notificationHistory.filter(n => 
            new Date(n.timestamp) >= cutoff
        );
    }

    /**
     * Get active notifications requiring attention
     */
    getActiveNotifications() {
        return Array.from(this.activeNotifications.values())
            .filter(n => n.status === 'active');
    }

    /**
     * Mark notification as read/resolved
     */
    resolveNotification(notificationId) {
        const notification = this.activeNotifications.get(notificationId);
        if (notification) {
            notification.status = 'resolved';
            notification.resolvedAt = new Date().toISOString();
        }
    }

    /**
     * Get notification analytics
     */
    getNotificationAnalytics(days = 30) {
        const history = this.getNotificationHistory(days);
        
        return {
            total_notifications: history.length,
            by_type: this.groupByProperty(history, 'type'),
            by_priority: this.groupByProperty(history, 'priority'),
            response_rate: this.calculateResponseRate(history),
            average_response_time: this.calculateAverageResponseTime(history),
            most_active_recipients: this.getMostActiveRecipients(history)
        };
    }

    // Utility methods
    groupByProperty(array, property) {
        return array.reduce((groups, item) => {
            const key = item[property];
            groups[key] = (groups[key] || 0) + 1;
            return groups;
        }, {});
    }

    calculateResponseRate(notifications) {
        const questionsAsked = notifications.filter(n => n.requiresResponse).length;
        const questionsAnswered = notifications.filter(n => 
            n.requiresResponse && n.responses.length > 0
        ).length;
        
        return questionsAsked > 0 ? 
            Math.round((questionsAnswered / questionsAsked) * 100) : 0;
    }

    calculateAverageResponseTime(notifications) {
        const respondedNotifications = notifications.filter(n => 
            n.requiresResponse && n.responses.length > 0
        );
        
        if (respondedNotifications.length === 0) return 0;
        
        const totalResponseTime = respondedNotifications.reduce((sum, n) => {
            const questionTime = new Date(n.timestamp);
            const responseTime = new Date(n.responses[0].timestamp);
            return sum + (responseTime - questionTime);
        }, 0);
        
        const averageMs = totalResponseTime / respondedNotifications.length;
        return Math.round(averageMs / (1000 * 60)); // Convert to minutes
    }

    getMostActiveRecipients(notifications) {
        const recipientCounts = {};
        notifications.forEach(n => {
            n.recipients.forEach(recipient => {
                recipientCounts[recipient] = (recipientCounts[recipient] || 0) + 1;
            });
        });
        
        return Object.entries(recipientCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([recipient, count]) => ({ recipient, count }));
    }

    /**
     * Process webhook notifications
     */
    async processWebhookNotification(webhookResult) {
        if (webhookResult.type === 'team_update') {
            const notification = {
                id: `webhook-${Date.now()}`,
                type: 'external_update',
                source: webhookResult.source,
                message: `New ${webhookResult.source} update: ${webhookResult.data.message}`,
                priority: 'medium',
                timestamp: new Date().toISOString(),
                metadata: webhookResult.data
            };

            this.orchestrator.emit('externalUpdate', notification);
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }
}