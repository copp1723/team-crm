/**
 * User Activity Tracker
 * Core module for tracking and analyzing user activities across the system
 */

import { db } from '../database/connection.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

export class UserActivityTracker {
    constructor(options = {}) {
        this.logger = logger.child({ component: 'UserActivityTracker' });
        
        this.config = {
            enableDetailedLogging: options.enableDetailedLogging !== false,
            enableRequestBodyLogging: options.enableRequestBodyLogging || false,
            enableResponseLogging: options.enableResponseLogging || false,
            maxRequestBodySize: options.maxRequestBodySize || 1000, // characters
            maxResponseSize: options.maxResponseSize || 500, // characters
            sensitiveFields: options.sensitiveFields || [
                'password', 'token', 'secret', 'api_key', 'apiKey',
                'authorization', 'credit_card', 'ssn', 'bank_account'
            ],
            excludedEndpoints: options.excludedEndpoints || [
                '/health', '/metrics', '/favicon.ico', '/static'
            ],
            sessionTimeout: options.sessionTimeout || 30 * 60 * 1000, // 30 minutes
        };
        
        // Session management
        this.sessions = new Map();
        this.sessionCleanupInterval = null;
        
        // Metrics cache for performance
        this.metricsCache = new Map();
        this.metricsCacheTimeout = 60000; // 1 minute
        
        // Initialize cleanup interval
        this.startSessionCleanup();
    }
    
    /**
     * Track a user activity
     */
    async trackActivity(activityData) {
        try {
            // Skip excluded endpoints
            if (this.shouldExcludeEndpoint(activityData.endpoint)) {
                return null;
            }
            
            // Generate or retrieve session ID
            const sessionId = this.getOrCreateSession(activityData.userId, activityData.ipAddress);
            
            // Sanitize sensitive data
            const sanitizedData = this.sanitizeActivityData(activityData);
            
            // Prepare the activity record
            const activity = {
                user_id: sanitizedData.userId,
                session_id: sessionId,
                activity_type: sanitizedData.type || 'api_call',
                activity_category: this.categorizeActivity(sanitizedData),
                method: sanitizedData.method,
                endpoint: sanitizedData.endpoint,
                status_code: sanitizedData.statusCode,
                response_time_ms: sanitizedData.responseTime,
                ip_address: sanitizedData.ipAddress,
                user_agent: sanitizedData.userAgent,
                referrer: sanitizedData.referrer,
                request_params: sanitizedData.requestParams || null,
                request_body: sanitizedData.requestBody || null,
                response_summary: sanitizedData.responseSummary || null,
                error_occurred: sanitizedData.errorOccurred || false,
                error_message: sanitizedData.errorMessage || null,
                error_code: sanitizedData.errorCode || null
            };
            
            // Insert into database
            const result = await db.query(`
                INSERT INTO user_activities (
                    user_id, session_id, activity_type, activity_category,
                    method, endpoint, status_code, response_time_ms,
                    ip_address, user_agent, referrer,
                    request_params, request_body, response_summary,
                    error_occurred, error_message, error_code
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                    $12, $13, $14, $15, $16, $17
                ) RETURNING id, created_at
            `, [
                activity.user_id, activity.session_id, activity.activity_type,
                activity.activity_category, activity.method, activity.endpoint,
                activity.status_code, activity.response_time_ms, activity.ip_address,
                activity.user_agent, activity.referrer, activity.request_params,
                activity.request_body, activity.response_summary, activity.error_occurred,
                activity.error_message, activity.error_code
            ]);
            
            if (this.config.enableDetailedLogging) {
                this.logger.debug('Activity tracked', {
                    activityId: result.rows[0].id,
                    userId: activity.user_id,
                    endpoint: activity.endpoint,
                    responseTime: activity.response_time_ms
                });
            }
            
            // Clear metrics cache for this user
            this.metricsCache.delete(activity.user_id);
            
            return result.rows[0];
            
        } catch (error) {
            this.logger.error('Failed to track activity', {
                error: error.message,
                activityData: {
                    userId: activityData.userId,
                    endpoint: activityData.endpoint
                }
            });
            // Don't throw - we don't want tracking failures to break the app
            return null;
        }
    }
    
    /**
     * Track a UI interaction
     */
    async trackUIInteraction(interactionData) {
        try {
            const activity = await this.trackActivity({
                userId: interactionData.userId,
                type: 'ui_interaction',
                endpoint: interactionData.pageUrl,
                method: 'UI',
                statusCode: 200,
                responseTime: 0,
                ipAddress: interactionData.ipAddress,
                userAgent: interactionData.userAgent
            });
            
            if (!activity) return null;
            
            // Insert UI-specific data
            const result = await db.query(`
                INSERT INTO ui_interactions (
                    activity_id, user_id, interaction_type,
                    element_id, element_class, element_text,
                    page_url, interaction_data, time_on_page_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `, [
                activity.id, interactionData.userId, interactionData.interactionType,
                interactionData.elementId, interactionData.elementClass,
                this.truncateText(interactionData.elementText, 500),
                interactionData.pageUrl, interactionData.data || null,
                interactionData.timeOnPage || null
            ]);
            
            return result.rows[0];
            
        } catch (error) {
            this.logger.error('Failed to track UI interaction', {
                error: error.message,
                userId: interactionData.userId
            });
            return null;
        }
    }
    
    /**
     * Track a login attempt
     */
    async trackLogin(loginData) {
        try {
            const sessionId = loginData.success ? 
                this.createSession(loginData.userId, loginData.ipAddress) : null;
            
            const result = await db.query(`
                INSERT INTO login_activities (
                    user_id, login_status, failure_reason,
                    ip_address, user_agent, device_fingerprint,
                    location_country, location_city, session_id,
                    risk_score, risk_factors
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `, [
                loginData.userId,
                loginData.success ? 'success' : 'failed',
                loginData.failureReason || null,
                loginData.ipAddress,
                loginData.userAgent,
                loginData.deviceFingerprint || null,
                loginData.locationCountry || null,
                loginData.locationCity || null,
                sessionId,
                loginData.riskScore || 0,
                loginData.riskFactors || null
            ]);
            
            // Also track as a general activity
            await this.trackActivity({
                userId: loginData.userId,
                type: 'login',
                endpoint: '/login',
                method: 'POST',
                statusCode: loginData.success ? 200 : 401,
                responseTime: loginData.responseTime || 0,
                ipAddress: loginData.ipAddress,
                userAgent: loginData.userAgent,
                errorOccurred: !loginData.success,
                errorMessage: loginData.failureReason
            });
            
            return result.rows[0];
            
        } catch (error) {
            this.logger.error('Failed to track login', {
                error: error.message,
                userId: loginData.userId
            });
            return null;
        }
    }
    
    /**
     * Track a logout
     */
    async trackLogout(userId, sessionId) {
        try {
            const session = this.sessions.get(sessionId);
            if (session) {
                const duration = Date.now() - session.startTime;
                
                await db.query(`
                    UPDATE login_activities
                    SET session_duration_ms = $1
                    WHERE session_id = $2
                `, [duration, sessionId]);
                
                this.sessions.delete(sessionId);
            }
            
            await this.trackActivity({
                userId,
                type: 'logout',
                endpoint: '/logout',
                method: 'POST',
                statusCode: 200,
                responseTime: 0,
                sessionId
            });
            
        } catch (error) {
            this.logger.error('Failed to track logout', {
                error: error.message,
                userId
            });
        }
    }
    
    /**
     * Get user activity summary
     */
    async getUserActivitySummary(userId, days = 30) {
        try {
            // Check cache first
            const cacheKey = `summary_${userId}_${days}`;
            const cached = this.metricsCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.metricsCacheTimeout) {
                return cached.data;
            }
            
            const result = await db.query(`
                SELECT 
                    COUNT(*) as total_activities,
                    COUNT(DISTINCT DATE(created_at)) as active_days,
                    COUNT(DISTINCT session_id) as total_sessions,
                    COUNT(DISTINCT endpoint) as unique_endpoints,
                    SUM(CASE WHEN error_occurred THEN 1 ELSE 0 END) as error_count,
                    AVG(response_time_ms) as avg_response_time,
                    MAX(created_at) as last_activity,
                    MIN(created_at) as first_activity
                FROM user_activities
                WHERE user_id = $1
                AND created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
            `, [userId, days]);
            
            // Get activity by type
            const activityByType = await db.query(`
                SELECT 
                    activity_type,
                    COUNT(*) as count,
                    AVG(response_time_ms) as avg_response_time
                FROM user_activities
                WHERE user_id = $1
                AND created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
                GROUP BY activity_type
                ORDER BY count DESC
            `, [userId, days]);
            
            // Get most used endpoints
            const topEndpoints = await db.query(`
                SELECT 
                    endpoint,
                    method,
                    COUNT(*) as count,
                    AVG(response_time_ms) as avg_response_time
                FROM user_activities
                WHERE user_id = $1
                AND created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
                GROUP BY endpoint, method
                ORDER BY count DESC
                LIMIT 10
            `, [userId, days]);
            
            const summary = {
                ...result.rows[0],
                activityByType: activityByType.rows,
                topEndpoints: topEndpoints.rows,
                errorRate: result.rows[0].total_activities > 0 
                    ? (result.rows[0].error_count / result.rows[0].total_activities * 100).toFixed(2) 
                    : 0
            };
            
            // Cache the result
            this.metricsCache.set(cacheKey, {
                data: summary,
                timestamp: Date.now()
            });
            
            return summary;
            
        } catch (error) {
            this.logger.error('Failed to get user activity summary', {
                error: error.message,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Get activity patterns for a user
     */
    async getUserActivityPatterns(userId, days = 7) {
        try {
            const result = await db.query(
                'SELECT * FROM get_user_activity_patterns($1, $2)',
                [userId, days]
            );
            
            return {
                hourlyDistribution: this.groupByHour(result.rows),
                dailyDistribution: this.groupByDay(result.rows),
                peakHours: this.findPeakHours(result.rows),
                quietHours: this.findQuietHours(result.rows)
            };
            
        } catch (error) {
            this.logger.error('Failed to get user activity patterns', {
                error: error.message,
                userId
            });
            throw error;
        }
    }
    
    /**
     * Get endpoint usage statistics
     */
    async getEndpointStats(days = 7) {
        try {
            const result = await db.query(`
                SELECT * FROM endpoint_usage_stats
                WHERE request_count > 10
                ORDER BY request_count DESC
                LIMIT 50
            `);
            
            return result.rows;
            
        } catch (error) {
            this.logger.error('Failed to get endpoint stats', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Get real-time activity feed
     */
    async getActivityFeed(options = {}) {
        try {
            const {
                userId = null,
                limit = 50,
                offset = 0,
                activityTypes = null,
                startDate = null,
                endDate = null
            } = options;
            
            let query = `
                SELECT 
                    ua.*,
                    tm.name as user_name
                FROM user_activities ua
                LEFT JOIN team_members tm ON tm.external_id = ua.user_id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND ua.user_id = $${paramIndex++}`;
                params.push(userId);
            }
            
            if (activityTypes && activityTypes.length > 0) {
                query += ` AND ua.activity_type = ANY($${paramIndex++})`;
                params.push(activityTypes);
            }
            
            if (startDate) {
                query += ` AND ua.created_at >= $${paramIndex++}`;
                params.push(startDate);
            }
            
            if (endDate) {
                query += ` AND ua.created_at <= $${paramIndex++}`;
                params.push(endDate);
            }
            
            query += ` ORDER BY ua.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
            params.push(limit, offset);
            
            const result = await db.query(query, params);
            
            return result.rows;
            
        } catch (error) {
            this.logger.error('Failed to get activity feed', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Session management methods
     */
    getOrCreateSession(userId, ipAddress) {
        // Look for existing session
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.userId === userId && session.ipAddress === ipAddress) {
                // Update last activity time
                session.lastActivity = Date.now();
                return sessionId;
            }
        }
        
        // Create new session
        return this.createSession(userId, ipAddress);
    }
    
    createSession(userId, ipAddress) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        this.sessions.set(sessionId, {
            userId,
            ipAddress,
            startTime: Date.now(),
            lastActivity: Date.now()
        });
        return sessionId;
    }
    
    startSessionCleanup() {
        this.sessionCleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [sessionId, session] of this.sessions.entries()) {
                if (now - session.lastActivity > this.config.sessionTimeout) {
                    this.sessions.delete(sessionId);
                }
            }
        }, 60000); // Run every minute
    }
    
    /**
     * Data sanitization methods
     */
    sanitizeActivityData(data) {
        const sanitized = { ...data };
        
        // Sanitize request params
        if (sanitized.requestParams) {
            sanitized.requestParams = this.sanitizeObject(sanitized.requestParams);
        }
        
        // Sanitize request body
        if (sanitized.requestBody && this.config.enableRequestBodyLogging) {
            sanitized.requestBody = this.sanitizeObject(sanitized.requestBody);
            // Truncate if too large
            const bodyStr = JSON.stringify(sanitized.requestBody);
            if (bodyStr.length > this.config.maxRequestBodySize) {
                sanitized.requestBody = {
                    _truncated: true,
                    _originalSize: bodyStr.length
                };
            }
        } else {
            sanitized.requestBody = null;
        }
        
        // Sanitize response summary
        if (sanitized.responseSummary && this.config.enableResponseLogging) {
            sanitized.responseSummary = this.sanitizeObject(sanitized.responseSummary);
            const responseStr = JSON.stringify(sanitized.responseSummary);
            if (responseStr.length > this.config.maxResponseSize) {
                sanitized.responseSummary = {
                    _truncated: true,
                    _originalSize: responseStr.length
                };
            }
        } else {
            sanitized.responseSummary = null;
        }
        
        return sanitized;
    }
    
    sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        
        const sanitized = Array.isArray(obj) ? [] : {};
        
        for (const [key, value] of Object.entries(obj)) {
            if (this.isSensitiveField(key)) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
    
    isSensitiveField(fieldName) {
        const lowerFieldName = fieldName.toLowerCase();
        return this.config.sensitiveFields.some(sensitive => 
            lowerFieldName.includes(sensitive.toLowerCase())
        );
    }
    
    /**
     * Helper methods
     */
    categorizeActivity(activityData) {
        const { method, endpoint, type } = activityData;
        
        if (type === 'login' || type === 'logout') return 'auth';
        if (endpoint?.includes('/admin')) return 'admin';
        
        switch (method?.toUpperCase()) {
            case 'GET': return 'read';
            case 'POST': return 'write';
            case 'PUT':
            case 'PATCH': return 'update';
            case 'DELETE': return 'delete';
            default: return 'other';
        }
    }
    
    shouldExcludeEndpoint(endpoint) {
        if (!endpoint) return false;
        return this.config.excludedEndpoints.some(excluded => 
            endpoint.startsWith(excluded)
        );
    }
    
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
    
    groupByHour(rows) {
        const hourly = new Array(24).fill(0);
        rows.forEach(row => {
            hourly[row.hour_of_day] += parseInt(row.activity_count);
        });
        return hourly;
    }
    
    groupByDay(rows) {
        const daily = new Array(7).fill(0);
        rows.forEach(row => {
            daily[row.day_of_week] += parseInt(row.activity_count);
        });
        return daily;
    }
    
    findPeakHours(rows) {
        const hourlyActivity = {};
        rows.forEach(row => {
            const hour = row.hour_of_day;
            hourlyActivity[hour] = (hourlyActivity[hour] || 0) + parseInt(row.activity_count);
        });
        
        return Object.entries(hourlyActivity)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }));
    }
    
    findQuietHours(rows) {
        const hourlyActivity = {};
        for (let i = 0; i < 24; i++) {
            hourlyActivity[i] = 0;
        }
        
        rows.forEach(row => {
            hourlyActivity[row.hour_of_day] += parseInt(row.activity_count);
        });
        
        return Object.entries(hourlyActivity)
            .sort((a, b) => a[1] - b[1])
            .slice(0, 3)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }));
    }
    
    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        if (this.sessionCleanupInterval) {
            clearInterval(this.sessionCleanupInterval);
        }
        this.sessions.clear();
        this.metricsCache.clear();
        this.logger.info('User Activity Tracker shutdown complete');
    }
}

// Export singleton instance
export const activityTracker = new UserActivityTracker();