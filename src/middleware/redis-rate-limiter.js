/**
 * Redis-Based Rate Limiting System
 * Provides distributed, scalable rate limiting with multiple algorithms
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

export class RedisRateLimiter {
    constructor(options = {}) {
        this.enabled = false;
        this.logger = logger.child({ component: 'RedisRateLimiter' });
        
        // Check if Redis is available
        if (process.env.REDIS_URL || process.env.REDIS_HOST || options.redisHost) {
            this.redisConfig = process.env.REDIS_URL ? 
                process.env.REDIS_URL : 
                {
                    host: options.redisHost || process.env.REDIS_HOST || 'localhost',
                    port: options.redisPort || process.env.REDIS_PORT || 6379,
                    password: options.redisPassword || process.env.REDIS_PASSWORD,
                    db: options.redisDb || process.env.REDIS_DB || 1,
                    maxRetriesPerRequest: 3,
                    retryDelayOnFailover: 100,
                    lazyConnect: true
                };
            
            this.redis = new Redis(this.redisConfig);
            this.enabled = true;
        } else {
            this.logger.warn('Redis not configured - rate limiting disabled');
        }
        
        // Default rate limiting configurations
        this.defaultConfigs = {
            // API endpoints
            api: {
                algorithm: 'sliding_window',
                windowMs: 60000, // 1 minute
                maxRequests: 60,
                keyGenerator: (req) => `api:${this.getClientId(req)}`,
                skipSuccessfulRequests: false,
                skipFailedRequests: false
            },
            
            // AI processing endpoints
            ai: {
                algorithm: 'token_bucket',
                windowMs: 60000,
                maxRequests: 10,
                burstSize: 5,
                refillRate: 10, // tokens per minute
                keyGenerator: (req) => `ai:${this.getClientId(req)}`,
                skipSuccessfulRequests: false,
                skipFailedRequests: true
            },
            
            // Team updates
            updates: {
                algorithm: 'sliding_window',
                windowMs: 300000, // 5 minutes
                maxRequests: 20,
                keyGenerator: (req) => `updates:${this.getClientId(req)}:${req.body?.memberName || 'unknown'}`,
                skipSuccessfulRequests: false,
                skipFailedRequests: false
            },
            
            // Executive summaries
            summaries: {
                algorithm: 'fixed_window',
                windowMs: 900000, // 15 minutes
                maxRequests: 3,
                keyGenerator: (req) => `summaries:${this.getClientId(req)}`,
                skipSuccessfulRequests: false,
                skipFailedRequests: true
            },
            
            // Authentication attempts
            auth: {
                algorithm: 'exponential_backoff',
                windowMs: 900000, // 15 minutes
                maxRequests: 5,
                backoffMultiplier: 2,
                keyGenerator: (req) => `auth:${this.getClientId(req)}`,
                skipSuccessfulRequests: true,
                skipFailedRequests: false
            }
        };
        
        this.stats = {
            requestsProcessed: 0,
            requestsBlocked: 0,
            algorithmsUsed: new Map(),
            errorCount: 0
        };
    }
    
    /**
     * Initialize the rate limiter
     */
    async initialize() {
        if (!this.enabled) {
            this.logger.info('Redis Rate Limiter skipped - Redis not configured');
            return;
        }
        
        try {
            await this.redis.ping();
            this.logger.info('Redis Rate Limiter initialized successfully');
            
            // Load Lua scripts for atomic operations
            await this.loadLuaScripts();
            
        } catch (error) {
            this.logger.error('Failed to initialize Redis Rate Limiter', { error });
            this.enabled = false;
            // Don't throw - allow app to continue without rate limiting
        }
    }
    
    /**
     * Load Lua scripts for atomic Redis operations
     */
    async loadLuaScripts() {
        // Sliding window rate limiter script
        this.slidingWindowScript = `
            local key = KEYS[1]
            local window = tonumber(ARGV[1])
            local limit = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local expiry = tonumber(ARGV[4])
            
            -- Remove expired entries
            redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
            
            -- Count current requests
            local current = redis.call('ZCARD', key)
            
            if current < limit then
                -- Add current request
                redis.call('ZADD', key, now, now .. ':' .. math.random())
                redis.call('EXPIRE', key, expiry)
                return {1, limit - current - 1, current + 1}
            else
                return {0, 0, current}
            end
        `;
        
        // Token bucket script
        this.tokenBucketScript = `
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refill_rate = tonumber(ARGV[2])
            local refill_period = tonumber(ARGV[3])
            local tokens_requested = tonumber(ARGV[4])
            local now = tonumber(ARGV[5])
            local expiry = tonumber(ARGV[6])
            
            local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
            local tokens = tonumber(bucket[1]) or capacity
            local last_refill = tonumber(bucket[2]) or now
            
            -- Calculate tokens to add
            local time_passed = now - last_refill
            local tokens_to_add = math.floor(time_passed / refill_period * refill_rate)
            tokens = math.min(capacity, tokens + tokens_to_add)
            
            if tokens >= tokens_requested then
                tokens = tokens - tokens_requested
                redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
                redis.call('EXPIRE', key, expiry)
                return {1, tokens, capacity}
            else
                redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
                redis.call('EXPIRE', key, expiry)
                return {0, tokens, capacity}
            end
        `;
        
        // Fixed window script
        this.fixedWindowScript = `
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            
            local window_start = math.floor(now / window) * window
            local window_key = key .. ':' .. window_start
            
            local current = redis.call('INCR', window_key)
            redis.call('EXPIRE', window_key, window / 1000)
            
            if current <= limit then
                return {1, limit - current, current}
            else
                return {0, 0, current}
            end
        `;
        
        this.logger.debug('Lua scripts loaded for atomic rate limiting operations');
    }
    
    /**
     * Create rate limiting middleware
     */
    createMiddleware(configName = 'api') {
        // If Redis is not enabled, return a no-op middleware
        if (!this.enabled) {
            return (req, res, next) => next();
        }
        
        const config = this.defaultConfigs[configName];
        if (!config) {
            throw new Error(`Rate limit configuration '${configName}' not found`);
        }
        
        return async (req, res, next) => {
            try {
                const result = await this.checkRateLimit(req, config);
                
                // Add rate limit headers
                res.set({
                    'X-RateLimit-Limit': config.maxRequests,
                    'X-RateLimit-Remaining': result.remaining,
                    'X-RateLimit-Used': result.used,
                    'X-RateLimit-Window': config.windowMs,
                    'X-RateLimit-Algorithm': config.algorithm
                });
                
                if (result.allowed) {
                    this.stats.requestsProcessed++;
                    next();
                } else {
                    this.stats.requestsBlocked++;
                    
                    // Add retry-after header for blocked requests
                    const retryAfter = Math.ceil(config.windowMs / 1000);
                    res.set('Retry-After', retryAfter);
                    
                    this.logger.warn('Rate limit exceeded', {
                        key: result.key,
                        algorithm: config.algorithm,
                        limit: config.maxRequests,
                        used: result.used
                    });
                    
                    res.status(429).json({
                        error: 'Too Many Requests',
                        code: 'RATE_LIMIT_EXCEEDED',
                        limit: config.maxRequests,
                        used: result.used,
                        windowMs: config.windowMs,
                        retryAfter
                    });
                }
                
            } catch (error) {
                this.stats.errorCount++;
                this.logger.error('Rate limiting error', { error: error.message });
                
                // Fail open - allow request if rate limiter fails
                next();
            }
        };
    }
    
    /**
     * Check rate limit for a request
     */
    async checkRateLimit(req, config) {
        const key = config.keyGenerator(req);
        const now = Date.now();
        
        let result;
        
        switch (config.algorithm) {
            case 'sliding_window':
                result = await this.checkSlidingWindow(key, config, now);
                break;
                
            case 'token_bucket':
                result = await this.checkTokenBucket(key, config, now);
                break;
                
            case 'fixed_window':
                result = await this.checkFixedWindow(key, config, now);
                break;
                
            case 'exponential_backoff':
                result = await this.checkExponentialBackoff(key, config, now);
                break;
                
            default:
                throw new Error(`Unknown rate limiting algorithm: ${config.algorithm}`);
        }
        
        // Update algorithm usage stats
        const algorithmCount = this.stats.algorithmsUsed.get(config.algorithm) || 0;
        this.stats.algorithmsUsed.set(config.algorithm, algorithmCount + 1);
        
        return {
            ...result,
            key,
            algorithm: config.algorithm
        };
    }
    
    /**
     * Sliding window rate limiter
     */
    async checkSlidingWindow(key, config, now) {
        const expiry = Math.ceil(config.windowMs / 1000) + 1;
        
        const result = await this.redis.eval(
            this.slidingWindowScript,
            1,
            key,
            config.windowMs,
            config.maxRequests,
            now,
            expiry
        );
        
        return {
            allowed: result[0] === 1,
            remaining: result[1],
            used: result[2]
        };
    }
    
    /**
     * Token bucket rate limiter
     */
    async checkTokenBucket(key, config, now) {
        const capacity = config.burstSize || config.maxRequests;
        const refillRate = config.refillRate || config.maxRequests;
        const refillPeriod = config.windowMs / refillRate; // ms per token
        const expiry = Math.ceil(config.windowMs / 1000) + 1;
        
        const result = await this.redis.eval(
            this.tokenBucketScript,
            1,
            key,
            capacity,
            refillRate,
            refillPeriod,
            1, // tokens requested
            now,
            expiry
        );
        
        return {
            allowed: result[0] === 1,
            remaining: result[1],
            used: result[2] - result[1]
        };
    }
    
    /**
     * Fixed window rate limiter
     */
    async checkFixedWindow(key, config, now) {
        const result = await this.redis.eval(
            this.fixedWindowScript,
            1,
            key,
            config.maxRequests,
            config.windowMs,
            now
        );
        
        return {
            allowed: result[0] === 1,
            remaining: result[1],
            used: result[2]
        };
    }
    
    /**
     * Exponential backoff rate limiter
     */
    async checkExponentialBackoff(key, config, now) {
        const attempts = await this.redis.get(`${key}:attempts`) || 0;
        const lastAttempt = await this.redis.get(`${key}:last`) || 0;
        
        const attemptCount = parseInt(attempts);
        const timeSinceLastAttempt = now - parseInt(lastAttempt);
        
        // Calculate backoff time
        const backoffTime = Math.pow(config.backoffMultiplier || 2, attemptCount) * 1000;
        
        if (attemptCount >= config.maxRequests && timeSinceLastAttempt < backoffTime) {
            return {
                allowed: false,
                remaining: 0,
                used: attemptCount,
                backoffTime: backoffTime - timeSinceLastAttempt
            };
        }
        
        // Reset if window has passed
        if (timeSinceLastAttempt > config.windowMs) {
            await this.redis.del(`${key}:attempts`, `${key}:last`);
            await this.redis.setex(`${key}:attempts`, Math.ceil(config.windowMs / 1000), 1);
            await this.redis.setex(`${key}:last`, Math.ceil(config.windowMs / 1000), now);
            
            return {
                allowed: true,
                remaining: config.maxRequests - 1,
                used: 1
            };
        }
        
        // Increment attempts
        await this.redis.incr(`${key}:attempts`);
        await this.redis.setex(`${key}:last`, Math.ceil(config.windowMs / 1000), now);
        
        return {
            allowed: attemptCount < config.maxRequests,
            remaining: Math.max(0, config.maxRequests - attemptCount - 1),
            used: attemptCount + 1
        };
    }
    
    /**
     * Get client identifier for rate limiting
     */
    getClientId(req) {
        // Priority order: API key, user ID, forwarded IP, direct IP
        if (req.headers['x-api-key']) {
            return `api:${req.headers['x-api-key']}`;
        }
        
        if (req.user && req.user.id) {
            return `user:${req.user.id}`;
        }
        
        // Handle forwarded IPs (from proxy/load balancer)
        const forwarded = req.get('X-Forwarded-For');
        if (forwarded) {
            const ip = forwarded.split(',')[0].trim();
            return `ip:${ip}`;
        }
        
        return `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
    }
    
    /**
     * Create custom rate limiter with specific configuration
     */
    createCustomLimiter(config) {
        const mergedConfig = {
            ...this.defaultConfigs.api,
            ...config
        };
        
        return async (req, res, next) => {
            try {
                const result = await this.checkRateLimit(req, mergedConfig);
                
                res.set({
                    'X-RateLimit-Limit': mergedConfig.maxRequests,
                    'X-RateLimit-Remaining': result.remaining,
                    'X-RateLimit-Used': result.used
                });
                
                if (result.allowed) {
                    next();
                } else {
                    res.status(429).json({
                        error: 'Rate limit exceeded',
                        retryAfter: Math.ceil(mergedConfig.windowMs / 1000)
                    });
                }
                
            } catch (error) {
                this.logger.error('Custom rate limiter error', { error: error.message });
                next(); // Fail open
            }
        };
    }
    
    /**
     * Whitelist an IP or identifier
     */
    async addToWhitelist(identifier, expirySeconds = null) {
        const key = `whitelist:${identifier}`;
        
        if (expirySeconds) {
            await this.redis.setex(key, expirySeconds, '1');
        } else {
            await this.redis.set(key, '1');
        }
        
        this.logger.info('Added to whitelist', { identifier, expiry: expirySeconds });
    }
    
    /**
     * Remove from whitelist
     */
    async removeFromWhitelist(identifier) {
        const key = `whitelist:${identifier}`;
        await this.redis.del(key);
        this.logger.info('Removed from whitelist', { identifier });
    }
    
    /**
     * Check if identifier is whitelisted
     */
    async isWhitelisted(identifier) {
        const key = `whitelist:${identifier}`;
        const result = await this.redis.get(key);
        return result === '1';
    }
    
    /**
     * Blacklist an IP or identifier
     */
    async addToBlacklist(identifier, reason = 'Rate limit abuse', expirySeconds = 3600) {
        const key = `blacklist:${identifier}`;
        
        await this.redis.setex(key, expirySeconds, JSON.stringify({
            reason,
            timestamp: Date.now(),
            expiry: expirySeconds
        }));
        
        this.logger.warn('Added to blacklist', { identifier, reason, expiry: expirySeconds });
    }
    
    /**
     * Remove from blacklist
     */
    async removeFromBlacklist(identifier) {
        const key = `blacklist:${identifier}`;
        await this.redis.del(key);
        this.logger.info('Removed from blacklist', { identifier });
    }
    
    /**
     * Check if identifier is blacklisted
     */
    async isBlacklisted(identifier) {
        const key = `blacklist:${identifier}`;
        const result = await this.redis.get(key);
        
        if (result) {
            try {
                return JSON.parse(result);
            } catch (error) {
                return { reason: 'Blacklisted', timestamp: Date.now() };
            }
        }
        
        return false;
    }
    
    /**
     * Get rate limit statistics
     */
    async getStats() {
        const activeKeys = await this.redis.keys('api:*');
        const blacklistKeys = await this.redis.keys('blacklist:*');
        const whitelistKeys = await this.redis.keys('whitelist:*');
        
        return {
            system: this.stats,
            active: {
                rateLimitKeys: activeKeys.length,
                blacklistedIPs: blacklistKeys.length,
                whitelistedIPs: whitelistKeys.length
            },
            algorithms: Object.fromEntries(this.stats.algorithmsUsed),
            redis: {
                status: this.redis.status,
                host: this.redisConfig.host,
                port: this.redisConfig.port
            }
        };
    }
    
    /**
     * Reset rate limit for specific key
     */
    async resetRateLimit(identifier) {
        const patterns = [
            `api:${identifier}*`,
            `ai:${identifier}*`,
            `updates:${identifier}*`,
            `summaries:${identifier}*`,
            `auth:${identifier}*`
        ];
        
        for (const pattern of patterns) {
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
        
        this.logger.info('Rate limit reset', { identifier });
    }
    
    /**
     * Get current rate limit status for identifier
     */
    async getRateLimitStatus(identifier) {
        const status = {};
        
        for (const [configName, config] of Object.entries(this.defaultConfigs)) {
            const key = config.keyGenerator({ 
                headers: {}, 
                ip: identifier.replace('ip:', ''),
                user: { id: identifier.replace('user:', '') },
                body: {}
            });
            
            try {
                // Get current usage based on algorithm
                let usage;
                
                switch (config.algorithm) {
                    case 'sliding_window':
                        const count = await this.redis.zcard(key);
                        usage = {
                            used: count,
                            remaining: Math.max(0, config.maxRequests - count),
                            resetTime: null
                        };
                        break;
                        
                    case 'token_bucket':
                        const bucket = await this.redis.hmget(key, 'tokens', 'last_refill');
                        const tokens = parseInt(bucket[0]) || config.maxRequests;
                        usage = {
                            used: config.maxRequests - tokens,
                            remaining: tokens,
                            resetTime: null
                        };
                        break;
                        
                    default:
                        usage = { used: 0, remaining: config.maxRequests, resetTime: null };
                }
                
                status[configName] = {
                    algorithm: config.algorithm,
                    limit: config.maxRequests,
                    windowMs: config.windowMs,
                    ...usage
                };
                
            } catch (error) {
                status[configName] = { error: error.message };
            }
        }
        
        return status;
    }
    
    /**
     * Cleanup expired keys (maintenance task)
     */
    async cleanup() {
        try {
            // This is automatically handled by Redis EXPIRE, but we can add additional cleanup logic
            const expiredKeys = await this.redis.keys('*:expired:*');
            if (expiredKeys.length > 0) {
                await this.redis.del(...expiredKeys);
                this.logger.debug('Cleaned up expired rate limit keys', { count: expiredKeys.length });
            }
        } catch (error) {
            this.logger.error('Rate limit cleanup failed', { error: error.message });
        }
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Redis Rate Limiter...');
            await this.redis.disconnect();
            this.logger.info('Redis Rate Limiter shutdown complete');
        } catch (error) {
            this.logger.error('Error during Redis Rate Limiter shutdown', { error });
        }
    }
}