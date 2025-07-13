/**
 * Calendar Service
 * High-level calendar operations and business logic
 */

import { GoogleCalendarClient } from './google-calendar-client.js';
import { logger } from '../../utils/logger.js';

export class CalendarService {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'CalendarService' });
        this.calendarClient = config.calendarClient || new GoogleCalendarClient();
        this.defaultCalendarId = config.defaultCalendarId || 'primary';
        
        // User token storage (in production, this should be in database)
        this.userTokens = new Map();
        
        this.logger.info('Calendar Service initialized');
    }

    /**
     * Initialize OAuth flow for a user
     */
    async initializeUserAuth(userId, state = null) {
        try {
            const authUrl = this.calendarClient.getAuthUrl(state || userId);
            
            this.logger.info('OAuth initialization started', { userId });
            
            return {
                success: true,
                authUrl,
                message: 'Please visit the auth URL to authorize calendar access'
            };
        } catch (error) {
            this.logger.error('Failed to initialize user auth', {
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
     * Complete OAuth flow and store user tokens
     */
    async completeUserAuth(userId, authCode) {
        try {
            const tokens = await this.calendarClient.getTokens(authCode);
            
            // Store tokens (in production, save to database)
            this.userTokens.set(userId, tokens);
            
            this.logger.info('User authentication completed', { userId });
            
            return {
                success: true,
                message: 'Calendar access authorized successfully'
            };
        } catch (error) {
            this.logger.error('Failed to complete user auth', {
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
     * Set user credentials for calendar operations
     */
    setUserCredentials(userId) {
        const tokens = this.userTokens.get(userId);
        if (tokens) {
            this.calendarClient.setCredentials(tokens);
            return true;
        }
        return false;
    }

    /**
     * Get user's calendars
     */
    async getUserCalendars(userId) {
        try {
            // Set user credentials if available
            if (!this.setUserCredentials(userId)) {
                return {
                    success: false,
                    error: 'User not authenticated. Please authorize calendar access first.'
                };
            }
            
            const result = await this.calendarClient.listCalendars();
            
            this.logger.info('Retrieved user calendars', {
                userId,
                count: result.calendars?.length || 0
            });
            
            return result;
        } catch (error) {
            this.logger.error('Failed to get user calendars', {
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
     * Get upcoming events for a user
     */
    async getUpcomingEvents(userId, options = {}) {
        try {
            // Set user credentials if available
            if (!this.setUserCredentials(userId)) {
                return {
                    success: false,
                    error: 'User not authenticated. Please authorize calendar access first.'
                };
            }
            
            const calendarId = options.calendarId || this.defaultCalendarId;
            const timeMin = options.timeMin || new Date().toISOString();
            const timeMax = options.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
            const maxResults = options.maxResults || 50;
            
            const result = await this.calendarClient.listEvents(calendarId, {
                timeMin,
                timeMax,
                maxResults
            });
            
            if (result.success) {
                // Filter and format events
                const events = result.events.map(event => this.formatEvent(event));
                
                this.logger.info('Retrieved upcoming events', {
                    userId,
                    calendarId,
                    count: events.length
                });
                
                return {
                    success: true,
                    events,
                    summary: {
                        total: events.length,
                        timeRange: { start: timeMin, end: timeMax }
                    }
                };
            }
            
            return result;
        } catch (error) {
            this.logger.error('Failed to get upcoming events', {
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
     * Create a new calendar event
     */
    async createEvent(userId, eventData, calendarId = null) {
        try {
            // Set user credentials if available
            if (!this.setUserCredentials(userId)) {
                return {
                    success: false,
                    error: 'User not authenticated. Please authorize calendar access first.'
                };
            }
            
            const targetCalendar = calendarId || this.defaultCalendarId;
            
            // Validate and format event data
            const formattedEvent = this.validateAndFormatEventData(eventData);
            if (!formattedEvent.success) {
                return formattedEvent;
            }
            
            const result = await this.calendarClient.createEvent(targetCalendar, formattedEvent.eventData);
            
            if (result.success) {
                this.logger.info('Created calendar event', {
                    userId,
                    eventId: result.event.id,
                    summary: result.event.summary,
                    calendarId: targetCalendar
                });
                
                return {
                    success: true,
                    event: this.formatEvent(result.event),
                    message: 'Event created successfully'
                };
            }
            
            return result;
        } catch (error) {
            this.logger.error('Failed to create event', {
                error: error.message,
                userId,
                summary: eventData.summary
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update an existing calendar event
     */
    async updateEvent(userId, eventId, eventData, calendarId = null) {
        try {
            // Set user credentials if available
            if (!this.setUserCredentials(userId)) {
                return {
                    success: false,
                    error: 'User not authenticated. Please authorize calendar access first.'
                };
            }
            
            const targetCalendar = calendarId || this.defaultCalendarId;
            
            // Validate and format event data
            const formattedEvent = this.validateAndFormatEventData(eventData);
            if (!formattedEvent.success) {
                return formattedEvent;
            }
            
            const result = await this.calendarClient.updateEvent(targetCalendar, eventId, formattedEvent.eventData);
            
            if (result.success) {
                this.logger.info('Updated calendar event', {
                    userId,
                    eventId,
                    summary: result.event.summary,
                    calendarId: targetCalendar
                });
                
                return {
                    success: true,
                    event: this.formatEvent(result.event),
                    message: 'Event updated successfully'
                };
            }
            
            return result;
        } catch (error) {
            this.logger.error('Failed to update event', {
                error: error.message,
                userId,
                eventId
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete a calendar event
     */
    async deleteEvent(userId, eventId, calendarId = null) {
        try {
            // Set user credentials if available
            if (!this.setUserCredentials(userId)) {
                return {
                    success: false,
                    error: 'User not authenticated. Please authorize calendar access first.'
                };
            }
            
            const targetCalendar = calendarId || this.defaultCalendarId;
            
            const result = await this.calendarClient.deleteEvent(targetCalendar, eventId);
            
            if (result.success) {
                this.logger.info('Deleted calendar event', {
                    userId,
                    eventId,
                    calendarId: targetCalendar
                });
            }
            
            return result;
        } catch (error) {
            this.logger.error('Failed to delete event', {
                error: error.message,
                userId,
                eventId
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check availability for scheduling
     */
    async checkAvailability(userId, timeSlots, calendarIds = null) {
        try {
            // Set user credentials if available
            if (!this.setUserCredentials(userId)) {
                return {
                    success: false,
                    error: 'User not authenticated. Please authorize calendar access first.'
                };
            }
            
            const calendars = calendarIds || [this.defaultCalendarId];
            const availability = [];
            
            for (const slot of timeSlots) {
                const result = await this.calendarClient.getFreeBusy(
                    calendars,
                    slot.start,
                    slot.end
                );
                
                if (result.success) {
                    const isFree = this.calculateAvailability(result.calendars, slot);
                    availability.push({
                        slot,
                        available: isFree,
                        conflicts: isFree ? [] : this.getConflicts(result.calendars, slot)
                    });
                }
            }
            
            this.logger.info('Checked availability', {
                userId,
                slotsChecked: timeSlots.length,
                availableSlots: availability.filter(a => a.available).length
            });
            
            return {
                success: true,
                availability,
                summary: {
                    totalSlots: timeSlots.length,
                    availableSlots: availability.filter(a => a.available).length,
                    busySlots: availability.filter(a => !a.available).length
                }
            };
        } catch (error) {
            this.logger.error('Failed to check availability', {
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
     * Find optimal meeting time
     */
    async findOptimalMeetingTime(userId, duration, preferences = {}) {
        try {
            const timeSlots = this.generateTimeSlots(duration, preferences);
            const availabilityResult = await this.checkAvailability(userId, timeSlots);
            
            if (!availabilityResult.success) {
                return availabilityResult;
            }
            
            const availableSlots = availabilityResult.availability
                .filter(a => a.available)
                .map(a => a.slot);
            
            // Sort by preference (morning vs afternoon, weekdays vs weekends, etc.)
            const optimalSlots = this.rankTimeSlots(availableSlots, preferences);
            
            this.logger.info('Found optimal meeting times', {
                userId,
                duration,
                optionsFound: optimalSlots.length
            });
            
            return {
                success: true,
                recommendations: optimalSlots.slice(0, 5), // Top 5 recommendations
                summary: {
                    duration,
                    totalOptionsChecked: timeSlots.length,
                    availableOptions: availableSlots.length
                }
            };
        } catch (error) {
            this.logger.error('Failed to find optimal meeting time', {
                error: error.message,
                userId,
                duration
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate and format event data
     */
    validateAndFormatEventData(eventData) {
        try {
            if (!eventData.summary) {
                return {
                    success: false,
                    error: 'Event summary is required'
                };
            }
            
            if (!eventData.start || !eventData.end) {
                return {
                    success: false,
                    error: 'Event start and end times are required'
                };
            }
            
            const formattedEvent = {
                summary: eventData.summary,
                description: eventData.description || '',
                start: {
                    dateTime: new Date(eventData.start).toISOString(),
                    timeZone: eventData.timeZone || 'America/Chicago'
                },
                end: {
                    dateTime: new Date(eventData.end).toISOString(),
                    timeZone: eventData.timeZone || 'America/Chicago'
                }
            };
            
            // Add optional fields
            if (eventData.location) {
                formattedEvent.location = eventData.location;
            }
            
            if (eventData.attendees) {
                formattedEvent.attendees = eventData.attendees.map(email => ({ email }));
            }
            
            if (eventData.reminders) {
                formattedEvent.reminders = eventData.reminders;
            }
            
            return {
                success: true,
                eventData: formattedEvent
            };
        } catch (error) {
            return {
                success: false,
                error: `Invalid event data: ${error.message}`
            };
        }
    }

    /**
     * Format event for API response
     */
    formatEvent(event) {
        return {
            id: event.id,
            summary: event.summary,
            description: event.description,
            location: event.location,
            start: event.start,
            end: event.end,
            attendees: event.attendees,
            status: event.status,
            htmlLink: event.htmlLink,
            created: event.created,
            updated: event.updated
        };
    }

    /**
     * Generate time slots for availability checking
     */
    generateTimeSlots(duration, preferences = {}) {
        const slots = [];
        const now = new Date();
        const startDate = preferences.startDate ? new Date(preferences.startDate) : now;
        const endDate = preferences.endDate ? new Date(preferences.endDate) : 
                       new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        const startHour = preferences.startHour || 9;
        const endHour = preferences.endHour || 17;
        const intervalMinutes = preferences.interval || 30;
        
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            // Skip weekends if specified
            if (preferences.weekdaysOnly && (date.getDay() === 0 || date.getDay() === 6)) {
                continue;
            }
            
            for (let hour = startHour; hour < endHour; hour++) {
                for (let minute = 0; minute < 60; minute += intervalMinutes) {
                    const slotStart = new Date(date);
                    slotStart.setHours(hour, minute, 0, 0);
                    
                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotEnd.getMinutes() + duration);
                    
                    // Don't create slots that extend past end hour
                    if (slotEnd.getHours() >= endHour) {
                        break;
                    }
                    
                    slots.push({
                        start: slotStart.toISOString(),
                        end: slotEnd.toISOString()
                    });
                }
            }
        }
        
        return slots;
    }

    /**
     * Calculate availability for a time slot
     */
    calculateAvailability(calendars, slot) {
        for (const calendarId in calendars) {
            const calendar = calendars[calendarId];
            if (calendar.busy && calendar.busy.length > 0) {
                for (const busyTime of calendar.busy) {
                    const slotStart = new Date(slot.start);
                    const slotEnd = new Date(slot.end);
                    const busyStart = new Date(busyTime.start);
                    const busyEnd = new Date(busyTime.end);
                    
                    // Check for overlap
                    if (slotStart < busyEnd && slotEnd > busyStart) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * Get conflicts for a time slot
     */
    getConflicts(calendars, slot) {
        const conflicts = [];
        
        for (const calendarId in calendars) {
            const calendar = calendars[calendarId];
            if (calendar.busy && calendar.busy.length > 0) {
                for (const busyTime of calendar.busy) {
                    const slotStart = new Date(slot.start);
                    const slotEnd = new Date(slot.end);
                    const busyStart = new Date(busyTime.start);
                    const busyEnd = new Date(busyTime.end);
                    
                    // Check for overlap
                    if (slotStart < busyEnd && slotEnd > busyStart) {
                        conflicts.push({
                            calendarId,
                            start: busyTime.start,
                            end: busyTime.end
                        });
                    }
                }
            }
        }
        
        return conflicts;
    }

    /**
     * Rank time slots by preferences
     */
    rankTimeSlots(slots, preferences = {}) {
        return slots.sort((a, b) => {
            const aStart = new Date(a.start);
            const bStart = new Date(b.start);
            
            // Prefer morning times if specified
            if (preferences.preferMorning) {
                const aHour = aStart.getHours();
                const bHour = bStart.getHours();
                if (aHour < 12 && bHour >= 12) return -1;
                if (bHour < 12 && aHour >= 12) return 1;
            }
            
            // Prefer earlier dates
            return aStart - bStart;
        });
    }
}

// Export singleton instance
export const calendarService = new CalendarService();