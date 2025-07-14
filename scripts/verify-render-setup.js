#!/usr/bin/env node

/**
 * Verification script for Render deployment
 * Checks all required components are properly configured
 */

import pkg from 'pg';
const { Client } = pkg;
import fetch from 'node-fetch';

async function verifySetup() {
    console.log('🔍 Verifying Team CRM Render Setup...\n');
    
    const results = {
        database: false,
        openrouter: false,
        authentication: false,
        tables: false,
        api: false
    };

    // 1. Check DATABASE_URL
    console.log('1️⃣ Checking DATABASE_URL...');
    if (process.env.DATABASE_URL) {
        console.log('✅ DATABASE_URL is set');
        
        // Try to connect
        const client = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        try {
            await client.connect();
            console.log('✅ Database connection successful');
            results.database = true;
            
            // Check if tables exist
            console.log('\n2️⃣ Checking database tables...');
            const tableCheck = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('team_members', 'clients', 'deals', 'team_updates')
                ORDER BY table_name
            `);
            
            if (tableCheck.rows.length === 0) {
                console.log('❌ No tables found - need to run: node scripts/render-db-setup.js');
            } else {
                console.log(`✅ Found ${tableCheck.rows.length} tables:`);
                tableCheck.rows.forEach(row => console.log(`   - ${row.table_name}`));
                results.tables = true;
                
                // Check team members
                const memberCheck = await client.query('SELECT id, name FROM team_members ORDER BY id');
                console.log(`\n   Team members in database: ${memberCheck.rows.length}`);
                memberCheck.rows.forEach(row => console.log(`   - ${row.id}: ${row.name}`));
            }
            
            await client.end();
        } catch (error) {
            console.log('❌ Database connection failed:', error.message);
        }
    } else {
        console.log('❌ DATABASE_URL not set - PostgreSQL not attached?');
    }

    // 2. Check OpenRouter API Key
    console.log('\n3️⃣ Checking OpenRouter API Key...');
    if (process.env.OPENROUTER_API_KEY) {
        console.log('✅ OPENROUTER_API_KEY is set');
        results.openrouter = true;
    } else {
        console.log('❌ OPENROUTER_API_KEY not set - AI features will not work');
    }

    // 3. Check User Passwords
    console.log('\n4️⃣ Checking authentication passwords...');
    const users = ['JOE', 'CHARLIE', 'TRE', 'JOSH'];
    let allPasswordsSet = true;
    users.forEach(user => {
        if (process.env[`${user}_PASSWORD`]) {
            console.log(`✅ ${user}_PASSWORD is set`);
        } else {
            console.log(`❌ ${user}_PASSWORD not set`);
            allPasswordsSet = false;
        }
    });
    results.authentication = allPasswordsSet;

    // 4. Test API endpoint
    console.log('\n5️⃣ Testing API endpoint...');
    const appUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:10000';
    try {
        const response = await fetch(`${appUrl}/api/status`, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from('josh:' + (process.env.JOSH_PASSWORD || 'test')).toString('base64')
            }
        });
        
        if (response.ok) {
            console.log('✅ API is responding');
            results.api = true;
        } else {
            console.log(`❌ API returned status ${response.status}`);
        }
    } catch (error) {
        console.log('❌ Could not reach API:', error.message);
    }

    // Summary
    console.log('\n📊 SETUP SUMMARY:');
    console.log('─'.repeat(40));
    console.log(`Database Connection: ${results.database ? '✅' : '❌'}`);
    console.log(`Database Tables: ${results.tables ? '✅' : '❌ Run: node scripts/render-db-setup.js'}`);
    console.log(`OpenRouter API: ${results.openrouter ? '✅' : '❌ Set OPENROUTER_API_KEY'}`);
    console.log(`Authentication: ${results.authentication ? '✅' : '❌ Set user passwords'}`);
    console.log(`API Endpoint: ${results.api ? '✅' : '❌'}`);
    console.log('─'.repeat(40));

    const allGood = Object.values(results).every(v => v);
    if (allGood) {
        console.log('\n🎉 Everything is configured! Ready to test.');
        console.log('\nTest URLs:');
        console.log(`- Team Chat: ${appUrl}/chat`);
        console.log(`- Executive Dashboard: ${appUrl}/executive-dashboard`);
        console.log(`- Admin Panel: ${appUrl}/admin`);
    } else {
        console.log('\n⚠️  Some components need configuration.');
        if (!results.tables && results.database) {
            console.log('\n👉 Next step: Run database setup');
            console.log('   In Render Shell: node scripts/render-db-setup.js');
        }
    }
}

// Run verification
verifySetup().catch(console.error);