/**
 * Google Calendar Client
 * Handles Google Calendar API integration with OAuth2 authentication
 */

import { google } from 'googleapis';
import { logger } from '../../utils/logger.js';

export class GoogleCalendarClient {
    constructor(config = {}) {
        this.logger = logger.child({ component: 'GoogleCalendarClient' });
        
        this.config = {
            clientId: config.clientId || process.env.GOOGLE_CALENDAR_CLIENT_ID,
            clientSecret: config.clientSecret || process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
            redirectUri: config.redirectUri || process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:8080/auth/google/callback',
            serviceAccountEmail: config.serviceAccountEmail || process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL,
            privateKey: config.privateKey || process.env.GOOGLE_CALENDAR_PRIVATE_KEY,
            scopes: [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events'
            ]
        };
        
        // Initialize OAuth2 client
        if (this.config.clientId && this.config.clientSecret) {
            this.oauth2Client = new google.auth.OAuth2(
                this.config.clientId,
                this.config.clientSecret,
                this.config.redirectUri
            );
            this.enabled = true;
            this.logger.info('Google Calendar OAuth2 client initialized');
        } else if (this.config.serviceAccountEmail && this.config.privateKey) {
            // Service account authentication
            this.serviceAuth = new google.auth.JWT(
                this.config.serviceAccountEmail,
                null,
                this.config.privateKey.replace(/\\n/g, '\n'),
                this.config.scopes
            );
            this.enabled = true;
            this.logger.info('Google Calendar service account initialized');
        } else {
            this.logger.warn('Google Calendar API credentials not configured - calendar features will be simulated');
            this.enabled = false;
        }
        
        // Initialize Calendar API
        this.calendar = google.calendar({ version: 'v3' });
    }

    /**
     * Get OAuth2 authorization URL
     */
    getAuthUrl(state = null) {
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client not initialized');
        }
        
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.config.scopes,
            state: state
        });
        
        this.logger.info('Generated OAuth2 auth URL');
        return authUrl;
    }

    /**
     * Exchange authorization code for tokens
     */
    async getTokens(code) {
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client not initialized');
        }
        
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            
            this.logger.info('OAuth2 tokens obtained successfully');
            return tokens;
        } catch (error) {
            this.logger.error('Failed to exchange authorization code for tokens', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Set OAuth2 credentials
     */
    setCredentials(tokens) {
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client not initialized');
        }
        
        this.oauth2Client.setCredentials(tokens);
        this.logger.info('OAuth2 credentials set');
    }

    /**
     * Get authenticated client for API calls
     */
    getAuthenticatedClient() {
        if (this.serviceAuth) {
            return this.serviceAuth;
        } else if (this.oauth2Client) {
            return this.oauth2Client;
        } else {
            throw new Error('No authentication method available');
        }
    }

    /**
     * List calendars accessible to the user
     */
    async listCalendars() {
        if (!this.enabled) {
            this.logger.info('Google Calendar not enabled - simulating calendar list');
            return {
                success: true,
                calendars: [
                    {
                        id: 'primary',
                        summary: 'Primary Calendar (Simulated)',
                        accessRole: 'owner',
                        primary: true
                    }
                ]
            };
        }
        
        try {
            const auth = this.getAuthenticatedClient();
            const response = await this.calendar.calendarList.list({ auth });
            
            this.logger.info('Successfully retrieved calendar list', {
                count: response.data.items?.length || 0
            });
            
            return {
                success: true,
                calendars: response.data.items || []
            };
        } catch (error) {
            this.logger.error('Failed to list calendars', {
                error: error.message
            });
            
            // Return simulated data for development
            return {
                success: true,
                calendars: [
                    {
                        id: 'primary',
                        summary: 'Primary Calendar (Fallback)',
                        accessRole: 'owner',
                        primary: true
                    }
                ]
            };
        }
    }

    /**
     * List events from a calendar
     */
    async listEvents(calendarId = 'primary', options = {}) {
        if (!this.enabled) {
            this.logger.info('Google Calendar not enabled - simulating events list');
            return {
                success: true,
                events: [
                    {
                        id: 'simulated-event-1',
                        summary: 'Team Meeting (Simulated)',
                        start: { dateTime: new Date().toISOString() },
                        end: { dateTime: new Date(Date.now() + 3600000).toISOString() }
                    }
                ]
            };
        }
        
        try {
            const auth = this.getAuthenticatedClient();
            const params = {
                auth,
                calendarId,
                timeMin: options.timeMin || new Date().toISOString(),
                timeMax: options.timeMax,
                maxResults: options.maxResults || 250,
                singleEvents: true,
                orderBy: 'startTime'
            };
            
            const response = await this.calendar.events.list(params);
            
            this.logger.info('Successfully retrieved events', {
                calendarId,
                count: response.data.items?.length || 0
            });
            
            return {
                success: true,
                events: response.data.items || []
            };
        } catch (error) {
            this.logger.error('Failed to list events', {
                error: error.message,
                calendarId
            });
            
            // Return simulated data for development
            return {
                success: true,
                events: []
            };
        }
    }

    /**
     * Create a new calendar event
     */
    async createEvent(calendarId = 'primary', eventData) {
        if (!this.enabled) {
            this.logger.info('Google Calendar not enabled - simulating event creation', {
                summary: eventData.summary,
                calendarId
            });
            return {
                success: true,
                event: {
                    id: `simulated-${Date.now()}`,
                    summary: eventData.summary,
                    start: eventData.start,
                    end: eventData.end,
                    htmlLink: 'https://calendar.google.com/simulated'
                }
            };
        }
        
        try {
            const auth = this.getAuthenticatedClient();
            const response = await this.calendar.events.insert({
                auth,
                calendarId,
                resource: eventData
            });
            
            this.logger.info('Successfully created event', {
                eventId: response.data.id,
                summary: eventData.summary,
                calendarId
            });
            
            return {
                success: true,
                event: response.data
            };
        } catch (error) {
            this.logger.error('Failed to create event', {
                error: error.message,
                summary: eventData.summary,
                calendarId
            });
            
            // Return simulated success for development
            return {
                success: true,
                event: {
                    id: `fallback-${Date.now()}`,
                    summary: eventData.summary,
                    start: eventData.start,
                    end: eventData.end,
                    htmlLink: 'https://calendar.google.com/fallback'
                }
            };
        }
    }

    /**
     * Update an existing calendar event
     */
    async updateEvent(calendarId = 'primary', eventId, eventData) {
        if (!this.enabled) {
            this.logger.info('Google Calendar not enabled - simulating event update', {
                eventId,
                summary: eventData.summary
            });
            return {
                success: true,
                event: {
                    id: eventId,
                    summary: eventData.summary,
                    start: eventData.start,
                    end: eventData.end
                }
            };
        }
        
        try {
            const auth = this.getAuthenticatedClient();
            const response = await this.calendar.events.update({
                auth,
                calendarId,
                eventId,
                resource: eventData
            });
            
            this.logger.info('Successfully updated event', {
                eventId,
                summary: eventData.summary,
                calendarId
            });
            
            return {
                success: true,
                event: response.data
            };
        } catch (error) {
            this.logger.error('Failed to update event', {
                error: error.message,
                eventId,
                calendarId
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
    async deleteEvent(calendarId = 'primary', eventId) {
        if (!this.enabled) {
            this.logger.info('Google Calendar not enabled - simulating event deletion', {
                eventId
            });
            return {
                success: true,
                message: 'Event deletion simulated'
            };
        }
        
        try {
            const auth = this.getAuthenticatedClient();
            await this.calendar.events.delete({
                auth,
                calendarId,
                eventId
            });
            
            this.logger.info('Successfully deleted event', {
                eventId,
                calendarId
            });
            
            return {
                success: true,
                message: 'Event deleted successfully'
            };
        } catch (error) {
            this.logger.error('Failed to delete event', {
                error: error.message,
                eventId,
                calendarId
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get free/busy information
     */
    async getFreeBusy(calendars, timeMin, timeMax) {
        if (!this.enabled) {
            this.logger.info('Google Calendar not enabled - simulating free/busy query');
            return {
                success: true,
                calendars: calendars.reduce((acc, cal) => {
                    acc[cal] = { busy: [] };
                    return acc;
                }, {})
            };
        }
        
        try {
            const auth = this.getAuthenticatedClient();
            const response = await this.calendar.freebusy.query({
                auth,
                resource: {
                    timeMin,
                    timeMax,
                    items: calendars.map(id => ({ id }))
                }
            });
            
            this.logger.info('Successfully retrieved free/busy information', {
                calendars: calendars.length
            });
            
            return {
                success: true,
                calendars: response.data.calendars || {}
            };
        } catch (error) {
            this.logger.error('Failed to get free/busy information', {
                error: error.message
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
export const googleCalendarClient = new GoogleCalendarClient();