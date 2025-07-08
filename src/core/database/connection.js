/**
 * DATABASE CONNECTION MODULE
 * Handles PostgreSQL connection and query execution
 */

import pg from 'pg';
import { schemaSQL } from './schema.js';

const { Pool } = pg;

export class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.initialized = false;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            // Create connection pool
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                // Fallback to individual params if no connection string
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'team_crm',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD,
                max: 20, // Maximum number of clients in the pool
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
                ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
            });

            // Test connection
            const client = await this.pool.connect();
            console.log('✅ Database connection established');
            client.release();

            // Initialize schema
            await this.initializeSchema();
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize database schema
     */
    async initializeSchema() {
        const client = await this.pool.connect();
        try {
            console.log('📊 Initializing database schema...');
            
            // Execute schema SQL
            await client.query(schemaSQL);
            
            // Insert default team members if not exists
            await this.insertDefaultData(client);
            
            console.log('✅ Database schema initialized');
        } catch (error) {
            console.error('❌ Schema initialization failed:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Insert default team members from config
     */
    async insertDefaultData(client) {
        try {
            // Check if we have team config
            const configPath = new URL('../../../config/team-config.json', import.meta.url);
            const teamConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
            
            // Insert team members
            for (const [memberId, member] of Object.entries(teamConfig.team.members)) {
                await client.query(`
                    INSERT INTO team_members (external_id, name, role, ai_model)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (external_id) DO UPDATE
                    SET name = EXCLUDED.name,
                        role = EXCLUDED.role,
                        ai_model = EXCLUDED.ai_model
                `, [memberId, member.name, member.role, member.ai_model]);
            }
            
            // Insert executives
            for (const exec of teamConfig.team.executives || []) {
                await client.query(`
                    INSERT INTO team_members (external_id, name, role, ai_model)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (external_id) DO UPDATE
                    SET name = EXCLUDED.name,
                        role = EXCLUDED.role,
                        ai_model = EXCLUDED.ai_model
                `, [exec.id, exec.name, exec.role, exec.ai_model]);
            }
            
            console.log('✅ Default team members inserted');
        } catch (error) {
            console.warn('⚠️  Could not insert default data:', error.message);
        }
    }

    /**
     * Execute a query
     */
    async query(text, params = []) {
        if (!this.initialized) {
            throw new Error('Database not initialized');
        }
        return this.pool.query(text, params);
    }

    /**
     * Get a client for transactions
     */
    async getClient() {
        if (!this.initialized) {
            throw new Error('Database not initialized');
        }
        return this.pool.connect();
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.initialized = false;
            console.log('Database connection closed');
        }
    }
}

// Singleton instance
export const db = new DatabaseConnection();

// Helper functions for common queries
export const dbHelpers = {
    /**
     * Insert a team update
     */
    async insertTeamUpdate(memberId, updateText, source = 'chat', priority = null, isUrgent = false) {
        const result = await db.query(`
            INSERT INTO team_updates (member_id, update_text, source, priority, is_urgent)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [memberId, updateText, source, priority, isUrgent]);
        return result.rows[0];
    },

    /**
     * Create or update a deal
     */
    async upsertDeal(dealData) {
        const {
            id, client_id, owner_id, name, stage, amount, 
            probability, expected_close_date, priority, competitors, notes
        } = dealData;
        
        const result = await db.query(`
            INSERT INTO deals (
                id, client_id, owner_id, name, stage, amount, 
                probability, expected_close_date, priority, competitors, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
                client_id = EXCLUDED.client_id,
                owner_id = EXCLUDED.owner_id,
                name = EXCLUDED.name,
                stage = EXCLUDED.stage,
                amount = EXCLUDED.amount,
                probability = EXCLUDED.probability,
                expected_close_date = EXCLUDED.expected_close_date,
                priority = EXCLUDED.priority,
                competitors = EXCLUDED.competitors,
                notes = EXCLUDED.notes,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [id, client_id, owner_id, name, stage, amount, 
            probability, expected_close_date, priority, competitors, notes]);
        
        return result.rows[0];
    },

    /**
     * Record a deal activity
     */
    async recordDealActivity(dealId, updateId, memberId, activityType, oldValue, newValue, description) {
        const result = await db.query(`
            INSERT INTO deal_activities (
                deal_id, update_id, member_id, activity_type, 
                old_value, new_value, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [dealId, updateId, memberId, activityType, oldValue, newValue, description]);
        return result.rows[0];
    },

    /**
     * Save an analytics snapshot
     */
    async saveAnalyticsSnapshot(metricType, metricValue, dimension = null, dimensionValue = null, periodType = 'daily') {
        const result = await db.query(`
            INSERT INTO analytics_snapshots (
                snapshot_date, metric_type, dimension, dimension_value, 
                metric_value, period_type
            ) VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)
            ON CONFLICT (snapshot_date, metric_type, dimension, dimension_value, period_type) 
            DO UPDATE SET metric_value = EXCLUDED.metric_value
            RETURNING *
        `, [metricType, dimension, dimensionValue, metricValue, periodType]);
        return result.rows[0];
    },

    /**
     * Get pipeline summary
     */
    async getPipelineSummary() {
        const result = await db.query('SELECT * FROM pipeline_summary');
        return result.rows;
    },

    /**
     * Get team performance metrics
     */
    async getTeamPerformance() {
        const result = await db.query('SELECT * FROM team_performance');
        return result.rows;
    },

    /**
     * Get historical analytics
     */
    async getHistoricalAnalytics(metricType, startDate, endDate, dimension = null) {
        let query = `
            SELECT * FROM analytics_snapshots 
            WHERE metric_type = $1 
            AND snapshot_date BETWEEN $2 AND $3
        `;
        const params = [metricType, startDate, endDate];
        
        if (dimension) {
            query += ' AND dimension = $4';
            params.push(dimension);
        }
        
        query += ' ORDER BY snapshot_date DESC';
        
        const result = await db.query(query, params);
        return result.rows;
    },

    /**
     * Save AI context memory
     */
    async saveAIContext(contextType, entityType, entityId, contextData, confidenceScore = 0.8) {
        const result = await db.query(`
            INSERT INTO ai_context_memory (
                context_type, entity_type, entity_id, context_data, confidence_score
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (context_type, entity_type, entity_id) DO UPDATE SET
                context_data = EXCLUDED.context_data,
                confidence_score = EXCLUDED.confidence_score,
                last_updated = CURRENT_TIMESTAMP
            RETURNING *
        `, [contextType, entityType, entityId, contextData, confidenceScore]);
        return result.rows[0];
    },

    /**
     * Get AI context for an entity
     */
    async getAIContext(entityType, entityId) {
        const result = await db.query(`
            SELECT * FROM ai_context_memory 
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY last_updated DESC
        `, [entityType, entityId]);
        return result.rows;
    }
};

// Export fs for the module
import fs from 'fs/promises';