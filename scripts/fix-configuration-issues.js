#!/usr/bin/env node

/**
 * Fix Configuration Issues Script
 * Addresses the configuration problems identified in the deployment logs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

async function main() {
    console.log(`${colors.bold}🔧 Team CRM Configuration Fix Script${colors.reset}\n`);
    
    console.log(`${colors.blue}Analyzing current configuration issues...${colors.reset}\n`);
    
    // Check current environment variables
    await checkEnvironmentVariables();
    
    // Check configuration files
    await checkConfigurationFiles();
    
    // Provide solutions
    await provideSolutions();
    
    console.log(`\n${colors.green}✅ Configuration analysis complete!${colors.reset}`);
}

async function checkEnvironmentVariables() {
    console.log(`${colors.cyan}📋 Environment Variables Check:${colors.reset}`);
    
    const requiredVars = [
        'OPENROUTER_API_KEY',
        'DATABASE_URL',
        'NODE_ENV',
        'PORT'
    ];
    
    const optionalVars = [
        'SUPERMEMORY_API_KEY',
        'SUPERMEMORY_BASE_URL',
        'GOOGLE_CALENDAR_CLIENT_ID',
        'GOOGLE_CALENDAR_CLIENT_SECRET',
        'GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL',
        'GOOGLE_CALENDAR_PRIVATE_KEY',
        'REDIS_URL'
    ];
    
    // Check required variables
    for (const envVar of requiredVars) {
        const value = process.env[envVar];
        if (value && value.trim() !== '') {
            console.log(`  ${colors.green}✅ ${envVar}: Set${colors.reset}`);
        } else {
            console.log(`  ${colors.red}❌ ${envVar}: Missing${colors.reset}`);
        }
    }
    
    // Check optional variables
    for (const envVar of optionalVars) {
        const value = process.env[envVar];
        if (value && value.trim() !== '') {
            console.log(`  ${colors.green}ℹ️  ${envVar}: Set (optional)${colors.reset}`);
        } else {
            console.log(`  ${colors.yellow}⚠️  ${envVar}: Not set (optional)${colors.reset}`);
        }
    }
    
    console.log();
}

async function checkConfigurationFiles() {
    console.log(`${colors.cyan}📁 Configuration Files Check:${colors.reset}`);
    
    const configPath = path.join(__dirname, '..', 'config', 'team-config.json');
    
    try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        
        // Check memory configuration
        if (config.memory?.enabled) {
            console.log(`  ${colors.green}✅ Memory: Enabled${colors.reset}`);
        } else {
            console.log(`  ${colors.yellow}⚠️  Memory: Disabled${colors.reset}`);
        }
        
        // Check calendar configuration
        if (config.calendar?.enabled) {
            console.log(`  ${colors.green}✅ Calendar: Enabled${colors.reset}`);
        } else {
            console.log(`  ${colors.yellow}⚠️  Calendar: Disabled${colors.reset}`);
        }
        
        // Check team members
        const memberCount = Object.keys(config.team?.members || {}).length;
        console.log(`  ${colors.green}✅ Team Members: ${memberCount} configured${colors.reset}`);
        
    } catch (error) {
        console.log(`  ${colors.red}❌ Config file error: ${error.message}${colors.reset}`);
    }
    
    console.log();
}

async function provideSolutions() {
    console.log(`${colors.cyan}💡 Solutions for Configuration Issues:${colors.reset}\n`);
    
    console.log(`${colors.yellow}1. Supermemory Configuration Issues:${colors.reset}`);
    console.log(`   The logs show "No Supermemory configuration - assistant will have no memory!"`);
    console.log(`   ${colors.blue}Solution:${colors.reset}`);
    console.log(`   - Add SUPERMEMORY_API_KEY to your Render environment variables`);
    console.log(`   - Get your key from: https://supermemory.ai`);
    console.log(`   - Add to Render: Environment → SUPERMEMORY_API_KEY = your_key_here`);
    console.log();
    
    console.log(`${colors.yellow}2. Google Calendar Configuration Issues:${colors.reset}`);
    console.log(`   The logs show "Google Calendar API credentials not configured - calendar features will be simulated"`);
    console.log(`   ${colors.blue}Solution:${colors.reset}`);
    console.log(`   - This is expected behavior - calendar features are optional`);
    console.log(`   - If you want calendar integration, add these to Render:`);
    console.log(`     * GOOGLE_CALENDAR_CLIENT_ID`);
    console.log(`     * GOOGLE_CALENDAR_CLIENT_SECRET`);
    console.log(`     * GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL`);
    console.log(`     * GOOGLE_CALENDAR_PRIVATE_KEY`);
    console.log();
    
    console.log(`${colors.yellow}3. Database Activity Tracking Issues:${colors.reset}`);
    console.log(`   The logs show "Database not initialized" for activity tracking`);
    console.log(`   ${colors.blue}Solution:${colors.reset}`);
    console.log(`   - This is normal in database-free mode`);
    console.log(`   - Activity tracking will work when DATABASE_URL is configured`);
    console.log(`   - For now, the system continues to work without it`);
    console.log();
    
    console.log(`${colors.yellow}4. Supermemory API 404 Error:${colors.reset}`);
    console.log(`   The logs show "Error searching memories: Error: HTTP 404: Not Found"`);
    console.log(`   ${colors.blue}Solution:${colors.reset}`);
    console.log(`   - This suggests the Supermemory API key might be invalid or expired`);
    console.log(`   - Check your Supermemory API key at: https://supermemory.ai`);
    console.log(`   - Update the key in Render if needed`);
    console.log();
    
    console.log(`${colors.bold}${colors.green}🎯 Priority Actions:${colors.reset}`);
    console.log(`1. ${colors.cyan}Add SUPERMEMORY_API_KEY${colors.reset} to Render environment variables`);
    console.log(`2. ${colors.cyan}Verify OPENROUTER_API_KEY${colors.reset} is working correctly`);
    console.log(`3. ${colors.cyan}Test the application${colors.reset} after adding the Supermemory key`);
    console.log();
    
    console.log(`${colors.bold}${colors.blue}📝 Render Environment Variables Template:${colors.reset}`);
    console.log(`${colors.cyan}Add these to your Render service environment variables:${colors.reset}`);
    console.log(`
NODE_ENV=production
PORT=10000
OPENROUTER_API_KEY=your_openrouter_key_here
SUPERMEMORY_API_KEY=your_supermemory_key_here
SUPERMEMORY_BASE_URL=https://api.supermemory.ai
DATABASE_URL=your_database_url_here
JOE_PASSWORD=secure_password_for_joe
CHARLIE_PASSWORD=secure_password_for_charlie
TRE_PASSWORD=secure_password_for_tre
JOSH_PASSWORD=secure_password_for_josh
KYLE_PASSWORD=secure_password_for_kyle
AMANDA_PASSWORD=secure_password_for_amanda
    `.trim());
}

// Run the script
main().catch(console.error); 