#!/usr/bin/env node

/**
 * Team CRM Troubleshooting Script
 * Run this to diagnose common issues with the server
 */

import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

console.log('🔍 Team CRM Troubleshooting Script');
console.log('=====================================\n');

async function checkFile(filePath, description) {
    try {
        await fs.access(filePath);
        console.log(`✅ ${description}: ${filePath}`);
        return true;
    } catch (error) {
        console.log(`❌ ${description}: ${filePath} - ${error.message}`);
        return false;
    }
}

async function checkConfiguration() {
    console.log('📁 Checking File Structure...');
    
    const requiredFiles = [
        [join(__dirname, 'package.json'), 'Package.json'],
        [join(__dirname, 'start.js'), 'Main entry point'],
        [join(__dirname, 'src/team-crm-server.js'), 'Server file'],
        [join(__dirname, 'config/team-config.json'), 'Team configuration'],
        [join(__dirname, 'web-interface/chat.html'), 'Chat interface'],
        [join(__dirname, 'public/favicon.ico'), 'Favicon'],
        [join(__dirname, '.env'), 'Environment file']
    ];
    
    for (const [path, desc] of requiredFiles) {
        await checkFile(path, desc);
    }
    
    console.log('');
}

async function checkEnvironment() {
    console.log('🌍 Checking Environment Variables...');
    
    const requiredEnvVars = ['OPENROUTER_API_KEY'];
    const optionalEnvVars = ['SUPERMEMORY_API_KEY', 'DATABASE_URL'];
    
    for (const envVar of requiredEnvVars) {
        if (process.env[envVar]) {
            console.log(`✅ ${envVar}: Set (${process.env[envVar].substring(0, 20)}...)`);
        } else {
            console.log(`❌ ${envVar}: Not set`);
        }
    }
    
    for (const envVar of optionalEnvVars) {
        if (process.env[envVar]) {
            console.log(`✅ ${envVar}: Set`);
        } else {
            console.log(`⚠️  ${envVar}: Not set (optional)`);
        }
    }
    
    console.log(`📡 Server Config: ${HOST}:${PORT}`);
    console.log('');
}

async function testServerEndpoints() {
    console.log('🌐 Testing Server Endpoints...');
    
    const endpoints = [
        ['/health', 'Health Check'],
        ['/api/status', 'System Status'],
        ['/api/team', 'Team Members'],
        ['/api/config', 'Configuration'],
        ['/api/docs', 'API Documentation']
    ];
    
    for (const [endpoint, description] of endpoints) {
        try {
            const response = await fetch(`${BASE_URL}${endpoint}`, { 
                timeout: 5000 
            });
            
            if (response.ok) {
                console.log(`✅ ${description} (${endpoint}): ${response.status}`);
                
                // Log some details for key endpoints
                if (endpoint === '/health') {
                    const data = await response.json();
                    console.log(`   Status: ${data.status}`);
                } else if (endpoint === '/api/team') {
                    const data = await response.json();
                    console.log(`   Team members: ${data.length}`);
                }
            } else {
                console.log(`❌ ${description} (${endpoint}): ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.log(`❌ ${description} (${endpoint}): ${error.message}`);
        }
    }
    
    console.log('');
}

async function testApiUpdate() {
    console.log('📝 Testing API Update Endpoint...');
    
    const testPayload = {
        memberName: 'joe',
        updateText: 'Test update from troubleshooting script. Just checking if the API endpoint is working properly.'
    };
    
    try {
        const response = await fetch(`${BASE_URL}/api/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testPayload),
            timeout: 10000
        });
        
        console.log(`Response Status: ${response.status} ${response.statusText}`);
        
        const responseText = await response.text();
        
        if (response.ok) {
            console.log(`✅ API Update: Success`);
            try {
                const data = JSON.parse(responseText);
                console.log(`   Extracted items: ${data.extracted?.totalItems || 'unknown'}`);
            } catch {
                console.log(`   Response: ${responseText.substring(0, 200)}...`);
            }
        } else {
            console.log(`❌ API Update: Failed`);
            console.log(`   Response: ${responseText.substring(0, 500)}`);
        }
        
    } catch (error) {
        console.log(`❌ API Update: ${error.message}`);
    }
    
    console.log('');
}

async function checkWebSocketConnection() {
    console.log('🔌 Testing WebSocket Connection...');
    
    try {
        // Note: This is a basic check - actual WebSocket testing would require ws module
        const response = await fetch(`${BASE_URL}/`, { 
            timeout: 5000 
        });
        
        if (response.ok) {
            console.log(`✅ WebSocket server reachable at ${BASE_URL}`);
        } else {
            console.log(`❌ WebSocket server not reachable: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ WebSocket connection test failed: ${error.message}`);
    }
    
    console.log('');
}

async function generateReport() {
    console.log('📊 System Summary');
    console.log('=================');
    
    try {
        const packageJson = JSON.parse(await fs.readFile(join(__dirname, 'package.json'), 'utf8'));
        console.log(`Project: ${packageJson.name} v${packageJson.version}`);
    } catch {
        console.log('Project: Unknown');
    }
    
    console.log(`Node.js: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Target URL: ${BASE_URL}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    
    console.log('\n🚀 Next Steps:');
    console.log('1. If server is not running: npm start');
    console.log('2. Check server logs for detailed error messages');
    console.log('3. Verify all environment variables are properly set');
    console.log('4. Test endpoints manually with curl or browser');
    console.log(`5. Access web interface: ${BASE_URL}/chat`);
}

// Run all checks
async function runDiagnostics() {
    await checkConfiguration();
    await checkEnvironment();
    
    // Only test server if files exist
    try {
        await testServerEndpoints();
        await testApiUpdate();
        await checkWebSocketConnection();
    } catch (error) {
        console.log('⚠️  Server tests skipped - server may not be running');
        console.log(`   Start server with: npm start`);
        console.log('');
    }
    
    await generateReport();
}

runDiagnostics().catch(console.error);
