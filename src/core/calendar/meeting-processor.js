/**
 * Meeting Processor
 * Processes meeting invites, calendar events, and meeting-related communications
 */

import { logger } from '../../utils/logger.js';
import { CalendarService } from './calendar-service.js';

export class MeetingProcessor {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'MeetingProcessor' });
        this.calendarService = config.calendarService || new CalendarService();
        
        this.config = {
            timezone: config.timezone || 'America/Chicago',
            defaultMeetingDuration: config.defaultMeetingDuration || 60, // minutes
            enableAutoProcessing: config.enableAutoProcessing !== false,
            enableSmartScheduling: config.enableSmartScheduling !== false,
            maxParticipants: config.maxParticipants || 50
        };
        
        // Meeting invite patterns and keywords
        this.meetingKeywords = [
            'meeting', 'call', 'conference', 'discussion', 'review',
            'standup', 'sync', 'catchup', 'interview', 'demo',
            'presentation', 'workshop', 'training', 'webinar'
        ];
        
        this.actionWords = [
            'schedule', 'book', 'arrange', 'set up', 'plan',
            'organize', 'invite', 'request', 'propose'
        ];
        
        this.timePatterns = [
            // Time patterns
            /\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)\b/g,
            /\b(\d{1,2})\s*(am|pm|AM|PM)\b/g,
            // Date patterns
            /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
            /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
            /\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/g,
            /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/gi,
            // Duration patterns
            /\b(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)\b/gi
        ];
        
        this.locationPatterns = [
            // Virtual meeting patterns
            /zoom\.us\/j\/\d+/gi,
            /teams\.microsoft\.com/gi,
            /meet\.google\.com/gi,
            /webex\.com/gi,
            /gotomeeting\.com/gi,
            // Physical location patterns
            /\b(conference room|room|office|building|floor)\s+[\w\d\-]+/gi,
            /\b(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd))/gi
        ];
        
        this.logger.info('Meeting Processor initialized');
    }

    /**
     * Process a meeting invite from email content
     */
    async processMeetingInvite(emailData, userId = null) {
        try {
            const startTime = Date.now();
            
            // Extract meeting information from email
            const meetingInfo = await this.extractMeetingInfo(emailData);
            
            if (!meetingInfo.isMeetingRelated) {
                return {
                    success: true,
                    isMeetingRelated: false,
                    message: 'Email does not contain meeting information'
                };
            }
            
            // Process the meeting invite
            const result = {
                success: true,
                isMeetingRelated: true,
                meetingInfo,
                actions: [],
                processingTime: Date.now() - startTime
            };
            
            // Determine appropriate actions
            if (meetingInfo.type === 'invitation') {
                result.actions.push({
                    type: 'calendar_invite',
                    description: 'Calendar invitation detected',
                    data: meetingInfo
                });
                
                // Auto-create calendar event if enabled and user provided
                if (this.config.enableAutoProcessing && userId && meetingInfo.dateTime) {
                    const createResult = await this.createCalendarEvent(userId, meetingInfo);
                    if (createResult.success) {
                        result.actions.push({
                            type: 'event_created',
                            description: 'Calendar event created automatically',
                            data: createResult.event
                        });
                    }
                }
            } else if (meetingInfo.type === 'request') {
                result.actions.push({
                    type: 'meeting_request',
                    description: 'Meeting scheduling request detected',
                    data: meetingInfo
                });
                
                // Suggest optimal times if smart scheduling is enabled
                if (this.config.enableSmartScheduling && userId) {
                    const suggestions = await this.suggestMeetingTimes(userId, meetingInfo);
                    if (suggestions.success) {
                        result.actions.push({
                            type: 'time_suggestions',
                            description: 'Optimal meeting times suggested',
                            data: suggestions.recommendations
                        });
                    }
                }
            } else if (meetingInfo.type === 'response') {
                result.actions.push({
                    type: 'meeting_response',
                    description: 'Meeting response detected',
                    data: meetingInfo
                });
            }
            
            this.logger.info('Meeting invite processed', {
                type: meetingInfo.type,
                hasDateTime: !!meetingInfo.dateTime,
                actionsCount: result.actions.length,
                processingTime: result.processingTime
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to process meeting invite', {
                error: error.message,
                subject: emailData.subject
            });
            
            return {
                success: false,
                error: error.message,
                isMeetingRelated: false
            };
        }
    }

    /**
     * Extract meeting information from email content
     */
    async extractMeetingInfo(emailData) {
        const info = {
            isMeetingRelated: false,
            type: null, // 'invitation', 'request', 'response', 'cancellation'
            confidence: 0,
            title: null,
            dateTime: null,
            duration: null,
            location: null,
            attendees: [],
            agenda: null,
            meetingUrl: null,
            organizer: null,
            response: null, // 'accepted', 'declined', 'tentative'
            originalEventId: null
        };
        
        const text = emailData.cleanText || emailData.text || '';
        const subject = emailData.subject || '';
        const combinedText = `${subject} ${text}`.toLowerCase();
        
        // Check if this is meeting-related
        const meetingScore = this.calculateMeetingScore(combinedText);
        if (meetingScore < 0.3) {
            return info;
        }
        
        info.isMeetingRelated = true;
        info.confidence = meetingScore;
        
        // Determine meeting type
        info.type = this.determineMeetingType(emailData, combinedText);
        
        // Extract meeting details
        info.title = this.extractMeetingTitle(emailData);
        info.dateTime = this.extractDateTime(text);
        info.duration = this.extractDuration(text);
        info.location = this.extractLocation(text);
        info.meetingUrl = this.extractMeetingUrl(text);
        info.attendees = this.extractAttendees(emailData);
        info.agenda = this.extractAgenda(text);
        info.organizer = emailData.from;
        
        // Extract response if it's a response type
        if (info.type === 'response') {
            info.response = this.extractMeetingResponse(combinedText);
            info.originalEventId = this.extractOriginalEventId(emailData);
        }
        
        return info;
    }

    /**
     * Calculate meeting relevance score
     */
    calculateMeetingScore(text) {
        let score = 0;
        
        // Check for meeting keywords
        const meetingKeywordMatches = this.meetingKeywords.filter(keyword => 
            text.includes(keyword)
        ).length;
        score += meetingKeywordMatches * 0.2;
        
        // Check for action words
        const actionWordMatches = this.actionWords.filter(word => 
            text.includes(word)
        ).length;
        score += actionWordMatches * 0.15;
        
        // Check for time patterns
        const timeMatches = this.timePatterns.filter(pattern => 
            pattern.test(text)
        ).length;
        score += timeMatches * 0.25;
        
        // Check for calendar-specific terms
        const calendarTerms = ['calendar', 'invite', 'rsvp', 'accept', 'decline', 'tentative'];
        const calendarMatches = calendarTerms.filter(term => 
            text.includes(term)
        ).length;
        score += calendarMatches * 0.3;
        
        // Check for meeting URLs
        if (this.extractMeetingUrl(text)) {
            score += 0.4;
        }
        
        return Math.min(score, 1.0);
    }

    /**
     * Determine the type of meeting communication
     */
    determineMeetingType(emailData, text) {
        // Check for calendar invitation headers
        if (emailData.headers && emailData.headers['content-type']?.includes('text/calendar')) {
            return 'invitation';
        }
        
        // Check for response keywords
        const responseKeywords = ['accepted', 'declined', 'tentative', 'maybe', 'will attend', 'cannot attend'];
        if (responseKeywords.some(keyword => text.includes(keyword))) {
            return 'response';
        }
        
        // Check for cancellation keywords
        const cancellationKeywords = ['cancelled', 'canceled', 'postponed', 'rescheduled'];
        if (cancellationKeywords.some(keyword => text.includes(keyword))) {
            return 'cancellation';
        }
        
        // Check for scheduling request keywords
        const requestKeywords = ['when are you available', 'schedule a meeting', 'let\'s meet', 'available times'];
        if (requestKeywords.some(keyword => text.includes(keyword))) {
            return 'request';
        }
        
        // Default to invitation if meeting-related
        return 'invitation';
    }

    /**
     * Extract meeting title from email
     */
    extractMeetingTitle(emailData) {
        let title = emailData.subject;
        
        if (!title) return null;
        
        // Clean up common email prefixes
        title = title.replace(/^(RE:|FW:|FWD:)\s*/gi, '').trim();
        
        // Remove common meeting invite prefixes
        title = title.replace(/^(invitation:|meeting:|call:)\s*/gi, '').trim();
        
        return title || null;
    }

    /**
     * Extract date and time information
     */
    extractDateTime(text) {
        const dateTimeInfo = {
            date: null,
            time: null,
            timezone: null,
            parsed: null
        };
        
        // Extract time
        const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)\b/);
        if (timeMatch) {
            dateTimeInfo.time = `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3].toUpperCase()}`;
        }
        
        // Extract date
        const datePatterns = [
            /\b(tomorrow|today)\b/gi,
            /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
            /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
            /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/gi
        ];
        
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                dateTimeInfo.date = match[0];
                break;
            }
        }
        
        // Try to parse into a Date object
        if (dateTimeInfo.date && dateTimeInfo.time) {
            try {
                const dateTimeStr = `${dateTimeInfo.date} ${dateTimeInfo.time}`;
                const parsed = new Date(dateTimeStr);
                if (!isNaN(parsed.getTime())) {
                    dateTimeInfo.parsed = parsed.toISOString();
                }
            } catch (error) {
                this.logger.debug('Failed to parse date/time', { 
                    date: dateTimeInfo.date, 
                    time: dateTimeInfo.time 
                });
            }
        }
        
        return dateTimeInfo.parsed ? dateTimeInfo : null;
    }

    /**
     * Extract meeting duration
     */
    extractDuration(text) {
        const durationMatch = text.match(/\b(\d+)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)\b/i);
        if (durationMatch) {
            const value = parseInt(durationMatch[1]);
            const unit = durationMatch[2].toLowerCase();
            
            if (unit.startsWith('hour') || unit.startsWith('hr')) {
                return value * 60; // Convert to minutes
            } else {
                return value;
            }
        }
        
        return this.config.defaultMeetingDuration;
    }

    /**
     * Extract meeting location
     */
    extractLocation(text) {
        // Check for virtual meeting URLs
        for (const pattern of this.locationPatterns) {
            const match = text.match(pattern);
            if (match) {
                return {
                    type: pattern.source.includes('zoom|teams|meet|webex|goto') ? 'virtual' : 'physical',
                    value: match[0],
                    raw: match[0]
                };
            }
        }
        
        // Look for "at" or "in" followed by location
        const locationMatch = text.match(/\b(?:at|in|location:?)\s+([^\n\r.]{1,100})/i);
        if (locationMatch) {
            return {
                type: 'unknown',
                value: locationMatch[1].trim(),
                raw: locationMatch[0]
            };
        }
        
        return null;
    }

    /**
     * Extract meeting URL
     */
    extractMeetingUrl(text) {
        const urlPatterns = [
            /https?:\/\/zoom\.us\/j\/\d+[^\s]*/gi,
            /https?:\/\/[^.\s]+\.zoom\.us\/[^\s]*/gi,
            /https?:\/\/teams\.microsoft\.com\/[^\s]*/gi,
            /https?:\/\/meet\.google\.com\/[^\s]*/gi,
            /https?:\/\/[^.\s]+\.webex\.com\/[^\s]*/gi,
            /https?:\/\/[^.\s]+\.gotomeeting\.com\/[^\s]*/gi
        ];
        
        for (const pattern of urlPatterns) {
            const match = text.match(pattern);
            if (match) {
                return match[0];
            }
        }
        
        return null;
    }

    /**
     * Extract attendees from email
     */
    extractAttendees(emailData) {
        const attendees = [];
        
        // Add recipients
        if (emailData.to) {
            attendees.push(...emailData.to.map(addr => ({
                email: addr.address,
                name: addr.name,
                role: 'required'
            })));
        }
        
        // Add CC recipients as optional
        if (emailData.cc) {
            attendees.push(...emailData.cc.map(addr => ({
                email: addr.address,
                name: addr.name,
                role: 'optional'
            })));
        }
        
        return attendees;
    }

    /**
     * Extract agenda or meeting description
     */
    extractAgenda(text) {
        // Look for agenda indicators
        const agendaPatterns = [
            /agenda:?\s*([^\n\r]{1,500})/i,
            /topics?:?\s*([^\n\r]{1,500})/i,
            /discussion:?\s*([^\n\r]{1,500})/i,
            /items?:?\s*([^\n\r]{1,500})/i
        ];
        
        for (const pattern of agendaPatterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        // If no specific agenda found, use first few lines of clean text
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length > 0) {
            return lines.slice(0, 3).join(' ').substring(0, 300);
        }
        
        return null;
    }

    /**
     * Extract meeting response (accept/decline/tentative)
     */
    extractMeetingResponse(text) {
        if (text.includes('accept') || text.includes('will attend') || text.includes('yes')) {
            return 'accepted';
        }
        
        if (text.includes('decline') || text.includes('cannot attend') || text.includes('no')) {
            return 'declined';
        }
        
        if (text.includes('tentative') || text.includes('maybe') || text.includes('might')) {
            return 'tentative';
        }
        
        return null;
    }

    /**
     * Extract original event ID from response emails
     */
    extractOriginalEventId(emailData) {
        // Look in references or in-reply-to headers
        if (emailData.inReplyTo) {
            return emailData.inReplyTo;
        }
        
        if (emailData.references && emailData.references.length > 0) {
            return emailData.references[0];
        }
        
        return null;
    }

    /**
     * Create calendar event from meeting info
     */
    async createCalendarEvent(userId, meetingInfo) {
        try {
            if (!meetingInfo.dateTime) {
                return {
                    success: false,
                    error: 'No date/time information available'
                };
            }
            
            const eventData = {
                summary: meetingInfo.title || 'Meeting',
                description: meetingInfo.agenda || '',
                start: meetingInfo.dateTime.parsed,
                end: new Date(new Date(meetingInfo.dateTime.parsed).getTime() + 
                             (meetingInfo.duration || this.config.defaultMeetingDuration) * 60000).toISOString(),
                timeZone: this.config.timezone
            };
            
            // Add location if available
            if (meetingInfo.location) {
                eventData.location = meetingInfo.location.value;
            }
            
            // Add meeting URL to description
            if (meetingInfo.meetingUrl) {
                eventData.description += `\n\nJoin: ${meetingInfo.meetingUrl}`;
            }
            
            // Add attendees
            if (meetingInfo.attendees && meetingInfo.attendees.length > 0) {
                eventData.attendees = meetingInfo.attendees.map(att => att.email);
            }
            
            const result = await this.calendarService.createEvent(userId, eventData);
            
            if (result.success) {
                this.logger.info('Calendar event created from meeting info', {
                    eventId: result.event.id,
                    title: meetingInfo.title,
                    userId
                });
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to create calendar event', {
                error: error.message,
                userId,
                title: meetingInfo.title
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Suggest optimal meeting times
     */
    async suggestMeetingTimes(userId, meetingInfo) {
        try {
            const duration = meetingInfo.duration || this.config.defaultMeetingDuration;
            
            const preferences = {
                startDate: new Date(),
                endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
                startHour: 9,
                endHour: 17,
                weekdaysOnly: true,
                preferMorning: true
            };
            
            const result = await this.calendarService.findOptimalMeetingTime(userId, duration, preferences);
            
            if (result.success) {
                this.logger.info('Meeting time suggestions generated', {
                    userId,
                    duration,
                    suggestions: result.recommendations?.length || 0
                });
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to suggest meeting times', {
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
     * Process meeting follow-up and action items
     */
    async processMeetingFollowUp(emailData) {
        try {
            const actionItems = this.extractActionItems(emailData.cleanText || emailData.text || '');
            const decisions = this.extractDecisions(emailData.cleanText || emailData.text || '');
            const nextSteps = this.extractNextSteps(emailData.cleanText || emailData.text || '');
            
            return {
                success: true,
                followUp: {
                    actionItems,
                    decisions,
                    nextSteps,
                    summary: this.generateMeetingSummary(emailData, actionItems, decisions)
                }
            };
            
        } catch (error) {
            this.logger.error('Failed to process meeting follow-up', {
                error: error.message
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract action items from meeting content
     */
    extractActionItems(text) {
        const actionItems = [];
        const actionPatterns = [
            /action item:?\s*([^\n\r]{1,200})/gi,
            /todo:?\s*([^\n\r]{1,200})/gi,
            /\b(\w+)\s+will\s+([^\n\r]{1,200})/gi,
            /\b(\w+)\s+to\s+([^\n\r]{1,200})/gi
        ];
        
        for (const pattern of actionPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                actionItems.push({
                    task: match[1]?.trim() || match[0].trim(),
                    assignee: match[1]?.includes('will') ? match[1].split(' ')[0] : null,
                    dueDate: null,
                    priority: 'normal'
                });
            }
        }
        
        return actionItems;
    }

    /**
     * Extract decisions from meeting content
     */
    extractDecisions(text) {
        const decisions = [];
        const decisionPatterns = [
            /decision:?\s*([^\n\r]{1,200})/gi,
            /agreed:?\s*([^\n\r]{1,200})/gi,
            /decided:?\s*([^\n\r]{1,200})/gi
        ];
        
        for (const pattern of decisionPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                decisions.push({
                    decision: match[1].trim(),
                    context: match[0].trim()
                });
            }
        }
        
        return decisions;
    }

    /**
     * Extract next steps from meeting content
     */
    extractNextSteps(text) {
        const nextSteps = [];
        const stepPatterns = [
            /next steps?:?\s*([^\n\r]{1,200})/gi,
            /follow up:?\s*([^\n\r]{1,200})/gi,
            /upcoming:?\s*([^\n\r]{1,200})/gi
        ];
        
        for (const pattern of stepPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                nextSteps.push({
                    step: match[1].trim(),
                    timeline: null
                });
            }
        }
        
        return nextSteps;
    }

    /**
     * Generate meeting summary
     */
    generateMeetingSummary(emailData, actionItems, decisions) {
        const summary = {
            subject: emailData.subject,
            date: emailData.date,
            participants: [
                ...(emailData.to || []),
                ...(emailData.cc || [])
            ].map(p => p.address),
            actionItemsCount: actionItems.length,
            decisionsCount: decisions.length,
            keyPoints: []
        };
        
        // Extract key points from first few sentences
        const text = emailData.cleanText || emailData.text || '';
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
        summary.keyPoints = sentences.slice(0, 3).map(s => s.trim());
        
        return summary;
    }
}

// Export singleton instance
export const meetingProcessor = new MeetingProcessor();