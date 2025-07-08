/**
 * Enhanced Rate Limiting Middleware
 * Integrates Redis-based rate limiting with existing validation and security
 */

import { RedisRateLimiter } from './redis-rate-limiter.js';
import { logger } from '../utils/logger.js';

export class EnhancedRateLimitingMiddleware {
    constructor(options = {}) {
        this.rateLimiter = new RedisRateLimiter(options);
        this.logger = logger.child({ component: 'EnhancedRateLimiting' });
        
        // Advanced configuration options
        this.config = {
            enableWhitelisting: options.enableWhitelisting !== false,
            enableBlacklisting: options.enableBlacklisting !== false,
            enableDynamicLimits: options.enableDynamicLimits !== false,
            enableGeoBlocking: options.enableGeoBlocking || false,
            enableBehaviorAnalysis: options.enableBehaviorAnalysis !== false,
            
            // Thresholds for automatic blacklisting
            autoBlacklist: {
                enabled: options.autoBlacklist?.enabled !== false,
                threshold: options.autoBlacklist?.threshold || 10, // failures in window
                windowMs: options.autoBlacklist?.windowMs || 300000, // 5 minutes
                banDuration: options.autoBlacklist?.banDuration || 3600, // 1 hour
            },
            
            // Dynamic rate limit adjustments
            dynamicLimits: {
                serverLoad: {
                    enabled: options.dynamicLimits?.serverLoad?.enabled || false,
                    cpuThreshold: options.dynamicLimits?.serverLoad?.cpuThreshold || 80,
                    memoryThreshold: options.dynamicLimits?.serverLoad?.memoryThreshold || 80,
                    reductionFactor: options.dynamicLimits?.serverLoad?.reductionFactor || 0.5
                },
                aiServiceHealth: {
                    enabled: options.dynamicLimits?.aiServiceHealth?.enabled !== false,
                    healthCheckUrl: options.dynamicLimits?.aiServiceHealth?.healthCheckUrl,
                    reductionFactor: options.dynamicLimits?.aiServiceHealth?.reductionFactor || 0.3
                }
            }
        };
        
        this.metrics = {
            requestsProcessed: 0,
            requestsBlocked: 0,
            autoBlacklisted: 0,
            dynamicAdjustments: 0,
            whitelistHits: 0,
            blacklistHits: 0
        };
        
        // Behavior tracking for intelligent rate limiting
        this.behaviorTracker = new Map();
    }
    
    /**
     * Initialize the enhanced rate limiting system
     */
    async initialize() {
        try {
            await this.rateLimiter.initialize();
            
            if (this.rateLimiter.enabled) {
                this.logger.info('Enhanced Rate Limiting initialized successfully');
                // Start background tasks
                this.startBackgroundTasks();
            } else {
                this.logger.info('Enhanced Rate Limiting running in bypass mode - Redis not available');
            }
            
        } catch (error) {
            this.logger.error('Failed to initialize Enhanced Rate Limiting', { error });
            // Don't throw - allow app to continue without rate limiting
        }
    }
    
    /**
     * Create smart rate limiting middleware with multiple layers
     */
    createSmartMiddleware(configName = 'api', options = {}) {
        // If rate limiter is not enabled, return a no-op middleware
        if (!this.rateLimiter.enabled) {
            return (req, res, next) => next();
        }
        
        return async (req, res, next) => {
            const startTime = Date.now();
            
            try {
                // Layer 1: Blacklist check
                if (this.config.enableBlacklisting) {
                    const blacklistResult = await this.checkBlacklist(req);
                    if (blacklistResult.blocked) {
                        this.metrics.blacklistHits++;
                        return this.sendBlacklistResponse(res, blacklistResult);
                    }
                }
                
                // Layer 2: Whitelist check (bypass rate limiting)
                if (this.config.enableWhitelisting) {
                    const whitelisted = await this.checkWhitelist(req);
                    if (whitelisted) {
                        this.metrics.whitelistHits++;
                        this.metrics.requestsProcessed++;
                        return next();
                    }
                }
                
                // Layer 3: Dynamic rate limit adjustment
                let adjustedConfig = configName;
                if (this.config.enableDynamicLimits) {
                    adjustedConfig = await this.adjustRateLimitsBasedOnSystemHealth(configName);
                }
                
                // Layer 4: Behavior-based rate limiting
                if (this.config.enableBehaviorAnalysis) {
                    await this.analyzeBehavior(req);
                }
                
                // Layer 5: Apply rate limiting
                const rateLimitMiddleware = this.rateLimiter.createMiddleware(adjustedConfig);
                
                // Wrap the rate limit middleware to capture results
                rateLimitMiddleware(req, res, (error) => {
                    if (error) {
                        return next(error);
                    }
                    
                    // Check if request was blocked (status 429)
                    if (res.statusCode === 429) {
                        this.handleRateLimitExceeded(req, configName);
                        return; // Response already sent by rate limiter
                    }
                    
                    // Request allowed - continue processing
                    this.metrics.requestsProcessed++;
                    this.recordSuccessfulRequest(req);
                    next();
                });
                
            } catch (error) {
                this.logger.error('Smart rate limiting error', { error: error.message });
                
                // Fail open - allow request if rate limiter fails
                this.metrics.requestsProcessed++;
                next();
            } finally {
                // Record processing time
                const processingTime = Date.now() - startTime;
                this.logger.debug('Rate limit check completed', {
                    processingTime: `${processingTime}ms`,
                    path: req.path
                });
            }
        };
    }
    
    /**
     * Check if request is blacklisted
     */
    async checkBlacklist(req) {
        const clientId = this.rateLimiter.getClientId(req);
        const blacklistInfo = await this.rateLimiter.isBlacklisted(clientId);
        
        if (blacklistInfo) {
            this.logger.warn('Blocked blacklisted request', {
                clientId,
                reason: blacklistInfo.reason,
                path: req.path
            });
            
            return {
                blocked: true,
                reason: blacklistInfo.reason,
                timestamp: blacklistInfo.timestamp
            };
        }
        
        return { blocked: false };
    }
    
    /**
     * Check if request is whitelisted
     */
    async checkWhitelist(req) {
        const clientId = this.rateLimiter.getClientId(req);
        return await this.rateLimiter.isWhitelisted(clientId);
    }
    
    /**
     * Adjust rate limits based on system health
     */
    async adjustRateLimitsBasedOnSystemHealth(configName) {
        const config = this.rateLimiter.defaultConfigs[configName];
        if (!config) return configName;
        
        let adjustmentFactor = 1.0;
        
        // Check server load
        if (this.config.dynamicLimits.serverLoad.enabled) {
            const serverHealth = await this.getServerHealth();
            
            if (serverHealth.cpu > this.config.dynamicLimits.serverLoad.cpuThreshold ||
                serverHealth.memory > this.config.dynamicLimits.serverLoad.memoryThreshold) {
                
                adjustmentFactor *= this.config.dynamicLimits.serverLoad.reductionFactor;
                this.metrics.dynamicAdjustments++;
                
                this.logger.warn('Reducing rate limits due to high server load', {
                    cpu: serverHealth.cpu,
                    memory: serverHealth.memory,
                    adjustmentFactor
                });
            }
        }
        
        // Check AI service health
        if (this.config.dynamicLimits.aiServiceHealth.enabled && configName === 'ai') {
            const aiHealth = await this.checkAIServiceHealth();
            
            if (!aiHealth.healthy) {
                adjustmentFactor *= this.config.dynamicLimits.aiServiceHealth.reductionFactor;
                this.metrics.dynamicAdjustments++;
                
                this.logger.warn('Reducing AI rate limits due to service issues', {
                    aiHealth,
                    adjustmentFactor
                });
            }
        }
        
        // Create adjusted configuration if needed
        if (adjustmentFactor < 1.0) {
            const adjustedMaxRequests = Math.max(1, Math.floor(config.maxRequests * adjustmentFactor));
            
            // Store adjusted config temporarily
            const adjustedConfigName = `${configName}_adjusted`;
            this.rateLimiter.defaultConfigs[adjustedConfigName] = {
                ...config,
                maxRequests: adjustedMaxRequests
            };
            
            return adjustedConfigName;
        }
        
        return configName;
    }
    
    /**
     * Analyze request behavior for intelligent rate limiting
     */
    async analyzeBehavior(req) {
        const clientId = this.rateLimiter.getClientId(req);
        const now = Date.now();
        
        // Get or create behavior profile
        let profile = this.behaviorTracker.get(clientId);
        if (!profile) {
            profile = {
                requestCount: 0,
                firstSeen: now,
                lastSeen: now,
                patterns: {
                    burstRequests: 0,
                    suspiciousEndpoints: 0,
                    errorRate: 0,
                    totalErrors: 0
                },
                risk: 'low' // low, medium, high
            };
        }
        
        // Update profile
        profile.requestCount++;
        profile.lastSeen = now;
        
        // Detect burst behavior
        if (now - profile.lastSeen < 1000) { // Requests within 1 second
            profile.patterns.burstRequests++;
        }
        
        // Check for suspicious endpoints
        if (this.isSuspiciousEndpoint(req.path)) {
            profile.patterns.suspiciousEndpoints++;
        }
        
        // Calculate risk level
        profile.risk = this.calculateRiskLevel(profile);
        
        // Store updated profile
        this.behaviorTracker.set(clientId, profile);
        
        // Apply behavior-based restrictions
        if (profile.risk === 'high') {
            await this.applyBehaviorBasedRestrictions(clientId, profile);
        }
    }
    
    /**
     * Handle rate limit exceeded
     */
    async handleRateLimitExceeded(req, configName) {
        const clientId = this.rateLimiter.getClientId(req);
        this.metrics.requestsBlocked++;
        
        // Track failed attempts for auto-blacklisting
        if (this.config.autoBlacklist.enabled) {
            await this.trackFailedAttempt(clientId);
        }
        
        this.logger.warn('Rate limit exceeded', {
            clientId,
            path: req.path,
            configName,
            userAgent: req.get('user-agent')
        });
    }
    
    /**
     * Track failed attempts for auto-blacklisting
     */
    async trackFailedAttempt(clientId) {
        const key = `failed_attempts:${clientId}`;
        const attempts = await this.rateLimiter.redis.incr(key);
        await this.rateLimiter.redis.expire(key, Math.ceil(this.config.autoBlacklist.windowMs / 1000));
        
        if (attempts >= this.config.autoBlacklist.threshold) {
            await this.rateLimiter.addToBlacklist(
                clientId,
                `Auto-blacklisted: ${attempts} failed attempts in ${this.config.autoBlacklist.windowMs}ms`,
                this.config.autoBlacklist.banDuration
            );
            
            this.metrics.autoBlacklisted++;
            
            this.logger.warn('Auto-blacklisted client', {
                clientId,
                attempts,
                windowMs: this.config.autoBlacklist.windowMs
            });
        }
    }
    
    /**
     * Record successful request for behavior analysis
     */
    recordSuccessfulRequest(req) {
        const clientId = this.rateLimiter.getClientId(req);
        const profile = this.behaviorTracker.get(clientId);
        
        if (profile) {
            // Reset error counts on successful requests
            profile.patterns.errorRate = Math.max(0, profile.patterns.errorRate - 0.1);
        }
    }
    
    /**
     * Get server health metrics
     */
    async getServerHealth() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Calculate CPU percentage (simplified)
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        
        // Calculate memory percentage
        const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        return {
            cpu: Math.min(100, cpuPercent),
            memory: memPercent,
            uptime: process.uptime()
        };
    }
    
    /**
     * Check AI service health
     */
    async checkAIServiceHealth() {
        try {
            // This would integrate with your AI service health check
            // For now, return a mock health status
            return {
                healthy: true,
                responseTime: 150,
                errorRate: 0.01
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
    
    /**
     * Check if endpoint is suspicious
     */
    isSuspiciousEndpoint(path) {
        const suspiciousPatterns = [
            /\/admin/,
            /\/config/,
            /\/debug/,
            /\/test/,
            /\.env/,
            /\.git/,
            /wp-admin/,
            /phpmyadmin/
        ];
        
        return suspiciousPatterns.some(pattern => pattern.test(path));
    }
    
    /**
     * Calculate risk level based on behavior profile
     */
    calculateRiskLevel(profile) {
        let riskScore = 0;
        
        // High burst requests
        if (profile.patterns.burstRequests > 20) riskScore += 3;
        else if (profile.patterns.burstRequests > 10) riskScore += 2;
        else if (profile.patterns.burstRequests > 5) riskScore += 1;
        
        // Suspicious endpoint access
        if (profile.patterns.suspiciousEndpoints > 5) riskScore += 3;
        else if (profile.patterns.suspiciousEndpoints > 2) riskScore += 2;
        else if (profile.patterns.suspiciousEndpoints > 0) riskScore += 1;
        
        // High error rate
        if (profile.patterns.errorRate > 0.5) riskScore += 3;
        else if (profile.patterns.errorRate > 0.3) riskScore += 2;
        else if (profile.patterns.errorRate > 0.1) riskScore += 1;
        
        // Determine risk level
        if (riskScore >= 6) return 'high';
        if (riskScore >= 3) return 'medium';
        return 'low';
    }
    
    /**
     * Apply behavior-based restrictions
     */
    async applyBehaviorBasedRestrictions(clientId, profile) {
        // Temporary rate limit reduction for high-risk clients
        const restrictionKey = `restriction:${clientId}`;
        await this.rateLimiter.redis.setex(restrictionKey, 300, JSON.stringify({
            reason: 'High-risk behavior detected',
            profile: {
                burstRequests: profile.patterns.burstRequests,
                suspiciousEndpoints: profile.patterns.suspiciousEndpoints,
                errorRate: profile.patterns.errorRate
            },
            timestamp: Date.now()
        }));
        
        this.logger.warn('Applied behavior-based restrictions', {
            clientId,
            risk: profile.risk,
            patterns: profile.patterns
        });
    }
    
    /**
     * Send blacklist response
     */
    sendBlacklistResponse(res, blacklistInfo) {
        res.status(403).json({
            error: 'Access Forbidden',
            code: 'CLIENT_BLACKLISTED',
            reason: blacklistInfo.reason,
            timestamp: blacklistInfo.timestamp,
            message: 'Your access has been temporarily restricted due to suspicious activity'
        });
    }
    
    /**
     * Create rate limiting for specific endpoints
     */
    createEndpointSpecificLimiter(endpoint, config) {
        const customConfig = {
            ...this.rateLimiter.defaultConfigs.api,
            ...config,
            keyGenerator: (req) => `endpoint:${endpoint}:${this.rateLimiter.getClientId(req)}`
        };
        
        return this.rateLimiter.createCustomLimiter(customConfig);
    }
    
    /**
     * Start background maintenance tasks
     */
    startBackgroundTasks() {
        // Cleanup expired behavior profiles every 5 minutes
        setInterval(() => {
            this.cleanupBehaviorProfiles();
        }, 5 * 60 * 1000);
        
        // Cleanup Redis keys every hour
        setInterval(async () => {
            await this.rateLimiter.cleanup();
        }, 60 * 60 * 1000);
        
        this.logger.debug('Background maintenance tasks started');
    }
    
    /**
     * Cleanup expired behavior profiles
     */
    cleanupBehaviorProfiles() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [clientId, profile] of this.behaviorTracker.entries()) {
            if (now - profile.lastSeen > maxAge) {
                this.behaviorTracker.delete(clientId);
            }
        }
        
        this.logger.debug('Cleaned up expired behavior profiles', {
            remaining: this.behaviorTracker.size
        });
    }
    
    /**
     * Get comprehensive rate limiting statistics
     */
    async getStats() {
        const rateLimiterStats = await this.rateLimiter.getStats();
        
        return {
            enhanced: this.metrics,
            rateLimiter: rateLimiterStats,
            behavior: {
                profilesTracked: this.behaviorTracker.size,
                highRiskClients: Array.from(this.behaviorTracker.values())
                    .filter(profile => profile.risk === 'high').length
            },
            config: {
                whitelistingEnabled: this.config.enableWhitelisting,
                blacklistingEnabled: this.config.enableBlacklisting,
                dynamicLimitsEnabled: this.config.enableDynamicLimits,
                behaviorAnalysisEnabled: this.config.enableBehaviorAnalysis,
                autoBlacklistEnabled: this.config.autoBlacklist.enabled
            }
        };
    }
    
    /**
     * Admin endpoints for rate limit management
     */
    createAdminEndpoints(app) {
        // Get rate limiting stats
        app.get('/admin/rate-limits/stats', async (req, res) => {
            try {
                const stats = await this.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Reset rate limits for specific client
        app.post('/admin/rate-limits/reset/:clientId', async (req, res) => {
            try {
                await this.rateLimiter.resetRateLimit(req.params.clientId);
                res.json({ success: true, message: 'Rate limits reset' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Add to whitelist
        app.post('/admin/rate-limits/whitelist/:clientId', async (req, res) => {
            try {
                const { expiry } = req.body;
                await this.rateLimiter.addToWhitelist(req.params.clientId, expiry);
                res.json({ success: true, message: 'Added to whitelist' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Add to blacklist
        app.post('/admin/rate-limits/blacklist/:clientId', async (req, res) => {
            try {
                const { reason, expiry } = req.body;
                await this.rateLimiter.addToBlacklist(req.params.clientId, reason, expiry);
                res.json({ success: true, message: 'Added to blacklist' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get client rate limit status
        app.get('/admin/rate-limits/status/:clientId', async (req, res) => {
            try {
                const status = await this.rateLimiter.getRateLimitStatus(req.params.clientId);
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Enhanced Rate Limiting...');
            await this.rateLimiter.shutdown();
            this.logger.info('Enhanced Rate Limiting shutdown complete');
        } catch (error) {
            this.logger.error('Error during Enhanced Rate Limiting shutdown', { error });
        }
    }
}