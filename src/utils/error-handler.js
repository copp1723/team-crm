/**
 * Centralized Error Handling System
 * Provides consistent error handling, logging, and user-facing responses
 */

import { logger } from './logger.js';

/**
 * Error categories for classification
 */
export const ErrorCategories = {
    VALIDATION: 'validation',
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    DATABASE: 'database',
    EXTERNAL_API: 'external_api',
    SYSTEM: 'system',
    BUSINESS_LOGIC: 'business_logic',
    RATE_LIMIT: 'rate_limit',
    UNKNOWN: 'unknown'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Centralized error handler class
 */
export class ErrorHandler {
    constructor(options = {}) {
        this.logger = options.logger || logger;
        this.includeStack = options.includeStack !== false;
        this.sanitizeOutput = options.sanitizeOutput !== false;
        
        // Error counters for monitoring
        this.errorCounts = new Map();
        this.lastReset = Date.now();
    }

    /**
     * Handle and log an error with context
     */
    handle(error, context = {}) {
        const errorInfo = this.analyzeError(error, context);
        
        // Log the error
        this.logError(errorInfo);
        
        // Update metrics
        this.updateMetrics(errorInfo);
        
        // Return sanitized response for client
        return this.createResponse(errorInfo);
    }

    /**
     * Analyze error and extract relevant information
     */
    analyzeError(error, context) {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            message: error.message || 'Unknown error occurred',
            category: this.categorizeError(error, context),
            severity: this.determineSeverity(error, context),
            stack: this.includeStack ? error.stack : undefined,
            code: error.code || error.statusCode || 'UNKNOWN',
            context: this.sanitizeContext(context),
            originalError: error
        };

        return errorInfo;
    }

    /**
     * Categorize error based on type and context
     */
    categorizeError(error, context) {
        // Check error code or type
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return ErrorCategories.EXTERNAL_API;
        }
        
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
            return ErrorCategories.SYSTEM;
        }
        
        if (error.statusCode === 401 || error.message?.includes('unauthorized')) {
            return ErrorCategories.AUTHENTICATION;
        }
        
        if (error.statusCode === 403 || error.message?.includes('forbidden')) {
            return ErrorCategories.AUTHORIZATION;
        }
        
        if (error.statusCode === 429 || error.message?.includes('rate limit')) {
            return ErrorCategories.RATE_LIMIT;
        }
        
        if (error.statusCode >= 400 && error.statusCode < 500) {
            return ErrorCategories.VALIDATION;
        }
        
        // Check context for hints
        if (context.operation?.includes('database') || context.operation?.includes('db')) {
            return ErrorCategories.DATABASE;
        }
        
        if (context.operation?.includes('api') || context.operation?.includes('fetch')) {
            return ErrorCategories.EXTERNAL_API;
        }
        
        return ErrorCategories.UNKNOWN;
    }

    /**
     * Determine error severity
     */
    determineSeverity(error, context) {
        // Critical errors
        if (error.code === 'ECONNREFUSED' && context.operation?.includes('database')) {
            return ErrorSeverity.CRITICAL;
        }
        
        if (error.statusCode >= 500) {
            return ErrorSeverity.HIGH;
        }
        
        // Authentication/Authorization issues
        if (error.statusCode === 401 || error.statusCode === 403) {
            return ErrorSeverity.MEDIUM;
        }
        
        // Validation errors
        if (error.statusCode >= 400 && error.statusCode < 500) {
            return ErrorSeverity.LOW;
        }
        
        return ErrorSeverity.MEDIUM;
    }

    /**
     * Log error with appropriate level
     */
    logError(errorInfo) {
        const logData = {
            category: errorInfo.category,
            severity: errorInfo.severity,
            code: errorInfo.code,
            context: errorInfo.context,
            stack: errorInfo.stack
        };

        switch (errorInfo.severity) {
            case ErrorSeverity.CRITICAL:
                this.logger.error(`[CRITICAL] ${errorInfo.message}`, logData);
                break;
            case ErrorSeverity.HIGH:
                this.logger.error(`[HIGH] ${errorInfo.message}`, logData);
                break;
            case ErrorSeverity.MEDIUM:
                this.logger.warn(`[MEDIUM] ${errorInfo.message}`, logData);
                break;
            case ErrorSeverity.LOW:
                this.logger.info(`[LOW] ${errorInfo.message}`, logData);
                break;
            default:
                this.logger.error(errorInfo.message, logData);
        }
    }

    /**
     * Create sanitized response for client
     */
    createResponse(errorInfo) {
        const response = {
            error: true,
            message: this.getUserFriendlyMessage(errorInfo),
            code: errorInfo.code,
            timestamp: errorInfo.timestamp
        };

        // Include additional details for development
        if (process.env.NODE_ENV === 'development') {
            response.category = errorInfo.category;
            response.severity = errorInfo.severity;
            if (errorInfo.stack) {
                response.stack = errorInfo.stack;
            }
        }

        return response;
    }

    /**
     * Generate user-friendly error messages
     */
    getUserFriendlyMessage(errorInfo) {
        switch (errorInfo.category) {
            case ErrorCategories.VALIDATION:
                return 'Invalid input provided. Please check your data and try again.';
            case ErrorCategories.AUTHENTICATION:
                return 'Authentication required. Please log in and try again.';
            case ErrorCategories.AUTHORIZATION:
                return 'You do not have permission to perform this action.';
            case ErrorCategories.DATABASE:
                return 'A database error occurred. Please try again later.';
            case ErrorCategories.EXTERNAL_API:
                return 'External service is temporarily unavailable. Please try again later.';
            case ErrorCategories.RATE_LIMIT:
                return 'Too many requests. Please wait a moment and try again.';
            case ErrorCategories.SYSTEM:
                return 'A system error occurred. Please try again later.';
            default:
                return 'An unexpected error occurred. Please try again later.';
        }
    }

    /**
     * Sanitize context to remove sensitive information
     */
    sanitizeContext(context) {
        if (!this.sanitizeOutput) {
            return context;
        }

        const sanitized = { ...context };
        const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth'];
        
        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                    result[key] = '[REDACTED]';
                } else if (typeof value === 'object') {
                    result[key] = sanitizeObject(value);
                } else {
                    result[key] = value;
                }
            }
            return result;
        };

        return sanitizeObject(sanitized);
    }

    /**
     * Update error metrics
     */
    updateMetrics(errorInfo) {
        const key = `${errorInfo.category}:${errorInfo.severity}`;
        const current = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, current + 1);
    }

    /**
     * Get error metrics
     */
    getMetrics() {
        const metrics = {
            totalErrors: 0,
            byCategory: {},
            bySeverity: {},
            timePeriod: Date.now() - this.lastReset
        };

        for (const [key, count] of this.errorCounts) {
            const [category, severity] = key.split(':');
            metrics.totalErrors += count;
            
            metrics.byCategory[category] = (metrics.byCategory[category] || 0) + count;
            metrics.bySeverity[severity] = (metrics.bySeverity[severity] || 0) + count;
        }

        return metrics;
    }

    /**
     * Reset error metrics
     */
    resetMetrics() {
        this.errorCounts.clear();
        this.lastReset = Date.now();
    }
}

/**
 * Express.js error handling middleware
 */
export function createErrorMiddleware(errorHandler) {
    return (error, req, res, next) => {
        const context = {
            operation: 'express_request',
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        };

        const response = errorHandler.handle(error, context);
        
        // Determine status code
        let statusCode = 500;
        if (error.statusCode) {
            statusCode = error.statusCode;
        } else if (response.code && typeof response.code === 'number') {
            statusCode = response.code;
        }

        res.status(statusCode).json(response);
    };
}

/**
 * Async wrapper to handle promise rejections
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Create custom error classes
 */
export class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        this.field = field;
    }
}

export class AuthenticationError extends Error {
    constructor(message = 'Authentication required') {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = 401;
    }
}

export class AuthorizationError extends Error {
    constructor(message = 'Insufficient permissions') {
        super(message);
        this.name = 'AuthorizationError';
        this.statusCode = 403;
    }
}

export class RateLimitError extends Error {
    constructor(message = 'Rate limit exceeded') {
        super(message);
        this.name = 'RateLimitError';
        this.statusCode = 429;
    }
}

// Export default error handler instance
export const errorHandler = new ErrorHandler();