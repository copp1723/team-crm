#!/usr/bin/env node

/**
 * TEST NEW FEATURES
 * Quick test script to verify the new database schema and personal assistant features
 */

import { config } from 'dotenv';
import { db } from './src/core/database/connection.js';
import { personalAssistantFactory } from './src/core/agents/personal-assistant-factory.js';
import chalk from 'chalk';

// Load environment variables
config();

console.log(chalk.bold.blue('\n🧪 Testing New Team CRM Features\n'));

async function testDatabaseSchema() {
    console.log(chalk.yellow('1. Testing Database Schema...'));
    
    try {
        // Test clients table
        const clientsTest = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'clients'
            LIMIT 5
        `);
        
        if (clientsTest.rows.length > 0) {
            console.log(chalk.green('✅ Clients table exists'));
            console.log(chalk.gray('   Columns:', clientsTest.rows.map(r => r.column_name).join(', ')));
        } else {
            console.log(chalk.red('❌ Clients table not found'));
        }
        
        // Test personal_assistants table
        const assistantsTest = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'personal_assistants'
            LIMIT 5
        `);
        
        if (assistantsTest.rows.length > 0) {
            console.log(chalk.green('✅ Personal assistants table exists'));
            console.log(chalk.gray('   Columns:', assistantsTest.rows.map(r => r.column_name).join(', ')));
        } else {
            console.log(chalk.red('❌ Personal assistants table not found'));
        }
        
    } catch (error) {
        console.log(chalk.red('❌ Database test failed:', error.message));
    }
}

async function testPersonalAssistants() {
    console.log(chalk.yellow('\n2. Testing Personal Assistant Factory...'));
    
    try {
        // Create a test user
        const testUser = {
            id: 'test-user-' + Date.now(),
            external_id: 'testuser',
            name: 'Test User',
            role: 'Sales Executive',
            email: 'test@example.com',
            active: true,
            ai_model: 'claude-3-sonnet'
        };
        
        // Insert test user
        await db.query(`
            INSERT INTO team_members (id, external_id, name, role, email, active, ai_model)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (external_id) DO UPDATE SET name = $3
        `, [testUser.id, testUser.external_id, testUser.name, testUser.role, testUser.email, testUser.active, testUser.ai_model]);
        
        console.log(chalk.gray('   Created test user:', testUser.name));
        
        // Create assistant
        const assistant = await personalAssistantFactory.createAssistantForMember(testUser.id, testUser);
        
        if (assistant) {
            console.log(chalk.green('✅ Personal assistant created successfully'));
            console.log(chalk.gray('   Assistant ID:', assistant.id));
            console.log(chalk.gray('   Has Supermemory:', !!assistant.supermemoryConfig));
            
            // Test processing
            console.log(chalk.yellow('\n3. Testing Update Processing...'));
            const testUpdate = "Just had a great meeting with Acme Auto Group. They're interested in our AI service advisor solution for their 5 dealerships. Potential $25k/month deal!";
            
            const result = await assistant.processUpdate(testUpdate);
            
            if (result.processing_status === 'success') {
                console.log(chalk.green('✅ Update processed successfully'));
                console.log(chalk.gray('   Confidence:', result.confidence));
                console.log(chalk.gray('   Requires attention:', result.requires_attention));
                
                if (result.extracted_data?.summary) {
                    console.log(chalk.gray('   Summary:', result.extracted_data.summary));
                }
            } else {
                console.log(chalk.yellow('⚠️  Update processed with fallback'));
            }
            
        } else {
            console.log(chalk.red('❌ Failed to create personal assistant'));
        }
        
        // Cleanup test user
        await db.query('DELETE FROM personal_assistants WHERE member_id = $1', [testUser.id]);
        await db.query('DELETE FROM team_members WHERE id = $1', [testUser.id]);
        console.log(chalk.gray('\n   Cleaned up test data'));
        
    } catch (error) {
        console.log(chalk.red('❌ Personal assistant test failed:', error.message));
    }
}

async function checkEnvironment() {
    console.log(chalk.yellow('\n4. Environment Check...'));
    
    const checks = [
        { name: 'Database URL', exists: !!process.env.DATABASE_URL },
        { name: 'OpenRouter API Key', exists: !!process.env.OPENROUTER_API_KEY },
        { name: 'Supermemory API Key', exists: !!process.env.SUPERMEMORY_API_KEY },
        { name: 'Dynamic Assistants Enabled', exists: process.env.USE_DYNAMIC_ASSISTANTS === 'true' || !!process.env.SUPERMEMORY_API_KEY }
    ];
    
    for (const check of checks) {
        if (check.exists) {
            console.log(chalk.green(`✅ ${check.name}`));
        } else {
            console.log(chalk.yellow(`⚠️  ${check.name} - Not configured`));
        }
    }
}

async function runTests() {
    try {
        await testDatabaseSchema();
        await testPersonalAssistants();
        await checkEnvironment();
        
        console.log(chalk.bold.green('\n✅ All tests completed!\n'));
        
        console.log(chalk.cyan('Next steps:'));
        console.log(chalk.gray('1. Run "npm install" to install new dependencies'));
        console.log(chalk.gray('2. Run "npm run db:setup" to update database schema'));
        console.log(chalk.gray('3. Set SUPERMEMORY_API_KEY in .env to enable Supermemory'));
        console.log(chalk.gray('4. Run "npm run assistant:manage list" to see all assistants'));
        console.log(chalk.gray('5. Start the server with "npm start"\n'));
        
    } catch (error) {
        console.error(chalk.red('\n❌ Test failed:', error.message));
    } finally {
        process.exit(0);
    }
}

// Run tests
runTests();