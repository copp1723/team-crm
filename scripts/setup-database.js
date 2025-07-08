#!/usr/bin/env node

/**
 * Quick Setup Script for Team CRM Database Integration
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Team CRM Database Setup');
console.log('========================\n');

async function runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, { 
            stdio: 'inherit',
            shell: true 
        });
        
        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Command failed: ${command} ${args.join(' ')}`));
            } else {
                resolve();
            }
        });
    });
}

async function setup() {
    try {
        // Check if package.json exists
        const packagePath = path.join(__dirname, '..', 'package.json');
        try {
            await fs.access(packagePath);
        } catch {
            console.error('❌ package.json not found. Please run this from the team-crm directory.');
            process.exit(1);
        }

        // Check if .env exists
        const envPath = path.join(__dirname, '..', '.env');
        try {
            await fs.access(envPath);
            console.log('✅ .env file found with Supabase configuration');
        } catch {
            console.error('❌ .env file not found. Please create it first.');
            process.exit(1);
        }

        // Install PostgreSQL dependency
        console.log('\n📦 Installing PostgreSQL driver...');
        await runCommand('npm', ['install', 'pg']);
        console.log('✅ PostgreSQL driver installed');

        // Test database connection
        console.log('\n🔌 Testing database connection...');
        const testScript = `
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase') 
        ? { rejectUnauthorized: false } 
        : false
});

async function test() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ Database connected successfully!');
        console.log('   Current time from database:', result.rows[0].now);
        client.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

test();
        `;

        // Write and run test script
        const testPath = path.join(__dirname, 'test-db-connection.js');
        await fs.writeFile(testPath, testScript);
        
        try {
            await runCommand('node', [testPath]);
            await fs.unlink(testPath); // Clean up
        } catch (error) {
            await fs.unlink(testPath); // Clean up even on error
            throw error;
        }

        // Update database connection to include SSL
        console.log('\n📝 Updating database connection for SSL support...');
        const connectionPath = path.join(__dirname, '..', 'src/core/database/connection.js');
        const connectionContent = await fs.readFile(connectionPath, 'utf8');
        
        if (!connectionContent.includes('ssl:')) {
            const updatedContent = connectionContent.replace(
                'connectionTimeoutMillis: 2000,',
                `connectionTimeoutMillis: 2000,
                ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,`
            );
            await fs.writeFile(connectionPath, updatedContent);
            console.log('✅ Database connection updated for SSL support');
        }

        console.log('\n🎉 Setup Complete!');
        console.log('\nYour Team CRM database is now connected and ready to use.');
        console.log('\nNext steps:');
        console.log('1. Run: npm start');
        console.log('2. The system will automatically create all tables');
        console.log('3. Access the executive dashboard at: http://localhost:8080/dashboard');
        console.log('\n✨ Your sales intelligence platform is ready!');

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Run setup
setup();