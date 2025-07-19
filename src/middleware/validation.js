/**
 * Request Validation and Sanitization Middleware
 * Hardens the API against malformed or malicious inputs
 */

export class ValidationMiddleware {
    
    /**
     * Validate team update requests
     */
    static validateTeamUpdate(req, res, next) {
        try {
            const { memberName, updateText, metadata } = req.body;
            
            // Required field validation
            if (!memberName || typeof memberName !== 'string') {
                return res.status(400).json({
                    error: 'Hey, looks like you forgot to tell us who you are. Mind selecting your name?',
                    code: 'INVALID_MEMBER_NAME'
                });
            }
            
            if (!updateText || typeof updateText !== 'string') {
                return res.status(400).json({
                    error: 'Hey, looks like your update was empty. Mind adding some content?',
                    code: 'INVALID_UPDATE_TEXT'
                });
            }
            
            // Length limits
            if (memberName.length > 100) {
                return res.status(400).json({
                    error: 'Whoa, that\'s a really long name! Let\'s keep it under 100 characters, okay?',
                    code: 'MEMBER_NAME_TOO_LONG'
                });
            }
            
            if (updateText.length > 10000) {
                return res.status(400).json({
                    error: 'That\'s quite a novel you\'ve got there! How about we keep it under 10,000 characters? You could split it into multiple updates if needed.',
                    code: 'UPDATE_TEXT_TOO_LONG'
                });
            }
            
            if (updateText.length < 10) {
                return res.status(400).json({
                    error: 'Could you add a bit more detail? We need at least 10 characters to make it worth processing.',
                    code: 'UPDATE_TEXT_TOO_SHORT'
                });
            }
            
            // No content validation - internal tool only
            // All content is allowed for trusted team members
            
            // Minimal sanitization - just trim whitespace
            req.body.memberName = memberName.trim();
            req.body.updateText = updateText.trim();
            
            // Validate metadata if present
            if (metadata) {
                if (typeof metadata !== 'object' || Array.isArray(metadata)) {
                    return res.status(400).json({
                        error: 'The metadata format doesn\'t look quite right. It should be a simple object with key-value pairs.',
                        code: 'INVALID_METADATA'
                    });
                }
                
                // Limit metadata size
                const metadataStr = JSON.stringify(metadata);
                if (metadataStr.length > 5000) {
                    return res.status(400).json({
                        error: 'Your metadata is a bit hefty! Let\'s trim it down to under 5,000 characters total.',
                        code: 'METADATA_TOO_LARGE'
                    });
                }
                
                req.body.metadata = metadata;
            }
            
            next();
            
        } catch (error) {
            console.error('Validation error:', error);
            res.status(500).json({
                error: 'Oops, something went wrong on our end while checking your update. Give it another shot?',
                code: 'VALIDATION_ERROR'
            });
        }
    }
    
    /**
     * Rate limiting middleware - DEPRECATED
     * Use RedisRateLimiter from redis-rate-limiter.js instead
     * This method is kept for backward compatibility only
     */
    static createRateLimiter(options = {}) {
        console.warn('ValidationMiddleware.createRateLimiter is deprecated. Use RedisRateLimiter instead.');
        // Import and use the Redis rate limiter as the single source of truth
        const { RedisRateLimiter } = require('./redis-rate-limiter.js');
        return RedisRateLimiter.createMiddleware(options);
    }
    
    /**
     * Security headers middleware
     */
    static securityHeaders(req, res, next) {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
        });
        next();
    }
    
    /**
     * Request size limiting middleware
     */
    static createSizeLimiter(maxSize = '1mb') {
        return (req, res, next) => {
            const contentLength = req.get('content-length');
            
            if (contentLength) {
                const sizeBytes = ValidationMiddleware.parseSize(maxSize);
                if (parseInt(contentLength) > sizeBytes) {
                    return res.status(413).json({
                        error: 'That\'s a chunky request! We can only handle up to ' + maxSize + ' at a time. Maybe break it into smaller pieces?',
                        code: 'REQUEST_TOO_LARGE',
                        maxSize
                    });
                }
            }
            
            next();
        };
    }
    
    /**
     * Minimal sanitization - just trim and normalize
     */
    static sanitizeString(str) {
        if (typeof str !== 'string') return str;
        return str.trim().normalize('NFC');
    }
    
    /**
     * Minimal text sanitization - just trim and normalize
     */
    static sanitizeText(text) {
        if (typeof text !== 'string') return text;
        return text.trim().normalize('NFC');
    }
    
    /**
     * Get client identifier for rate limiting
     */
    static getClientIdentifier(req) {
        // Use X-Forwarded-For if behind proxy, otherwise req.ip
        const forwarded = req.get('X-Forwarded-For');
        const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip;
        
        // Could also include user agent or other factors
        return ip || 'unknown';
    }
    
    /**
     * Parse size string (e.g., "1mb", "500kb") to bytes
     */
    static parseSize(sizeStr) {
        const units = {
            b: 1,
            kb: 1024,
            mb: 1024 * 1024,
            gb: 1024 * 1024 * 1024
        };
        
        const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/);
        if (!match) return 1024 * 1024; // Default 1MB
        
        const [, number, unit] = match;
        return Math.floor(parseFloat(number) * units[unit]);
    }
    
    /**
     * Minimal input sanitization for internal tool
     */
    static sanitizeInputs(req, res, next) {
        // Just ensure body exists and is an object
        if (req.body && typeof req.body === 'object') {
            // No deep sanitization needed for internal tool
            next();
        } else {
            next();
        }
    }
}