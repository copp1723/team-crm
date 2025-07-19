/**
 * Centralized API error handler utility
 * Provides consistent error handling across all API endpoints
 */

export class ApiError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', userMessage = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.userMessage = userMessage || message;
    }
}

/**
 * Wraps async route handlers to provide consistent error handling
 * @param {Object} logger - Logger instance
 * @param {Function} operation - Async function to wrap
 * @returns {Function} Express middleware function
 */
export function handleApiError(logger, operation) {
    return async (req, res, next) => {
        try {
            await operation(req, res, next);
        } catch (error) {
            // Log the full error details
            logger.error(`Failed in ${operation.name || 'unknown operation'}`, { 
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                params: req.params,
                query: req.query,
                user: req.user?.id
            });

            // Handle known ApiError instances
            if (error instanceof ApiError) {
                return res.status(error.statusCode).json({
                    error: error.userMessage,
                    code: error.code
                });
            }

            // Handle validation errors
            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    error: 'Validation failed',
                    code: 'VALIDATION_ERROR',
                    details: error.details || error.message
                });
            }

            // Handle database errors
            if (error.code && error.code.startsWith('23')) { // PostgreSQL error codes
                return res.status(400).json({
                    error: 'Database operation failed',
                    code: 'DATABASE_ERROR'
                });
            }

            // Default error response
            res.status(500).json({
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    };
}

/**
 * Creates a standardized error response
 * @param {string} message - Error message for logging
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code for client
 * @param {string} userMessage - User-friendly error message
 */
export function createApiError(message, statusCode = 500, code = 'INTERNAL_ERROR', userMessage = null) {
    return new ApiError(message, statusCode, code, userMessage);
}

/**
 * Common error factories
 */
export const errors = {
    notFound: (resource) => new ApiError(
        `${resource} not found`,
        404,
        'NOT_FOUND',
        `The requested ${resource.toLowerCase()} was not found`
    ),
    
    unauthorized: (message = 'Unauthorized access') => new ApiError(
        message,
        401,
        'UNAUTHORIZED',
        'You are not authorized to perform this action'
    ),
    
    badRequest: (message) => new ApiError(
        message,
        400,
        'BAD_REQUEST',
        message
    ),
    
    conflict: (message) => new ApiError(
        message,
        409,
        'CONFLICT',
        message
    ),
    
    rateLimit: () => new ApiError(
        'Rate limit exceeded',
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many requests. Please try again later.'
    )
};