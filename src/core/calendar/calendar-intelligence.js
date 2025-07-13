/**
 * Calendar Intelligence
 * Provides intelligent calendar analysis and scheduling assistance for personal assistants
 */

import { logger } from '../../utils/logger.js';
import { CalendarService } from './calendar-service.js';
import { MeetingProcessor } from './meeting-processor.js';

export class CalendarIntelligence {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'CalendarIntelligence' });
        this.calendarService = config.calendarService || new CalendarService();
        this.meetingProcessor = config.meetingProcessor || new MeetingProcessor();
        
        this.config = {
            timezone: config.timezone || 'America/Chicago',
            workingHours: config.workingHours || { start: 9, end: 17 },
            lookAheadDays: config.lookAheadDays || 14,
            bufferMinutes: config.bufferMinutes || 15,
            enableSmartSuggestions: config.enableSmartSuggestions !== false,
            enableConflictDetection: config.enableConflictDetection !== false
        };
        
        // Cache for calendar data to reduce API calls
        this.calendarCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        this.logger.info('Calendar Intelligence initialized');
    }

    /**
     * Process calendar invite through personal assistant
     */
    async processCalendarInvite(userId, emailData, assistantMemory = null) {
        try {
            const startTime = Date.now();
            
            // Extract meeting information
            const meetingResult = await this.meetingProcessor.processMeetingInvite(emailData, userId);
            
            if (!meetingResult.success || !meetingResult.isMeetingRelated) {
                return {
                    success: true,
                    isMeetingRelated: false,
                    message: 'Email does not contain calendar information'
                };
            }
            
            const result = {
                success: true,
                isMeetingRelated: true,
                meetingInfo: meetingResult.meetingInfo,
                calendarActions: [],
                insights: [],
                conflicts: [],
                suggestions: [],
                processingTime: 0
            };
            
            // Analyze calendar context
            const calendarContext = await this.analyzeCalendarContext(userId, meetingResult.meetingInfo);
            if (calendarContext.success) {
                result.insights.push(...calendarContext.insights);
                result.conflicts.push(...calendarContext.conflicts);
            }
            
            // Generate intelligent suggestions
            if (this.config.enableSmartSuggestions) {
                const suggestions = await this.generateSchedulingSuggestions(userId, meetingResult.meetingInfo);
                if (suggestions.success) {
                    result.suggestions.push(...suggestions.recommendations);
                }
            }
            
            // Process calendar actions
            for (const action of meetingResult.actions) {
                if (action.type === 'calendar_invite') {
                    result.calendarActions.push({
                        type: 'invite_processed',
                        description: 'Calendar invitation analyzed',
                        data: {
                            ...action.data,
                            conflicts: result.conflicts,
                            suggestions: result.suggestions
                        }
                    });
                } else if (action.type === 'event_created') {
                    result.calendarActions.push({
                        type: 'event_added',
                        description: 'Event added to calendar',
                        data: action.data
                    });
                }
            }
            
            // Store in assistant memory if provided
            if (assistantMemory) {
                await this.storeCalendarMemory(assistantMemory, meetingResult.meetingInfo, result);
            }
            
            result.processingTime = Date.now() - startTime;
            
            this.logger.info('Calendar invite processed', {
                userId,
                meetingType: meetingResult.meetingInfo.type,
                hasDateTime: !!meetingResult.meetingInfo.dateTime,
                conflictsFound: result.conflicts.length,
                suggestionsGenerated: result.suggestions.length
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to process calendar invite', {
                error: error.message,
                userId
            });
            
            return {
                success: false,
                error: error.message,
                isMeetingRelated: false
            };
        }
    }

    /**
     * Process natural language schedule queries
     */
    async processScheduleQuery(userId, query, assistantMemory = null) {
        try {
            const startTime = Date.now();
            
            // Parse the natural language query
            const queryIntent = this.parseScheduleQuery(query);
            
            const result = {
                success: true,
                intent: queryIntent.intent,
                timeframe: queryIntent.timeframe,
                events: [],
                availability: [],
                summary: '',
                suggestions: [],
                processingTime: 0
            };
            
            // Execute query based on intent
            switch (queryIntent.intent) {
                case 'view_schedule':
                    const scheduleResult = await this.getScheduleForTimeframe(userId, queryIntent.timeframe);
                    if (scheduleResult.success) {
                        result.events = scheduleResult.events;
                        result.summary = this.generateScheduleSummary(scheduleResult.events, queryIntent.timeframe);
                    }
                    break;
                    
                case 'check_availability':
                    const availabilityResult = await this.checkAvailabilityForTimeframe(userId, queryIntent.timeframe);
                    if (availabilityResult.success) {
                        result.availability = availabilityResult.slots;
                        result.summary = this.generateAvailabilitySummary(availabilityResult.slots, queryIntent.timeframe);
                    }
                    break;
                    
                case 'find_meeting_time':
                    const meetingTimeResult = await this.findOptimalMeetingTimes(userId, queryIntent);
                    if (meetingTimeResult.success) {
                        result.suggestions = meetingTimeResult.recommendations;
                        result.summary = this.generateMeetingTimeSummary(meetingTimeResult.recommendations, queryIntent);
                    }
                    break;
                    
                case 'schedule_meeting':
                    const schedulingResult = await this.assistScheduleMeeting(userId, queryIntent);
                    if (schedulingResult.success) {
                        result.suggestions = schedulingResult.options;
                        result.summary = 'Here are some scheduling options for your meeting';
                    }
                    break;
                    
                default:
                    result.summary = 'I can help you view your schedule, check availability, or find meeting times. What would you like to know?';
            }
            
            // Store interaction in memory
            if (assistantMemory) {
                await this.storeQueryMemory(assistantMemory, query, result);
            }
            
            result.processingTime = Date.now() - startTime;
            
            this.logger.info('Schedule query processed', {
                userId,
                intent: queryIntent.intent,
                timeframe: queryIntent.timeframe,
                eventsFound: result.events.length,
                suggestionsGenerated: result.suggestions.length
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to process schedule query', {
                error: error.message,
                userId,
                query
            });
            
            return {
                success: false,
                error: error.message,
                summary: 'Sorry, I had trouble processing your schedule request. Please try again.'
            };
        }
    }

    /**
     * Get executive calendar overview
     */
    async getExecutiveCalendarOverview(executiveIds, options = {}) {
        try {
            const timeframe = options.timeframe || {
                start: new Date(),
                end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            };
            
            const overview = {
                success: true,
                timeframe,
                executives: {},
                insights: [],
                conflicts: [],
                opportunities: []
            };
            
            // Get calendar data for each executive
            for (const execId of executiveIds) {
                const execData = await this.getExecutiveCalendarData(execId, timeframe);
                if (execData.success) {
                    overview.executives[execId] = execData.data;
                    
                    // Analyze for insights
                    const insights = this.analyzeExecutiveSchedule(execData.data);
                    overview.insights.push(...insights);
                }
            }
            
            // Find cross-executive opportunities
            const opportunities = this.findExecutiveOpportunities(overview.executives);
            overview.opportunities.push(...opportunities);
            
            this.logger.info('Executive calendar overview generated', {
                executivesAnalyzed: executiveIds.length,
                insightsGenerated: overview.insights.length,
                opportunitiesFound: overview.opportunities.length
            });
            
            return overview;
            
        } catch (error) {
            this.logger.error('Failed to generate executive calendar overview', {
                error: error.message,
                executiveIds
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Analyze calendar context for conflicts and insights
     */
    async analyzeCalendarContext(userId, meetingInfo) {
        try {
            const insights = [];
            const conflicts = [];
            
            if (!meetingInfo.dateTime || !meetingInfo.dateTime.parsed) {
                return { success: true, insights, conflicts };
            }
            
            const meetingStart = new Date(meetingInfo.dateTime.parsed);
            const meetingEnd = new Date(meetingStart.getTime() + (meetingInfo.duration || 60) * 60000);
            
            // Check for conflicts
            if (this.config.enableConflictDetection) {
                const conflictResult = await this.calendarService.checkAvailability(userId, [{
                    start: meetingStart.toISOString(),
                    end: meetingEnd.toISOString()
                }]);
                
                if (conflictResult.success && conflictResult.availability.length > 0) {
                    const slot = conflictResult.availability[0];
                    if (!slot.available) {
                        conflicts.push({
                            type: 'scheduling_conflict',
                            description: 'Meeting time conflicts with existing events',
                            conflicts: slot.conflicts,
                            severity: 'high'
                        });
                        
                        insights.push('This meeting time conflicts with your existing schedule');
                    }
                }
            }
            
            // Analyze meeting timing
            const timeInsights = this.analyzeTimingContext(meetingStart, meetingEnd);
            insights.push(...timeInsights);
            
            // Check for travel time conflicts
            const travelInsights = await this.analyzeTravelTime(userId, meetingInfo, meetingStart);
            insights.push(...travelInsights);
            
            return { success: true, insights, conflicts };
            
        } catch (error) {
            this.logger.error('Failed to analyze calendar context', {
                error: error.message,
                userId
            });
            
            return {
                success: false,
                error: error.message,
                insights: [],
                conflicts: []
            };
        }
    }

    /**
     * Parse natural language schedule queries
     */
    parseScheduleQuery(query) {
        const lowerQuery = query.toLowerCase();
        
        // Determine intent
        let intent = 'view_schedule'; // default
        
        if (lowerQuery.includes('available') || lowerQuery.includes('free') || lowerQuery.includes('availability')) {
            intent = 'check_availability';
        } else if (lowerQuery.includes('find time') || lowerQuery.includes('when can') || lowerQuery.includes('meeting time')) {
            intent = 'find_meeting_time';
        } else if (lowerQuery.includes('schedule') && (lowerQuery.includes('meeting') || lowerQuery.includes('call'))) {
            intent = 'schedule_meeting';
        }
        
        // Determine timeframe
        let timeframe = { type: 'today' };
        
        if (lowerQuery.includes('tomorrow')) {
            timeframe = { type: 'tomorrow' };
        } else if (lowerQuery.includes('this week') || lowerQuery.includes('week')) {
            timeframe = { type: 'week' };
        } else if (lowerQuery.includes('next week')) {
            timeframe = { type: 'next_week' };
        } else if (lowerQuery.includes('month')) {
            timeframe = { type: 'month' };
        } else if (lowerQuery.includes('today')) {
            timeframe = { type: 'today' };
        }
        
        // Extract duration for meeting requests
        let duration = 60; // default 1 hour
        const durationMatch = lowerQuery.match(/(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)/);
        if (durationMatch) {
            const value = parseInt(durationMatch[1]);
            const unit = durationMatch[2];
            if (unit.startsWith('hour') || unit.startsWith('hr')) {
                duration = value * 60;
            } else {
                duration = value;
            }
        }
        
        return { intent, timeframe, duration };
    }

    /**
     * Get schedule for specified timeframe
     */
    async getScheduleForTimeframe(userId, timeframe) {
        try {
            const { start, end } = this.calculateTimeframe(timeframe);
            
            const result = await this.calendarService.getUpcomingEvents(userId, {
                timeMin: start.toISOString(),
                timeMax: end.toISOString()
            });
            
            if (result.success) {
                // Enhanced event data with context
                const enhancedEvents = result.events.map(event => ({
                    ...event,
                    context: this.analyzeEventContext(event),
                    conflicts: [] // Would be populated if checking against other calendars
                }));
                
                return {
                    success: true,
                    events: enhancedEvents,
                    timeframe: { start, end }
                };
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to get schedule for timeframe', {
                error: error.message,
                userId,
                timeframe
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate scheduling suggestions
     */
    async generateSchedulingSuggestions(userId, meetingInfo) {
        try {
            if (!meetingInfo.dateTime) {
                // No specific time requested, suggest optimal times
                const duration = meetingInfo.duration || 60;
                return await this.calendarService.findOptimalMeetingTime(userId, duration, {
                    startDate: new Date(),
                    endDate: new Date(Date.now() + this.config.lookAheadDays * 24 * 60 * 60 * 1000),
                    weekdaysOnly: true,
                    preferMorning: true
                });
            }
            
            // Specific time requested, suggest alternatives if there are conflicts
            const meetingStart = new Date(meetingInfo.dateTime.parsed);
            const duration = meetingInfo.duration || 60;
            
            const conflictCheck = await this.calendarService.checkAvailability(userId, [{
                start: meetingStart.toISOString(),
                end: new Date(meetingStart.getTime() + duration * 60000).toISOString()
            }]);
            
            if (conflictCheck.success && conflictCheck.availability[0]?.available) {
                return {
                    success: true,
                    recommendations: [{
                        start: meetingStart.toISOString(),
                        end: new Date(meetingStart.getTime() + duration * 60000).toISOString(),
                        confidence: 'high',
                        reason: 'Requested time is available'
                    }]
                };
            }
            
            // Find alternatives around the requested time
            const alternatives = await this.findAlternativeTimes(userId, meetingStart, duration);
            return {
                success: true,
                recommendations: alternatives
            };
            
        } catch (error) {
            this.logger.error('Failed to generate scheduling suggestions', {
                error: error.message,
                userId
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Store calendar information in assistant memory
     */
    async storeCalendarMemory(assistantMemory, meetingInfo, processingResult) {
        try {
            const memoryEntry = {
                type: 'calendar_event',
                timestamp: new Date().toISOString(),
                data: {
                    meetingInfo,
                    conflicts: processingResult.conflicts,
                    insights: processingResult.insights,
                    suggestions: processingResult.suggestions
                },
                context: {
                    hasConflicts: processingResult.conflicts.length > 0,
                    requiresAction: processingResult.conflicts.length > 0 || processingResult.suggestions.length > 0,
                    meetingType: meetingInfo.type,
                    priority: processingResult.conflicts.length > 0 ? 'high' : 'normal'
                }
            };
            
            // Store in memory system (implementation depends on memory system interface)
            if (assistantMemory && typeof assistantMemory.store === 'function') {
                await assistantMemory.store(memoryEntry);
            }
            
            this.logger.debug('Calendar memory stored', {
                type: memoryEntry.type,
                hasConflicts: memoryEntry.context.hasConflicts,
                priority: memoryEntry.context.priority
            });
            
        } catch (error) {
            this.logger.error('Failed to store calendar memory', {
                error: error.message
            });
        }
    }

    /**
     * Helper methods for timeframe calculations
     */
    calculateTimeframe(timeframe) {
        const now = new Date();
        let start, end;
        
        switch (timeframe.type) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                break;
                
            case 'tomorrow':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                break;
                
            case 'week':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
                
            case 'next_week':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7);
                end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
                
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                break;
                
            default:
                start = new Date();
                end = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
        
        return { start, end };
    }

    /**
     * Analyze timing context for insights
     */
    analyzeTimingContext(start, end) {
        const insights = [];
        const hour = start.getHours();
        const day = start.getDay();
        const duration = (end - start) / (1000 * 60); // minutes
        
        // Time of day insights
        if (hour < 9) {
            insights.push('Early morning meeting - consider attendee time zones');
        } else if (hour > 17) {
            insights.push('After-hours meeting scheduled');
        } else if (hour >= 12 && hour <= 13) {
            insights.push('Lunch time meeting - consider meal arrangements');
        }
        
        // Day of week insights
        if (day === 0 || day === 6) {
            insights.push('Weekend meeting scheduled');
        } else if (day === 1 && hour < 10) {
            insights.push('Early Monday meeting - allow time for week preparation');
        } else if (day === 5 && hour > 15) {
            insights.push('Late Friday meeting - consider end-of-week energy levels');
        }
        
        // Duration insights
        if (duration > 120) {
            insights.push('Long meeting scheduled - consider breaks');
        } else if (duration < 30) {
            insights.push('Short meeting - ensure focused agenda');
        }
        
        return insights;
    }

    /**
     * Generate summaries for different query types
     */
    generateScheduleSummary(events, timeframe) {
        if (events.length === 0) {
            return `You have no scheduled events for ${timeframe.type}`;
        }
        
        const summary = [`You have ${events.length} event${events.length > 1 ? 's' : ''} scheduled for ${timeframe.type}:`];
        
        events.slice(0, 5).forEach(event => {
            const startTime = new Date(event.start.dateTime || event.start.date);
            const timeStr = startTime.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                timeZone: this.config.timezone 
            });
            summary.push(`• ${timeStr} - ${event.summary}`);
        });
        
        if (events.length > 5) {
            summary.push(`... and ${events.length - 5} more`);
        }
        
        return summary.join('\n');
    }

    generateAvailabilitySummary(slots, timeframe) {
        const availableSlots = slots.filter(slot => slot.available);
        
        if (availableSlots.length === 0) {
            return `You have no available time slots for ${timeframe.type}`;
        }
        
        return `You have ${availableSlots.length} available time slot${availableSlots.length > 1 ? 's' : ''} for ${timeframe.type}`;
    }

    generateMeetingTimeSummary(recommendations, queryIntent) {
        if (recommendations.length === 0) {
            return 'No suitable meeting times found for your request';
        }
        
        const summary = [`Here are ${recommendations.length} optimal meeting time${recommendations.length > 1 ? 's' : ''}:`];
        
        recommendations.slice(0, 3).forEach((rec, index) => {
            const startTime = new Date(rec.start);
            const timeStr = startTime.toLocaleString('en-US', { 
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: this.config.timezone
            });
            summary.push(`${index + 1}. ${timeStr} (${rec.reason || 'Available'})`);
        });
        
        return summary.join('\n');
    }

    /**
     * Additional helper methods would go here...
     * (Implementation of remaining methods like analyzeTravelTime, findAlternativeTimes, etc.)
     */
}

// Export singleton instance
export const calendarIntelligence = new CalendarIntelligence();