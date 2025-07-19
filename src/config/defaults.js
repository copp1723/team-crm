/**
 * Centralized configuration defaults
 * Consolidates all hardcoded values into a single location
 */

export const defaults = {
    server: {
        port: process.env.PORT || 8080,
        host: process.env.HOST || 'localhost',
        env: process.env.NODE_ENV || 'development'
    },
    
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        name: process.env.DB_NAME || 'team_crm',
        user: process.env.DB_USER || process.env.USER,
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000')
    },
    
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'team-crm:',
        retryStrategy: (times) => Math.min(times * 50, 2000)
    },
    
    rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10'),
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true'
    },
    
    queue: {
        defaultJobOptions: {
            attempts: parseInt(process.env.QUEUE_JOB_ATTEMPTS || '3'),
            backoff: {
                type: 'exponential',
                delay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '2000')
            },
            removeOnComplete: process.env.QUEUE_REMOVE_ON_COMPLETE !== 'false',
            removeOnFail: process.env.QUEUE_REMOVE_ON_FAIL === 'true'
        },
        concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5')
    },
    
    ai: {
        model: process.env.AI_MODEL || 'openai/gpt-4o-mini',
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
        timeout: parseInt(process.env.AI_TIMEOUT || '30000')
    },
    
    email: {
        inboundDomain: process.env.EMAIL_INBOUND_DOMAIN,
        fromAddress: process.env.EMAIL_FROM_ADDRESS || 'team-crm@yourdomain.com',
        maxAttachmentSize: parseInt(process.env.EMAIL_MAX_ATTACHMENT_SIZE || '10485760'), // 10MB
        processingTimeout: parseInt(process.env.EMAIL_PROCESSING_TIMEOUT || '60000')
    },
    
    websocket: {
        pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000'),
        pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '5000'),
        maxPayloadSize: parseInt(process.env.WS_MAX_PAYLOAD_SIZE || '1048576') // 1MB
    },
    
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '7'),
        maxSize: process.env.LOG_MAX_SIZE || '10m'
    },
    
    security: {
        corsOrigin: process.env.CORS_ORIGIN || '*',
        sessionSecret: process.env.SESSION_SECRET || 'default-dev-secret-change-in-production',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10'),
        jwtExpiry: process.env.JWT_EXPIRY || '24h'
    },
    
    features: {
        enableDatabase: process.env.ENABLE_DATABASE !== 'false',
        enableRedis: process.env.ENABLE_REDIS !== 'false',
        enableEmail: process.env.ENABLE_EMAIL === 'true',
        enableCalendar: process.env.ENABLE_CALENDAR === 'true',
        enableWebsocket: process.env.ENABLE_WEBSOCKET !== 'false',
        enableMemoryStats: process.env.ENABLE_MEMORY_STATS === 'true'
    }
};

/**
 * Helper function to get nested config values safely
 * @param {string} path - Dot-separated path (e.g., 'server.port')
 * @param {any} defaultValue - Default value if path doesn't exist
 */
export function getConfig(path, defaultValue = undefined) {
    const keys = path.split('.');
    let value = defaults;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return defaultValue;
        }
    }
    
    return value;
}

/**
 * Validates that required configuration values are present
 * @throws {Error} If required configuration is missing
 */
export function validateConfig() {
    const required = [
        { path: 'server.port', name: 'Server port' },
        { path: 'database.host', name: 'Database host' },
        { path: 'redis.host', name: 'Redis host' }
    ];
    
    const missing = [];
    for (const { path, name } of required) {
        if (!getConfig(path)) {
            missing.push(name);
        }
    }
    
    if (missing.length > 0) {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
}

export default defaults;