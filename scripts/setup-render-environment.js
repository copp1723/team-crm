#!/usr/bin/env node

/**
 * Render Environment Setup Script
 * Helps configure all environment variables for Render deployment
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
    console.log(`${colors.bold}🚀 Render Environment Setup Script${colors.reset}\n`);
    
    console.log(`${colors.blue}Setting up environment variables for Render deployment...${colors.reset}\n`);
    
    // Your provided configuration
    const config = {
        OPENROUTER_API_KEY: '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',
        SUPERMEMORY_API_KEY: 'sm_dy7m3s5FbqC2DaFMkKoTw1_TdczXjTGWRNJAMrgvFtPPSEQFDDBKfVNNMQeAExXUgYTHANSyeNfXgCKOuuweESz',
        SUPERMEMORY_BASE_URL: 'https://api.supermemory.ai',
        DATABASE_URL: 'postgresql://team_crm_df27_user:ntzIjjTRwqjBDwlERyBkHSH8sdY0upm9@dpg-d1q4kner433s73e0bkrg-a/team_crm_df27',
        NODE_ENV: 'production',
        PORT: '10000',
        
        // Team passwords
        JOE_PASSWORD: 'joe1',
        TRE_PASSWORD: 'tre1',
        JOSH_PASSWORD: 'josh1',
        AMANDA_PASSWORD: 'amanda1',
        KYLE_PASSWORD: 'kyle1',
        
        // Individual Supermemory keys
        JOE_SUPERMEMORY_KEY: 'sm_dy7m3s5FbqC2DaFMkKoTw1_eqeTRieoUiiNSbdebASrJOLytIDibiINzceXWkPkMzNTiNpQzIYbgadhSKnHTyty',
        TRE_SUPERMEMORY_KEY: 'sm_dy7m3s5FbqC2DaFMkKoTw1_BuDUfYMUxhFsVTXOAGylAWPDEIHEjBZCtXLjeYCjSHtPigMKaiRFfSBypZSpQiki',
        JOSH_SUPERMEMORY_KEY: 'sm_dy7m3s5FbqC2DaFMkKoTw1_ubkCkKKNiUJYISeeAzAWxCQnkwwcmNdXSOQPVjcLLUxIjDYVZfBFVTGqiAMNTsJq',
        AMANDA_SUPERMEMORY_KEY: 'sm_dy7m3s5FbqC2DaFMkKoTw1_GPmSAYgDtFWriEnwfndnmAXGJnkvrfUTHrnbOHTavUYRsZgbAblisfikmUAwrjhs',
        KYLE_SUPERMEMORY_KEY: 'sm_dy7m3s5FbqC2DaFMkKoTw1_TVJLoCJmFTPcMWGzsjkcmQFCqUPiWjvmMlJIbfCewaQHReUcuQwcxWNCzUvmaOcG'
    };
    
    // Generate environment variables file
    await generateEnvironmentFile(config);
    
    // Generate Render environment variables list
    await generateRenderEnvironmentList(config);
    
    // Update team configuration with individual Supermemory keys
    await updateTeamConfig(config);
    
    console.log(`\n${colors.green}✅ Setup complete!${colors.reset}`);
    console.log(`\n${colors.bold}Next steps:${colors.reset}`);
    console.log(`1. Copy the environment variables to your Render dashboard`);
    console.log(`2. Redeploy your service`);
    console.log(`3. Check the logs for success indicators`);
}

async function generateEnvironmentFile(config) {
    console.log(`${colors.cyan}📝 Generating .env file for local testing...${colors.reset}`);
    
    const envContent = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    const envPath = path.join(__dirname, '..', '.env');
    await fs.writeFile(envPath, envContent);
    
    console.log(`  ${colors.green}✅ .env file created at: ${envPath}${colors.reset}`);
    console.log();
}

async function generateRenderEnvironmentList(config) {
    console.log(`${colors.cyan}🌐 Render Environment Variables List:${colors.reset}`);
    console.log(`${colors.yellow}Copy these to your Render dashboard:${colors.reset}\n`);
    
    Object.entries(config).forEach(([key, value]) => {
        console.log(`${colors.blue}${key}${colors.reset}=${colors.green}${value}${colors.reset}`);
    });
    
    console.log(`\n${colors.bold}${colors.magenta}📋 Complete Environment Variables List:${colors.reset}`);
    console.log(`${colors.cyan}Add these one by one to your Render service environment variables:${colors.reset}\n`);
    
    const renderList = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    console.log(renderList);
    
    // Save to file for easy copying
    const renderEnvPath = path.join(__dirname, '..', 'render-environment-variables.txt');
    await fs.writeFile(renderEnvPath, renderList);
    
    console.log(`\n${colors.green}✅ Render environment variables saved to: ${renderEnvPath}${colors.reset}`);
    console.log();
}

async function updateTeamConfig(config) {
    console.log(`${colors.cyan}⚙️  Updating team configuration with individual Supermemory keys...${colors.reset}`);
    
    const configPath = path.join(__dirname, '..', 'config', 'team-config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const teamConfig = JSON.parse(configContent);
    
    // Update each team member with their individual Supermemory key
    const supermemoryKeys = {
        joe: config.JOE_SUPERMEMORY_KEY,
        tre: config.TRE_SUPERMEMORY_KEY,
        josh: config.JOSH_SUPERMEMORY_KEY,
        amanda: config.AMANDA_SUPERMEMORY_KEY,
        kyle: config.KYLE_SUPERMEMORY_KEY
    };
    
    Object.entries(supermemoryKeys).forEach(([memberId, key]) => {
        if (teamConfig.team.members[memberId]) {
            teamConfig.team.members[memberId].supermemory_key = key;
            console.log(`  ${colors.green}✅ Updated ${memberId} with Supermemory key${colors.reset}`);
        }
    });
    
    // Save updated configuration
    await fs.writeFile(configPath, JSON.stringify(teamConfig, null, 2));
    
    console.log(`  ${colors.green}✅ Team configuration updated${colors.reset}`);
    console.log();
}

// Run the script
main().catch(console.error); 