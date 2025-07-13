/**
 * Activity Logger Middleware
 * Middleware for logging all user activities, API calls, and UI interactions
 */

import { activityTracker } from '../core/analytics/user-activity-tracker.js';
import { logger } from '../utils/logger.js';

export class ActivityLoggerMiddleware {
    constructor(options = {}) {
        this.logger = logger.child({ component: 'ActivityLoggerMiddleware' });
        this.tracker = activityTracker;
        
        this.config = {
            enabled: options.enabled !== false,
            logRequestBody: options.logRequestBody || false,
            logResponseData: options.logResponseData || false,
            skipPaths: options.skipPaths || [
                '/health',
                '/metrics',
                '/favicon.ico',
                '/static',
                '/admin/rate-limits/stats' // Avoid logging activity tracking stats
            ],
            skipMethods: options.skipMethods || [],
            captureUIEvents: options.captureUIEvents !== false,
            performanceThreshold: options.performanceThreshold || 5000 // Log slow requests
        };
        
        // Metrics for monitoring
        this.metrics = {
            totalLogged: 0,
            failedLogs: 0,
            skippedLogs: 0
        };
    }
    
    /**
     * Create the activity logging middleware
     */
    createMiddleware() {
        return async (req, res, next) => {
            if (!this.config.enabled) {
                return next();
            }
            
            // Skip if path should be ignored
            if (this.shouldSkipLogging(req)) {
                this.metrics.skippedLogs++;
                return next();
            }
            
            // Capture start time
            const startTime = Date.now();
            
            // Capture request data
            const activityData = {
                userId: this.getUserId(req),
                method: req.method,
                endpoint: req.path,
                ipAddress: this.getClientIp(req),
                userAgent: req.get('user-agent'),
                referrer: req.get('referrer') || req.get('referer'),
                requestParams: this.getRequestParams(req),
                requestBody: this.getRequestBody(req),
                sessionId: req.session?.id || null
            };
            
            // Store original methods
            const originalSend = res.send;
            const originalJson = res.json;
            const originalEnd = res.end;
            
            // Flag to ensure we only log once
            let logged = false;
            
            // Wrapper to capture response
            const captureResponse = (body) => {
                if (!logged) {
                    logged = true;
                    const responseTime = Date.now() - startTime;
                    
                    // Complete activity data
                    activityData.statusCode = res.statusCode;
                    activityData.responseTime = responseTime;
                    activityData.errorOccurred = res.statusCode >= 400;
                    
                    // Capture response summary if enabled
                    if (this.config.logResponseData && body) {
                        activityData.responseSummary = this.createResponseSummary(body);
                    }
                    
                    // Log slow requests
                    if (responseTime > this.config.performanceThreshold) {
                        this.logger.warn('Slow request detected', {
                            endpoint: activityData.endpoint,
                            responseTime,
                            userId: activityData.userId
                        });
                    }
                    
                    // Async logging - don't block response
                    this.logActivity(activityData).catch(error => {
                        this.logger.error('Failed to log activity', { error: error.message });
                        this.metrics.failedLogs++;
                    });
                }
            };
            
            // Override response methods
            res.send = function(body) {
                captureResponse(body);
                return originalSend.call(this, body);
            };
            
            res.json = function(body) {
                captureResponse(body);
                return originalJson.call(this, body);
            };
            
            res.end = function(chunk, encoding) {
                if (chunk) {
                    captureResponse(chunk);
                } else if (!logged) {
                    captureResponse(null);
                }
                return originalEnd.call(this, chunk, encoding);
            };
            
            // Handle errors
            res.on('error', (error) => {
                if (!logged) {
                    activityData.errorOccurred = true;
                    activityData.errorMessage = error.message;
                    activityData.statusCode = res.statusCode || 500;
                    activityData.responseTime = Date.now() - startTime;
                    
                    this.logActivity(activityData).catch(logError => {
                        this.logger.error('Failed to log error activity', { error: logError.message });
                        this.metrics.failedLogs++;
                    });
                }
            });
            
            next();
        };
    }
    
    /**
     * Create middleware for logging login attempts
     */
    createLoginMiddleware() {
        return async (req, res, next) => {
            if (!this.config.enabled) {
                return next();
            }
            
            const startTime = Date.now();
            const originalJson = res.json;
            
            res.json = function(body) {
                const responseTime = Date.now() - startTime;
                
                // Determine if login was successful based on status code and response
                const success = res.statusCode === 200 && body && !body.error;
                
                const loginData = {
                    userId: req.body?.username || req.body?.email || 'unknown',
                    success,
                    failureReason: !success ? (body?.error || body?.message || 'Invalid credentials') : null,
                    ipAddress: ActivityLoggerMiddleware.prototype.getClientIp(req),
                    userAgent: req.get('user-agent'),
                    responseTime,
                    deviceFingerprint: req.body?.deviceFingerprint,
                    riskScore: ActivityLoggerMiddleware.prototype.calculateLoginRiskScore(req)
                };
                
                // Log the login attempt
                activityTracker.trackLogin(loginData).catch(error => {
                    logger.error('Failed to log login attempt', { error: error.message });
                });
                
                return originalJson.call(this, body);
            };
            
            next();
        };
    }
    
    /**
     * Create middleware for logging UI interactions
     */
    createUIInteractionMiddleware() {
        return async (req, res, next) => {
            if (!this.config.enabled || !this.config.captureUIEvents) {
                return next();
            }
            
            try {
                const interactionData = {
                    userId: this.getUserId(req),
                    interactionType: req.body.type || 'unknown',
                    elementId: req.body.elementId,
                    elementClass: req.body.elementClass,
                    elementText: req.body.elementText,
                    pageUrl: req.body.pageUrl || req.get('referer'),
                    data: req.body.data,
                    timeOnPage: req.body.timeOnPage,
                    ipAddress: this.getClientIp(req),
                    userAgent: req.get('user-agent')
                };
                
                await this.tracker.trackUIInteraction(interactionData);
                
                res.json({ success: true });
                
            } catch (error) {
                this.logger.error('Failed to log UI interaction', { error: error.message });
                res.status(500).json({ error: 'Failed to log interaction' });
            }
        };
    }
    
    /**
     * Create middleware for session tracking
     */
    createSessionMiddleware() {
        return (req, res, next) => {
            if (!this.config.enabled) {
                return next();
            }
            
            // Ensure session exists
            if (req.auth?.user && !req.session?.activitySessionId) {
                const sessionId = this.tracker.getOrCreateSession(
                    req.auth.user,
                    this.getClientIp(req)
                );
                
                // Store in request for other middleware to use
                if (req.session) {
                    req.session.activitySessionId = sessionId;
                }
            }
            
            next();
        };
    }
    
    /**
     * Log activity to the tracker
     */
    async logActivity(activityData) {
        try {
            await this.tracker.trackActivity(activityData);
            this.metrics.totalLogged++;
        } catch (error) {
            this.metrics.failedLogs++;
            throw error;
        }
    }
    
    /**
     * Check if logging should be skipped
     */
    shouldSkipLogging(req) {
        // Skip based on path
        if (this.config.skipPaths.some(path => req.path.startsWith(path))) {
            return true;
        }
        
        // Skip based on method
        if (this.config.skipMethods.includes(req.method)) {
            return true;
        }
        
        // Skip OPTIONS requests
        if (req.method === 'OPTIONS') {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get user ID from request
     */
    getUserId(req) {
        // Check various possible locations for user ID
        return req.auth?.user || 
               req.user?.id || 
               req.session?.userId || 
               req.headers['x-user-id'] ||
               'anonymous';
    }
    
    /**
     * Get client IP address
     */
    getClientIp(req) {
        // Check various headers for real IP (when behind proxy)
        return req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               'unknown';
    }
    
    /**
     * Get request parameters
     */
    getRequestParams(req) {
        if (!this.config.logRequestBody) return null;
        
        // Combine query params and route params
        const params = {
            ...req.query,
            ...req.params
        };
        
        return Object.keys(params).length > 0 ? params : null;
    }
    
    /**
     * Get request body
     */
    getRequestBody(req) {
        if (!this.config.logRequestBody || !req.body) return null;
        
        // Skip large bodies
        const bodyStr = JSON.stringify(req.body);
        if (bodyStr.length > 10000) {
            return { _truncated: true, _size: bodyStr.length };
        }
        
        return req.body;
    }
    
    /**
     * Create response summary
     */
    createResponseSummary(body) {
        if (!body) return null;
        
        try {
            // Handle different response types
            if (typeof body === 'string') {
                return { type: 'string', length: body.length };
            } else if (Buffer.isBuffer(body)) {
                return { type: 'buffer', size: body.length };
            } else if (typeof body === 'object') {
                // Create a summary of the response structure
                return this.summarizeObject(body);
            }
            
            return { type: typeof body };
            
        } catch (error) {
            return { error: 'Failed to summarize response' };
        }
    }
    
    /**
     * Summarize object structure
     */
    summarizeObject(obj, maxDepth = 2, currentDepth = 0) {
        if (currentDepth >= maxDepth) {
            return { _truncated: true };
        }
        
        if (Array.isArray(obj)) {
            return {
                _type: 'array',
                _length: obj.length,
                _sample: obj.length > 0 ? this.summarizeObject(obj[0], maxDepth, currentDepth + 1) : null
            };
        }
        
        const summary = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) {
                summary[key] = value;
            } else if (typeof value === 'object') {
                summary[key] = this.summarizeObject(value, maxDepth, currentDepth + 1);
            } else {
                summary[key] = typeof value;
            }
        }
        
        return summary;
    }
    
    /**
     * Calculate login risk score
     */
    calculateLoginRiskScore(req) {
        let riskScore = 0;
        const factors = [];
        
        // Check for suspicious user agents
        const userAgent = req.get('user-agent') || '';
        if (!userAgent || userAgent.includes('bot') || userAgent.includes('crawler')) {
            riskScore += 0.3;
            factors.push('suspicious_user_agent');
        }
        
        // Check for missing headers
        if (!req.get('accept-language')) {
            riskScore += 0.1;
            factors.push('missing_language_header');
        }
        
        // Check for rapid requests (would need request history)
        // This is a placeholder - real implementation would check request frequency
        
        // Normalize score to 0-1 range
        riskScore = Math.min(1, riskScore);
        
        return riskScore;
    }
    
    /**
     * Get activity metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            trackerStats: this.tracker.getStats ? this.tracker.getStats() : {}
        };
    }
    
    /**
     * Create admin endpoints for activity monitoring
     */
    createAdminEndpoints(app) {
        // Get activity feed
        app.get('/api/admin/activities/feed', async (req, res) => {
            try {
                const feed = await this.tracker.getActivityFeed({
                    userId: req.query.userId,
                    limit: parseInt(req.query.limit) || 50,
                    offset: parseInt(req.query.offset) || 0,
                    activityTypes: req.query.types?.split(','),
                    startDate: req.query.startDate,
                    endDate: req.query.endDate
                });
                
                res.json({ success: true, data: feed });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get user activity summary
        app.get('/api/admin/activities/user/:userId/summary', async (req, res) => {
            try {
                const days = parseInt(req.query.days) || 30;
                const summary = await this.tracker.getUserActivitySummary(
                    req.params.userId,
                    days
                );
                
                res.json({ success: true, data: summary });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get user activity patterns
        app.get('/api/admin/activities/user/:userId/patterns', async (req, res) => {
            try {
                const days = parseInt(req.query.days) || 7;
                const patterns = await this.tracker.getUserActivityPatterns(
                    req.params.userId,
                    days
                );
                
                res.json({ success: true, data: patterns });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get endpoint statistics
        app.get('/api/admin/activities/endpoints/stats', async (req, res) => {
            try {
                const days = parseInt(req.query.days) || 7;
                const stats = await this.tracker.getEndpointStats(days);
                
                res.json({ success: true, data: stats });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get middleware metrics
        app.get('/api/admin/activities/metrics', (req, res) => {
            res.json({ success: true, data: this.getMetrics() });
        });
        
        // Export activity data
        app.get('/api/admin/activities/export', async (req, res) => {
            try {
                const options = {
                    userId: req.query.userId,
                    startDate: req.query.startDate,
                    endDate: req.query.endDate,
                    format: req.query.format || 'json'
                };
                
                // This would be implemented based on export requirements
                res.json({ 
                    success: true, 
                    message: 'Export functionality not yet implemented',
                    options 
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
}

// Export singleton instance with default configuration
export const activityLogger = new ActivityLoggerMiddleware();