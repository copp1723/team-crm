#!/usr/bin/env node

/**
 * Database setup script for Render deployment
 * Run this after deploying to initialize the database
 */

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
    console.log('🚀 Starting database setup for Render deployment...\n');
    
    // Check for DATABASE_URL
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL environment variable not found!');
        console.error('Please ensure you have attached a PostgreSQL database to your Render service.');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Render PostgreSQL
        }
    });

    try {
        console.log('📡 Connecting to database...');
        await client.connect();
        console.log('✅ Connected successfully!\n');

        // Read and execute schema
        console.log('📋 Creating database schema...');
        const schemaPath = path.join(__dirname, '..', 'src', 'core', 'database', 'schema.sql');
        
        // First, let's check if schema.sql exists, if not, we'll create tables directly
        try {
            const schemaSql = await fs.readFile(schemaPath, 'utf8');
            await client.query(schemaSql);
        } catch (error) {
            console.log('Schema file not found, creating tables directly...');
            
            // Create tables based on the schema.js definitions
            const tables = [
                `CREATE TABLE IF NOT EXISTS team_members (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT,
                    focus_areas TEXT[],
                    extraction_priorities TEXT[],
                    ai_model TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    company_type TEXT,
                    industry TEXT,
                    annual_revenue DECIMAL,
                    employee_count INTEGER,
                    website TEXT,
                    location TEXT,
                    timezone TEXT,
                    parent_company TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS deals (
                    id SERIAL PRIMARY KEY,
                    client_id INTEGER REFERENCES clients(id),
                    title TEXT NOT NULL,
                    stage TEXT DEFAULT 'prospect',
                    monthly_value DECIMAL,
                    implementation_fee DECIMAL,
                    total_contract_value DECIMAL,
                    probability INTEGER DEFAULT 0,
                    expected_close_date DATE,
                    actual_close_date DATE,
                    owner_id TEXT REFERENCES team_members(id),
                    priority TEXT DEFAULT 'medium',
                    product_type TEXT,
                    use_case TEXT,
                    pilot_date DATE,
                    competitors TEXT[],
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS deal_activities (
                    id SERIAL PRIMARY KEY,
                    deal_id INTEGER REFERENCES deals(id),
                    activity_type TEXT NOT NULL,
                    description TEXT,
                    team_member_id TEXT REFERENCES team_members(id),
                    activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata JSONB
                )`,
                
                `CREATE TABLE IF NOT EXISTS team_updates (
                    id SERIAL PRIMARY KEY,
                    team_member_id TEXT REFERENCES team_members(id),
                    update_text TEXT NOT NULL,
                    source TEXT DEFAULT 'manual',
                    priority TEXT DEFAULT 'normal',
                    is_urgent BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed_at TIMESTAMP,
                    processing_status TEXT DEFAULT 'pending',
                    extracted_data JSONB
                )`,
                
                `CREATE TABLE IF NOT EXISTS ai_followups (
                    id SERIAL PRIMARY KEY,
                    deal_id INTEGER REFERENCES deals(id),
                    team_member_id TEXT REFERENCES team_members(id),
                    suggestion_text TEXT NOT NULL,
                    reasoning TEXT,
                    priority TEXT DEFAULT 'medium',
                    suggested_date DATE,
                    is_completed BOOLEAN DEFAULT FALSE,
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS executive_summaries (
                    id SERIAL PRIMARY KEY,
                    summary_date DATE NOT NULL,
                    summary_type TEXT DEFAULT 'daily',
                    content JSONB NOT NULL,
                    key_highlights TEXT[],
                    attention_required TEXT[],
                    revenue_impact DECIMAL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            ];

            for (const table of tables) {
                await client.query(table);
            }
        }
        
        console.log('✅ Database schema created!\n');

        // Create indexes for better performance
        console.log('📊 Creating indexes...');
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_deals_client_id ON deals(client_id)',
            'CREATE INDEX IF NOT EXISTS idx_deals_owner_id ON deals(owner_id)',
            'CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage)',
            'CREATE INDEX IF NOT EXISTS idx_team_updates_member ON team_updates(team_member_id)',
            'CREATE INDEX IF NOT EXISTS idx_team_updates_status ON team_updates(processing_status)'
        ];

        for (const index of indexes) {
            await client.query(index);
        }
        console.log('✅ Indexes created!\n');

        // Insert initial team members
        console.log('👥 Setting up initial team members...');
        const teamMembers = [
            ['joe', 'Joe', 'Sales Consultant', '{dealer_relationships,sales_activities}', '{dealer_feedback,meeting_notes,action_items}', 'claude-3-sonnet'],
            ['charlie', 'Charlie', 'Sales Consultant', '{dealer_relationships,sales_activities}', '{dealer_feedback,meeting_notes,action_items}', 'claude-3-sonnet'],
            ['tre', 'Tre Johnson', 'VP Sales', '{strategic_decisions,team_management}', '{team_performance,strategic_issues,escalations}', 'claude-3-opus'],
            ['josh', 'Josh (Super Admin)', 'System Administrator', '{system_management,technical_support}', '{system_issues,configuration_changes}', 'claude-3-opus']
        ];

        for (const member of teamMembers) {
            await client.query(
                `INSERT INTO team_members (id, name, role, focus_areas, extraction_priorities, ai_model) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 ON CONFLICT (id) DO NOTHING`,
                member
            );
        }
        console.log('✅ Team members initialized!\n');

        // Verify setup
        console.log('🔍 Verifying database setup...');
        const tableCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('Tables created:');
        tableCheck.rows.forEach(row => console.log(`  - ${row.table_name}`));
        
        const memberCheck = await client.query('SELECT COUNT(*) as count FROM team_members');
        console.log(`\nTeam members: ${memberCheck.rows[0].count}`);

        console.log('\n✅ Database setup completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('1. Ensure all environment variables are set in Render dashboard');
        console.log('2. Test login at: https://team-crm-26ks.onrender.com/chat');
        console.log('3. Submit updates and check executive dashboard');

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Run the setup
setupDatabase().catch(console.error);