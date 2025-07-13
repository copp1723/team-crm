/**
 * Calendar API endpoints for calendar integration with personal assistants
 */

import express from 'express';
import { logger } from '../utils/logger.js';
import { CalendarIntelligence } from '../core/calendar/calendar-intelligence.js';
import { CalendarService } from '../core/calendar/calendar-service.js';

export class CalendarAPI {
    constructor(orchestrator) {
        this.logger = logger.child({ component: 'CalendarAPI' });
        this.orchestrator = orchestrator;
        this.calendarIntelligence = new CalendarIntelligence();
        this.calendarService = new CalendarService();
        
        // Track API usage metrics
        this.metrics = {
            invitesProcessed: 0,
            queriesHandled: 0,
            eventsCreated: 0,
            conflictsDetected: 0
        };
        
        this.logger.info('Calendar API initialized');
    }

    /**
     * Register calendar API endpoints
     */
    registerEndpoints(app) {
        const router = express.Router();

        // Process calendar invite through personal assistant
        router.post('/invites/process', async (req, res) => {
            try {
                const { memberName, emailData } = req.body;
                
                if (!memberName || !emailData) {
                    return res.status(400).json({
                        success: false,
                        error: 'Member name and email data are required'
                    });
                }
                
                // Get the member's personal assistant
                const assistant = this.orchestrator?.getPersonalAssistant?.(memberName);
                if (!assistant) {
                    return res.status(404).json({
                        success: false,
                        error: `Personal assistant not found for member: ${memberName}`
                    });
                }
                
                // Process the calendar invite
                const result = await assistant.processCalendarInvite(emailData);
                
                if (result.success && result.isMeetingRelated) {
                    this.metrics.invitesProcessed++;
                    if (result.conflicts?.length > 0) {
                        this.metrics.conflictsDetected++;
                    }
                }
                
                this.logger.info('Calendar invite processed via API', {
                    memberName,
                    success: result.success,
                    isMeetingRelated: result.isMeetingRelated,
                    hasConflicts: result.conflicts?.length > 0
                });
                
                res.json({
                    success: true,
                    data: result,
                    memberName,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to process calendar invite via API', {
                    error: error.message,
                    memberName: req.body.memberName
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Handle natural language schedule queries
        router.post('/schedule/query', async (req, res) => {
            try {
                const { memberName, query, context = {} } = req.body;
                
                if (!memberName || !query) {
                    return res.status(400).json({
                        success: false,
                        error: 'Member name and query are required'
                    });
                }
                
                // Get the member's personal assistant
                const assistant = this.orchestrator?.getPersonalAssistant?.(memberName);
                if (!assistant) {
                    return res.status(404).json({
                        success: false,
                        error: `Personal assistant not found for member: ${memberName}`
                    });
                }
                
                // Process the schedule query
                const result = await assistant.handleScheduleQuery(query, context);
                
                if (result.success) {
                    this.metrics.queriesHandled++;
                }
                
                this.logger.info('Schedule query processed via API', {
                    memberName,
                    query: query.substring(0, 100),
                    intent: result.intent,
                    success: result.success
                });
                
                res.json({
                    success: true,
                    data: result,
                    memberName,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to process schedule query via API', {
                    error: error.message,
                    memberName: req.body.memberName,
                    query: req.body.query
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get calendar overview for a member
        router.get('/overview/:memberName', async (req, res) => {
            try {
                const { memberName } = req.params;
                const { timeframe = 'week' } = req.query;
                
                // Get the member's personal assistant
                const assistant = this.orchestrator?.getPersonalAssistant?.(memberName);
                if (!assistant) {
                    return res.status(404).json({
                        success: false,
                        error: `Personal assistant not found for member: ${memberName}`
                    });
                }
                
                // Get calendar overview
                const result = await assistant.getCalendarOverview(timeframe);
                
                this.logger.info('Calendar overview retrieved via API', {
                    memberName,
                    timeframe,
                    success: result.success
                });
                
                res.json({
                    success: true,
                    data: result.overview,
                    memberName,
                    timeframe,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to get calendar overview via API', {
                    error: error.message,
                    memberName: req.params.memberName
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get executive calendar visibility across all members
        router.get('/executive/overview', async (req, res) => {
            try {
                const { timeframe = 'week' } = req.query;
                
                // Get all personal assistants
                const assistants = this.orchestrator?.getAllPersonalAssistants?.() || {};
                const memberNames = Object.keys(assistants);
                
                if (memberNames.length === 0) {
                    return res.json({
                        success: true,
                        data: {
                            members: {},
                            summary: {
                                totalMembers: 0,
                                pendingInvites: 0,
                                schedulingConflicts: 0,
                                recentActivity: 0
                            }
                        },
                        timeframe,
                        timestamp: new Date().toISOString()
                    });
                }
                
                const memberOverviews = {};
                let totalPendingInvites = 0;
                let totalConflicts = 0;
                let totalActivity = 0;
                
                // Get overview for each member
                for (const memberName of memberNames) {
                    const assistant = assistants[memberName];
                    if (assistant && typeof assistant.getCalendarOverview === 'function') {
                        const overview = await assistant.getCalendarOverview(timeframe);
                        if (overview.success) {
                            memberOverviews[memberName] = overview.overview;
                            totalPendingInvites += overview.overview.metrics.pendingInvites || 0;
                            totalActivity += overview.overview.metrics.queriesHandled || 0;
                            
                            // Count conflicts
                            const conflicts = overview.overview.insights.filter(
                                insight => insight.type === 'scheduling_conflicts'
                            );
                            totalConflicts += conflicts.reduce((sum, conflict) => sum + conflict.count, 0);
                        }
                    }
                }
                
                // Generate executive insights
                const executiveInsights = this.generateExecutiveCalendarInsights(memberOverviews);
                
                this.logger.info('Executive calendar overview generated', {
                    membersAnalyzed: memberNames.length,
                    totalPendingInvites,
                    totalConflicts,
                    insights: executiveInsights.length
                });
                
                res.json({
                    success: true,
                    data: {
                        members: memberOverviews,
                        insights: executiveInsights,
                        summary: {
                            totalMembers: memberNames.length,
                            pendingInvites: totalPendingInvites,
                            schedulingConflicts: totalConflicts,
                            recentActivity: totalActivity
                        }
                    },
                    timeframe,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to generate executive calendar overview', {
                    error: error.message
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get calendar statistics for all members
        router.get('/stats/all', async (req, res) => {
            try {
                // Get all personal assistants
                const assistants = this.orchestrator?.getAllPersonalAssistants?.() || {};
                const memberStats = {};
                
                for (const [memberName, assistant] of Object.entries(assistants)) {
                    if (assistant && typeof assistant.getCalendarStats === 'function') {
                        memberStats[memberName] = assistant.getCalendarStats();
                    }
                }
                
                // Calculate aggregate stats
                const aggregateStats = this.calculateAggregateCalendarStats(memberStats);
                
                res.json({
                    success: true,
                    data: {
                        members: memberStats,
                        aggregate: aggregateStats,
                        apiMetrics: this.metrics
                    },
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to get calendar statistics', {
                    error: error.message
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create calendar event through assistant
        router.post('/events/create', async (req, res) => {
            try {
                const { memberName, eventData } = req.body;
                
                if (!memberName || !eventData) {
                    return res.status(400).json({
                        success: false,
                        error: 'Member name and event data are required'
                    });
                }
                
                // Create event through calendar service
                const result = await this.calendarService.createEvent(memberName, eventData);
                
                if (result.success) {
                    this.metrics.eventsCreated++;
                    
                    // Notify assistant of new event
                    const assistant = this.orchestrator?.getPersonalAssistant?.(memberName);
                    if (assistant && typeof assistant.storeCalendarMemory === 'function') {
                        await assistant.storeCalendarMemory({
                            type: 'event_created',
                            timestamp: new Date().toISOString(),
                            data: result.event,
                            context: {
                                createdViaAPI: true,
                                priority: 'normal'
                            }
                        });
                    }
                }
                
                this.logger.info('Calendar event created via API', {
                    memberName,
                    eventId: result.event?.id,
                    success: result.success
                });
                
                res.json({
                    success: true,
                    data: result,
                    memberName,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to create calendar event via API', {
                    error: error.message,
                    memberName: req.body.memberName
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // OAuth calendar authorization endpoints
        router.get('/auth/url/:memberName', async (req, res) => {
            try {
                const { memberName } = req.params;
                
                const result = await this.calendarService.initializeUserAuth(memberName);
                
                this.logger.info('Calendar auth URL generated', {
                    memberName,
                    success: result.success
                });
                
                res.json({
                    success: true,
                    data: result,
                    memberName,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to generate calendar auth URL', {
                    error: error.message,
                    memberName: req.params.memberName
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        router.post('/auth/callback/:memberName', async (req, res) => {
            try {
                const { memberName } = req.params;
                const { code } = req.body;
                
                if (!code) {
                    return res.status(400).json({
                        success: false,
                        error: 'Authorization code is required'
                    });
                }
                
                const result = await this.calendarService.completeUserAuth(memberName, code);
                
                this.logger.info('Calendar auth completed', {
                    memberName,
                    success: result.success
                });
                
                res.json({
                    success: true,
                    data: result,
                    memberName,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                this.logger.error('Failed to complete calendar auth', {
                    error: error.message,
                    memberName: req.params.memberName
                });
                
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API health and metrics
        router.get('/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                metrics: this.metrics,
                timestamp: new Date().toISOString()
            });
        });

        app.use('/api/calendar', router);
        
        this.logger.info('Calendar API endpoints registered');
    }

    /**
     * Generate executive insights from member calendar data
     */
    generateExecutiveCalendarInsights(memberOverviews) {
        const insights = [];
        
        // Analyze scheduling conflicts across team
        const membersWithConflicts = Object.entries(memberOverviews)
            .filter(([, overview]) => 
                overview.insights.some(insight => insight.type === 'scheduling_conflicts')
            );
        
        if (membersWithConflicts.length > 0) {
            insights.push({
                type: 'team_scheduling_conflicts',
                priority: 'high',
                description: `${membersWithConflicts.length} team member(s) have scheduling conflicts requiring attention`,
                affectedMembers: membersWithConflicts.map(([name]) => name),
                recommendedAction: 'Review and resolve scheduling conflicts'
            });
        }
        
        // Analyze calendar activity patterns
        const highActivityMembers = Object.entries(memberOverviews)
            .filter(([, overview]) => 
                overview.insights.some(insight => insight.type === 'high_calendar_activity')
            );
        
        if (highActivityMembers.length > 0) {
            insights.push({
                type: 'high_team_calendar_activity',
                priority: 'medium',
                description: `${highActivityMembers.length} team member(s) showing high calendar activity`,
                affectedMembers: highActivityMembers.map(([name]) => name),
                recommendedAction: 'Monitor for potential scheduling overload'
            });
        }
        
        // Check for pending invites across team
        const totalPendingInvites = Object.values(memberOverviews)
            .reduce((sum, overview) => sum + (overview.metrics.pendingInvites || 0), 0);
        
        if (totalPendingInvites > 5) {
            insights.push({
                type: 'high_pending_invites',
                priority: 'medium',
                description: `${totalPendingInvites} pending calendar invites across the team`,
                recommendedAction: 'Review pending invites for timely responses'
            });
        }
        
        return insights;
    }

    /**
     * Calculate aggregate calendar statistics
     */
    calculateAggregateCalendarStats(memberStats) {
        const stats = {
            totalMembers: Object.keys(memberStats).length,
            totalPendingInvites: 0,
            totalQueries: 0,
            totalMemoryEntries: 0,
            weeklyActivity: {
                totalInvites: 0,
                totalQueries: 0
            }
        };
        
        for (const memberStat of Object.values(memberStats)) {
            stats.totalPendingInvites += memberStat.pendingInvites || 0;
            stats.totalQueries += memberStat.totalQueries || 0;
            stats.totalMemoryEntries += memberStat.memoryEntries || 0;
            stats.weeklyActivity.totalInvites += memberStat.recentActivity?.invitesThisWeek || 0;
            stats.weeklyActivity.totalQueries += memberStat.recentActivity?.queriesThisWeek || 0;
        }
        
        return stats;
    }

    /**
     * Get API metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString()
        };
    }
}