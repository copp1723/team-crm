/**
 * Database Connection Pool with Error Recovery
 * Provides robust PostgreSQL connection management
 */

import pg from 'pg';
const { Pool } = pg;

export class DatabasePool {
    constructor(config = {}) {
        this.config = {
            connectionString: config.connectionString || process.env.DATABASE_URL,
            max: config.max || 10, // Maximum number of clients in pool
            min: config.min || 2,  // Minimum number of clients in pool
            idleTimeoutMillis: config.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
            acquireTimeoutMillis: config.acquireTimeoutMillis || 60000,
            ssl: config.ssl !== false ? { rejectUnauthorized: false } : false
        };
        
        this.pool = null;
        this.isConnected = false;
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            failedConnections: 0,
            queryCount: 0,
            errorCount: 0,
            lastError: null
        };
        
        this.healthCheckInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // Start with 5 seconds
    }
    
    /**
     * Initialize the connection pool
     */
    async initialize() {
        try {
            console.log('Initializing database connection pool...');
            
            this.pool = new Pool(this.config);
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Test the connection
            await this.testConnection();
            
            // Start health checks
            this.startHealthChecks();
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            console.log('Database pool initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to initialize database pool:', error);
            this.stats.lastError = error;
            throw error;
        }
    }
    
    /**
     * Setup event handlers for the pool
     */
    setupEventHandlers() {
        this.pool.on('connect', (client) => {
            this.stats.totalConnections++;
            this.stats.activeConnections++;
            console.log('New database client connected');
        });
        
        this.pool.on('remove', (client) => {
            this.stats.activeConnections--;
            console.log('Database client removed');
        });
        
        this.pool.on('error', (err, client) => {
            this.stats.errorCount++;
            this.stats.lastError = err;
            console.error('Unexpected database error:', err);
            
            // Attempt to recover
            this.handleConnectionError(err);
        });
        
        this.pool.on('acquire', (client) => {
            // Client acquired from pool
        });
        
        this.pool.on('release', (err, client) => {
            if (err) {
                this.stats.errorCount++;
                console.error('Error releasing client:', err);
            }
        });
    }
    
    /**
     * Test database connection
     */
    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time');
            console.log('Database connection test successful:', result.rows[0].current_time);
            return true;
        } finally {
            client.release();
        }
    }
    
    /**
     * Execute a query with automatic retry and error handling
     */
    async query(text, params = [], options = {}) {
        const maxRetries = options.maxRetries || 3;
        const retryDelay = options.retryDelay || 1000;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const start = Date.now();
                const result = await this.pool.query(text, params);
                const duration = Date.now() - start;
                
                this.stats.queryCount++;
                
                // Log slow queries
                if (duration > 1000) {
                    console.warn(`Slow query detected (${duration}ms):`, text.substring(0, 100));
                }
                
                return result;
                
            } catch (error) {
                this.stats.errorCount++;
                this.stats.lastError = error;
                
                if (attempt === maxRetries) {
                    console.error(`Query failed after ${maxRetries} attempts:`, error);
                    throw error;
                }
                
                if (this.isRetryableError(error)) {
                    console.warn(`Query attempt ${attempt} failed, retrying in ${retryDelay}ms:`, error.message);
                    await this.sleep(retryDelay);
                } else {
                    throw error; // Don't retry non-retryable errors
                }
            }
        }
    }
    
    /**
     * Execute a transaction with automatic retry
     */
    async transaction(callback, options = {}) {
        const maxRetries = options.maxRetries || 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const client = await this.pool.connect();
            
            try {
                await client.query('BEGIN');
                const result = await callback(client);
                await client.query('COMMIT');
                return result;
                
            } catch (error) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
                
                if (attempt === maxRetries || !this.isRetryableError(error)) {
                    throw error;
                }
                
                console.warn(`Transaction attempt ${attempt} failed, retrying:`, error.message);
                await this.sleep(1000 * attempt);
                
            } finally {
                client.release();
            }
        }
    }
    
    /**
     * Get a client from the pool for manual management
     */
    async getClient() {
        try {
            return await this.pool.connect();
        } catch (error) {
            this.stats.errorCount++;
            this.stats.failedConnections++;
            throw error;
        }
    }
    
    /**
     * Get pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            poolStats: {
                totalCount: this.pool?.totalCount || 0,
                idleCount: this.pool?.idleCount || 0,
                waitingCount: this.pool?.waitingCount || 0
            },
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    /**
     * Start health checks
     */
    startHealthChecks() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.healthCheck();
            } catch (error) {
                console.error('Health check failed:', error);
                this.handleConnectionError(error);
            }
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Perform health check
     */
    async healthCheck() {
        const start = Date.now();
        const result = await this.query('SELECT 1 as health_check');
        const duration = Date.now() - start;
        
        if (duration > 5000) {
            console.warn(`Database health check slow: ${duration}ms`);
        }
        
        return result.rowCount === 1;
    }
    
    /**
     * Handle connection errors and attempt recovery
     */
    async handleConnectionError(error) {
        console.error('Database connection error detected:', error.message);
        
        this.isConnected = false;
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
            
            setTimeout(async () => {
                try {
                    await this.testConnection();
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    console.log('Database connection recovered');
                } catch (reconnectError) {
                    console.error('Reconnection failed:', reconnectError);
                    this.handleConnectionError(reconnectError);
                }
            }, delay);
        } else {
            console.error('Max reconnection attempts reached. Manual intervention required.');
        }
    }
    
    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        const retryableCodes = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND',
            'ECONNREFUSED',
            '53300', // too_many_connections
            '53400', // configuration_limit_exceeded
            '08000', // connection_exception
            '08003', // connection_does_not_exist
            '08006', // connection_failure
            '08001', // sqlclient_unable_to_establish_sqlconnection
            '08004', // sqlserver_rejected_establishment_of_sqlconnection
        ];
        
        return retryableCodes.some(code => 
            error.code === code || 
            error.message?.includes(code) ||
            error.message?.includes('connection') ||
            error.message?.includes('timeout')
        );
    }
    
    /**
     * Gracefully shutdown the pool
     */
    async shutdown() {
        console.log('Shutting down database pool...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        if (this.pool) {
            try {
                await this.pool.end();
                console.log('Database pool closed');
            } catch (error) {
                console.error('Error closing database pool:', error);
            }
        }
        
        this.isConnected = false;
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Create tables if they don't exist
     */
    async initializeTables() {
        const createTablesSQL = `
            -- Create team_members table if not exists
            CREATE TABLE IF NOT EXISTS team_members (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                external_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(100),
                email VARCHAR(255),
                active BOOLEAN DEFAULT true,
                ai_model VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create team_updates table if not exists
            CREATE TABLE IF NOT EXISTS team_updates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                member_id UUID REFERENCES team_members(id),
                update_text TEXT NOT NULL,
                source VARCHAR(50) DEFAULT 'api',
                priority VARCHAR(20) DEFAULT 'medium',
                is_urgent BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create update_extractions table if not exists
            CREATE TABLE IF NOT EXISTS update_extractions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                update_id UUID REFERENCES team_updates(id),
                extraction_type VARCHAR(100),
                content JSONB,
                confidence_score DECIMAL(3,2),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_team_updates_member_created ON team_updates(member_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_update_extractions_update_id ON update_extractions(update_id);
            CREATE INDEX IF NOT EXISTS idx_team_members_external_id ON team_members(external_id);
        `;
        
        try {
            await this.query(createTablesSQL);
            console.log('Database tables initialized successfully');
        } catch (error) {
            console.error('Failed to initialize database tables:', error);
            throw error;
        }
    }
}