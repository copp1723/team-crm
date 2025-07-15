/**
 * PROACTIVE CONVERSATION API
 * RESTful API for proactive conversational AI capabilities
 * 
 * Endpoints:
 * - GET /api/conversation/suggestions/:userId - Get proactive suggestions
 * - POST /api/conversation/autocomplete - Get smart autocomplete
 * - GET /api/conversation/starters/:userId - Get conversation starters
 * - POST /api/conversation/store - Store conversation for learning
 * - GET /api/conversation/stats/:userId - Get user engagement stats
 */

import { ProactiveConversationalAI } from '../ai/proactive-conversational-ai.js';
import { logger } from '../utils/logger.js';

export class ProactiveConversationAPI {
    constructor(config = {}) {
        this.conversationalAI = new ProactiveConversationalAI(config);
        this.logger = logger.child({ component: 'ProactiveConversationAPI' });
        
        // Initialize user sessions
        this.userSessions = new Map();
        this.sessionTimeout = config.sessionTimeout || 1800000; // 30 minutes
        
        // Rate limiting for API calls
        this.rateLimits = new Map();
        this.rateLimitWindow = 60000; // 1 minute
        this.maxRequestsPerMinute = 30;
        
        // Start session cleanup
        this.startSessionCleanup();
    }
    
    /**
     * Setup routes for Express app
     */
    setupRoutes(app) {
        // Proactive suggestions endpoint
        app.get('/api/conversation/suggestions/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const context = req.query;
                
                // Check rate limits
                if (!this.checkRateLimit(userId)) {
                    return res.status(429).json({
                        success: false,
                        error: 'Rate limit exceeded',
                        retryAfter: 60
                    });
                }
                
                // Initialize user memory if needed
                const memberName = context.memberName || userId;
                await this.conversationalAI.initializeUserMemory(userId, memberName);
                
                // Generate suggestions
                const suggestions = await this.conversationalAI.generateProactiveSuggestions(userId, context);
                
                // Update session
                this.updateUserSession(userId);
                
                res.json({
                    success: true,
                    data: {
                        suggestions,
                        userId,
                        timestamp: new Date().toISOString(),
                        refreshInterval: this.conversationalAI.config.suggestionRefreshInterval
                    }
                });
                
            } catch (error) {
                this.logger.error('Failed to get proactive suggestions', { userId: req.params.userId, error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        // Smart autocomplete endpoint
        app.post('/api/conversation/autocomplete', async (req, res) => {
            try {
                const { userId, partialText, context = {} } = req.body;
                
                if (!userId || !partialText) {
                    return res.status(400).json({
                        success: false,
                        error: 'userId and partialText are required'
                    });
                }
                
                // Check rate limits
                if (!this.checkRateLimit(userId)) {
                    return res.status(429).json({
                        success: false,
                        error: 'Rate limit exceeded',
                        retryAfter: 60
                    });
                }
                
                // Initialize user memory if needed
                const memberName = context.memberName || userId;
                await this.conversationalAI.initializeUserMemory(userId, memberName);
                
                // Get autocomplete suggestions
                const completions = await this.conversationalAI.getSmartAutocomplete(userId, partialText, context);
                
                // Update session
                this.updateUserSession(userId);
                
                res.json({
                    success: true,
                    data: {
                        completions,
                        partialText,
                        userId,
                        timestamp: new Date().toISOString()
                    }
                });
                
            } catch (error) {
                this.logger.error('Failed to get smart autocomplete', { error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        // Conversation starters endpoint
        app.get('/api/conversation/starters/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const context = req.query;
                
                // Check rate limits
                if (!this.checkRateLimit(userId)) {
                    return res.status(429).json({
                        success: false,
                        error: 'Rate limit exceeded',
                        retryAfter: 60
                    });
                }
                
                // Initialize user memory if needed
                const memberName = context.memberName || userId;
                await this.conversationalAI.initializeUserMemory(userId, memberName);
                
                // Generate conversation starters
                const starters = await this.conversationalAI.generateConversationStarters(userId, context);
                
                // Update session
                this.updateUserSession(userId);
                
                res.json({
                    success: true,
                    data: {
                        starters,
                        userId,
                        timestamp: new Date().toISOString()
                    }
                });
                
            } catch (error) {
                this.logger.error('Failed to get conversation starters', { userId: req.params.userId, error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        // Store conversation endpoint
        app.post('/api/conversation/store', async (req, res) => {
            try {
                const { userId, message, response, metadata = {} } = req.body;
                
                if (!userId || !message) {
                    return res.status(400).json({
                        success: false,
                        error: 'userId and message are required'
                    });
                }
                
                // Initialize user memory if needed
                const memberName = metadata.memberName || userId;
                await this.conversationalAI.initializeUserMemory(userId, memberName);
                
                // Store the conversation
                await this.conversationalAI.storeConversation(userId, message, response, metadata);
                
                // Update session
                this.updateUserSession(userId);
                
                res.json({
                    success: true,
                    data: {
                        stored: true,
                        userId,
                        timestamp: new Date().toISOString()
                    }
                });
                
            } catch (error) {
                this.logger.error('Failed to store conversation', { error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        // User engagement stats endpoint
        app.get('/api/conversation/stats/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                
                // Get user engagement stats
                const userStats = this.conversationalAI.getUserEngagement(userId);
                
                // Get system stats if requested
                const includeSystemStats = req.query.includeSystem === 'true';
                const systemStats = includeSystemStats ? this.conversationalAI.getSystemStats() : null;
                
                res.json({
                    success: true,
                    data: {
                        userStats,
                        systemStats,
                        userId,
                        timestamp: new Date().toISOString()
                    }
                });
                
            } catch (error) {
                this.logger.error('Failed to get conversation stats', { userId: req.params.userId, error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        // System health endpoint
        app.get('/api/conversation/health', async (req, res) => {
            try {
                const systemStats = this.conversationalAI.getSystemStats();
                const health = {
                    status: 'healthy',
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    activeUsers: systemStats.activeUsers,
                    totalMemorySpaces: systemStats.totalMemorySpaces,
                    cacheHitRate: systemStats.cacheHitRate,
                    timestamp: new Date().toISOString()
                };
                
                res.json({
                    success: true,
                    data: health
                });
                
            } catch (error) {
                this.logger.error('Failed to get system health', { error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        // Bulk operations endpoint
        app.post('/api/conversation/bulk', async (req, res) => {
            try {
                const { operations } = req.body;
                
                if (!Array.isArray(operations)) {
                    return res.status(400).json({
                        success: false,
                        error: 'operations must be an array'
                    });
                }
                
                const results = [];
                
                for (const operation of operations) {
                    try {
                        const { type, userId, data } = operation;
                        
                        let result;
                        switch (type) {
                            case 'suggestions':
                                result = await this.conversationalAI.generateProactiveSuggestions(userId, data);
                                break;
                            case 'autocomplete':
                                result = await this.conversationalAI.getSmartAutocomplete(userId, data.partialText, data.context);
                                break;
                            case 'starters':
                                result = await this.conversationalAI.generateConversationStarters(userId, data);
                                break;
                            case 'store':
                                await this.conversationalAI.storeConversation(userId, data.message, data.response, data.metadata);
                                result = { stored: true };
                                break;
                            default:
                                result = { error: `Unknown operation type: ${type}` };
                        }
                        
                        results.push({ success: true, type, userId, data: result });
                        
                    } catch (error) {
                        results.push({ success: false, type: operation.type, userId: operation.userId, error: error.message });
                    }
                }
                
                res.json({
                    success: true,
                    data: {
                        results,
                        processed: results.length,
                        timestamp: new Date().toISOString()
                    }
                });
                
            } catch (error) {
                this.logger.error('Failed to process bulk operations', { error });
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            }
        });
        
        this.logger.info('Proactive Conversation API routes registered');
    }
    
    /**
     * Check rate limits for user
     */
    checkRateLimit(userId) {
        const now = Date.now();
        const userLimits = this.rateLimits.get(userId) || { requests: [], lastReset: now };
        
        // Clean old requests
        userLimits.requests = userLimits.requests.filter(time => now - time < this.rateLimitWindow);
        
        // Check if under limit
        if (userLimits.requests.length >= this.maxRequestsPerMinute) {
            return false;
        }
        
        // Add current request
        userLimits.requests.push(now);
        this.rateLimits.set(userId, userLimits);
        
        return true;
    }
    
    /**
     * Update user session
     */
    updateUserSession(userId) {
        this.userSessions.set(userId, {
            lastActivity: Date.now(),
            userId
        });
    }
    
    /**
     * Start session cleanup task
     */
    startSessionCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [userId, session] of this.userSessions.entries()) {
                if (now - session.lastActivity > this.sessionTimeout) {
                    this.userSessions.delete(userId);
                    this.logger.debug('Cleaned up inactive session', { userId });
                }
            }
        }, 300000); // Clean every 5 minutes
    }
    
    /**
     * Get active sessions count
     */
    getActiveSessionsCount() {
        return this.userSessions.size;
    }
    
    /**
     * Get API statistics
     */
    getAPIStats() {
        return {
            activeSessions: this.getActiveSessionsCount(),
            rateLimitedUsers: this.rateLimits.size,
            conversationalAIStats: this.conversationalAI.getSystemStats(),
            timestamp: new Date().toISOString()
        };
    }
}