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
                    error: 'Invalid memberName: must be a non-empty string',
                    code: 'INVALID_MEMBER_NAME'
                });
            }
            
            if (!updateText || typeof updateText !== 'string') {
                return res.status(400).json({
                    error: 'Invalid updateText: must be a non-empty string',
                    code: 'INVALID_UPDATE_TEXT'
                });
            }
            
            // Length limits
            if (memberName.length > 100) {
                return res.status(400).json({
                    error: 'Member name too long (max 100 characters)',
                    code: 'MEMBER_NAME_TOO_LONG'
                });
            }
            
            if (updateText.length > 10000) {
                return res.status(400).json({
                    error: 'Update text too long (max 10,000 characters)',
                    code: 'UPDATE_TEXT_TOO_LONG'
                });
            }
            
            if (updateText.length < 10) {
                return res.status(400).json({
                    error: 'Update text too short (min 10 characters)',
                    code: 'UPDATE_TEXT_TOO_SHORT'
                });
            }
            
            // Content validation
            if (ValidationMiddleware.containsSuspiciousContent(updateText)) {
                return res.status(400).json({
                    error: 'Update contains potentially harmful content',
                    code: 'SUSPICIOUS_CONTENT'
                });
            }
            
            // Sanitize inputs
            req.body.memberName = ValidationMiddleware.sanitizeString(memberName);
            req.body.updateText = ValidationMiddleware.sanitizeText(updateText);
            
            // Validate metadata if present
            if (metadata) {
                if (typeof metadata !== 'object' || Array.isArray(metadata)) {
                    return res.status(400).json({
                        error: 'Invalid metadata: must be an object',
                        code: 'INVALID_METADATA'
                    });
                }
                
                // Limit metadata size
                const metadataStr = JSON.stringify(metadata);
                if (metadataStr.length > 5000) {
                    return res.status(400).json({
                        error: 'Metadata too large (max 5,000 characters when serialized)',
                        code: 'METADATA_TOO_LARGE'
                    });
                }
                
                req.body.metadata = ValidationMiddleware.sanitizeMetadata(metadata);
            }
            
            next();
            
        } catch (error) {
            console.error('Validation error:', error);
            res.status(500).json({
                error: 'Internal validation error',
                code: 'VALIDATION_ERROR'
            });
        }
    }
    
    /**
     * Rate limiting middleware
     */
    static createRateLimiter(options = {}) {
        const windowMs = options.windowMs || 60000; // 1 minute
        const maxRequests = options.maxRequests || 10;
        const skipSuccessfulRequests = options.skipSuccessfulRequests || false;
        
        const requests = new Map();
        
        return (req, res, next) => {
            const clientId = ValidationMiddleware.getClientIdentifier(req);
            const now = Date.now();
            const windowStart = now - windowMs;
            
            // Clean old entries
            for (const [id, timestamps] of requests.entries()) {
                const filtered = timestamps.filter(ts => ts > windowStart);
                if (filtered.length === 0) {
                    requests.delete(id);
                } else {
                    requests.set(id, filtered);
                }
            }
            
            // Check current client
            const clientRequests = requests.get(clientId) || [];
            const validRequests = clientRequests.filter(ts => ts > windowStart);
            
            if (validRequests.length >= maxRequests) {
                return res.status(429).json({
                    error: 'Too many requests',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }
            
            // Record this request
            validRequests.push(now);
            requests.set(clientId, validRequests);
            
            // Add rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - validRequests.length),
                'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
            });
            
            next();
        };
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
                        error: 'Request entity too large',
                        code: 'REQUEST_TOO_LARGE',
                        maxSize
                    });
                }
            }
            
            next();
        };
    }
    
    /**
     * Sanitize a general string
     */
    static sanitizeString(str) {
        if (typeof str !== 'string') return str;
        
        return str
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
            .normalize('NFC'); // Normalize Unicode
    }
    
    /**
     * Sanitize update text more carefully
     */
    static sanitizeText(text) {
        if (typeof text !== 'string') return text;
        
        return text
            .trim()
            .replace(/[<>]/g, '') // Remove HTML brackets
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove most control chars but keep tabs/newlines
            .replace(/\s+/g, ' ') // Normalize whitespace
            .normalize('NFC')
            .substring(0, 10000); // Enforce length limit
    }
    
    /**
     * Sanitize metadata object
     */
    static sanitizeMetadata(metadata) {
        if (typeof metadata !== 'object' || metadata === null) {
            return {};
        }
        
        const sanitized = {};
        
        for (const [key, value] of Object.entries(metadata)) {
            // Sanitize keys
            const sanitizedKey = ValidationMiddleware.sanitizeString(key).substring(0, 100);
            
            if (sanitizedKey) {
                // Sanitize values based on type
                if (typeof value === 'string') {
                    sanitized[sanitizedKey] = ValidationMiddleware.sanitizeString(value).substring(0, 500);
                } else if (typeof value === 'number' && isFinite(value)) {
                    sanitized[sanitizedKey] = value;
                } else if (typeof value === 'boolean') {
                    sanitized[sanitizedKey] = value;
                } else if (Array.isArray(value)) {
                    sanitized[sanitizedKey] = value
                        .slice(0, 20) // Limit array length
                        .map(item => typeof item === 'string' ? ValidationMiddleware.sanitizeString(item).substring(0, 200) : item)
                        .filter(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean');
                }
                // Ignore other types (objects, functions, etc.)
            }
        }
        
        return sanitized;
    }
    
    /**
     * Check for suspicious content patterns
     */
    static containsSuspiciousContent(text) {
        const suspiciousPatterns = [
            // Script injection patterns
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            
            // SQL injection patterns
            /('|(\\');)|(--)|(;)|(\/\*)|(\*\/)/gi,
            /\b(union|select|insert|update|delete|drop|create|alter)\b/gi,
            
            // Command injection patterns
            /[;&|`$]/g,
            
            // Excessive special characters
            /[<>{}[\]"'\\]{10,}/g,
            
            // Suspicious URLs
            /https?:\/\/[^\s]+\.(tk|ml|ga|cf)/gi
        ];
        
        return suspiciousPatterns.some(pattern => pattern.test(text));
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
     * Create input sanitization middleware for any endpoint
     */
    static sanitizeInputs(req, res, next) {
        // Recursively sanitize request body
        if (req.body && typeof req.body === 'object') {
            req.body = ValidationMiddleware.deepSanitize(req.body);
        }
        
        next();
    }
    
    /**
     * Deep sanitization of nested objects
     */
    static deepSanitize(obj, depth = 0) {
        if (depth > 10) return {}; // Prevent deep recursion
        
        if (typeof obj === 'string') {
            return ValidationMiddleware.sanitizeString(obj);
        }
        
        if (Array.isArray(obj)) {
            return obj.slice(0, 100).map(item => ValidationMiddleware.deepSanitize(item, depth + 1));
        }
        
        if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                const sanitizedKey = ValidationMiddleware.sanitizeString(key).substring(0, 100);
                if (sanitizedKey) {
                    sanitized[sanitizedKey] = ValidationMiddleware.deepSanitize(value, depth + 1);
                }
            }
            return sanitized;
        }
        
        return obj;
    }
}