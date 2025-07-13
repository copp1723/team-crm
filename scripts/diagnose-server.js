#!/usr/bin/env node

/**
 * Diagnostic script to check TeamCRM server status and configuration
 */

import fetch from 'node-fetch';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

async function checkLocalServer() {
    console.log(`${colors.blue}Checking local server status...${colors.reset}`);
    
    try {
        const response = await fetch('http://localhost:10000/health', { timeout: 5000 });
        if (response.ok) {
            const data = await response.json();
            console.log(`${colors.green}✓ Local server is running on port 10000${colors.reset}`);
            console.log(`  Status: ${data.status}`);
            return true;
        }
    } catch (error) {
        // Try port 8080 as fallback
        try {
            const response = await fetch('http://localhost:8080/health', { timeout: 5000 });
            if (response.ok) {
                const data = await response.json();
                console.log(`${colors.green}✓ Local server is running on port 8080${colors.reset}`);
                console.log(`  Status: ${data.status}`);
                return true;
            }
        } catch (err) {
            console.log(`${colors.red}✗ Local server is not running${colors.reset}`);
            return false;
        }
    }
}

async function checkDeployedServer() {
    console.log(`\n${colors.blue}Checking deployed server status...${colors.reset}`);
    
    try {
        const response = await fetch('https://team-crm-26ks.onrender.com/health', { 
            timeout: 10000,
            headers: {
                'User-Agent': 'TeamCRM-Diagnostic/1.0'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`${colors.green}✓ Deployed server is accessible${colors.reset}`);
            console.log(`  Status: ${data.status}`);
            return true;
        } else {
            console.log(`${colors.red}✗ Deployed server returned error: ${response.status} ${response.statusText}${colors.reset}`);
            return false;
        }
    } catch (error) {
        console.log(`${colors.red}✗ Cannot reach deployed server${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        return false;
    }
}

async function checkEnvironmentVariables() {
    console.log(`\n${colors.blue}Checking environment configuration...${colors.reset}`);
    
    try {
        const envPath = path.join(__dirname, '..', '.env');
        const envContent = await fs.readFile(envPath, 'utf8');
        const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        const requiredVars = [
            'OPENROUTER_API_KEY',
            'PORT',
            'NODE_ENV'
        ];
        
        const missingVars = [];
        requiredVars.forEach(varName => {
            const hasVar = envLines.some(line => line.startsWith(`${varName}=`));
            if (hasVar) {
                console.log(`${colors.green}✓ ${varName} is configured${colors.reset}`);
            } else {
                console.log(`${colors.red}✗ ${varName} is missing${colors.reset}`);
                missingVars.push(varName);
            }
        });
        
        return missingVars.length === 0;
    } catch (error) {
        console.log(`${colors.red}✗ Cannot read .env file${colors.reset}`);
        return false;
    }
}

async function testUpdateEndpoint(baseUrl) {
    console.log(`\n${colors.blue}Testing /api/update endpoint at ${baseUrl}...${colors.reset}`);
    
    try {
        const response = await fetch(`${baseUrl}/api/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                memberName: 'joe',
                updateText: 'Test update from diagnostic script'
            }),
            timeout: 10000
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            console.log(`${colors.green}✓ Update endpoint is working${colors.reset}`);
            return true;
        } else {
            console.log(`${colors.red}✗ Update endpoint returned error:${colors.reset}`);
            console.log(`  Status: ${response.status}`);
            console.log(`  Error: ${data.error?.message || 'Unknown error'}`);
            return false;
        }
    } catch (error) {
        console.log(`${colors.red}✗ Failed to test update endpoint${colors.reset}`);
        console.log(`  Error: ${error.message}`);
        return false;
    }
}

async function startLocalServer() {
    console.log(`\n${colors.yellow}Starting local server...${colors.reset}`);
    
    const serverProcess = spawn('npm', ['start'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true
    });
    
    serverProcess.on('error', (error) => {
        console.error(`${colors.red}Failed to start server: ${error.message}${colors.reset}`);
    });
    
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 5000));
}

async function runDiagnostics() {
    console.log(`${colors.blue}=== TeamCRM Server Diagnostics ===${colors.reset}\n`);
    
    // Check environment
    const envOk = await checkEnvironmentVariables();
    
    // Check local server
    const localRunning = await checkLocalServer();
    
    // Check deployed server
    const deployedRunning = await checkDeployedServer();
    
    // Test endpoints if servers are running
    if (localRunning) {
        const port = await checkLocalServer() ? 10000 : 8080;
        await testUpdateEndpoint(`http://localhost:${port}`);
    }
    
    if (deployedRunning) {
        await testUpdateEndpoint('https://team-crm-26ks.onrender.com');
    }
    
    // Provide recommendations
    console.log(`\n${colors.blue}=== Recommendations ===${colors.reset}`);
    
    if (!localRunning) {
        console.log(`\n${colors.yellow}To start the local server:${colors.reset}`);
        console.log('  npm start');
        console.log('  or');
        console.log('  npm run dev');
        
        const shouldStart = process.argv.includes('--start');
        if (shouldStart) {
            await startLocalServer();
        } else {
            console.log(`\n${colors.yellow}Run with --start flag to automatically start the server${colors.reset}`);
        }
    }
    
    if (!deployedRunning) {
        console.log(`\n${colors.yellow}The deployed server on Render needs attention:${colors.reset}`);
        console.log('  1. Check the Render dashboard for deployment status');
        console.log('  2. Review the deployment logs for errors');
        console.log('  3. Ensure all environment variables are set in Render');
        console.log('  4. Try redeploying from the Render dashboard');
    }
    
    if (!envOk) {
        console.log(`\n${colors.yellow}Fix missing environment variables in .env file${colors.reset}`);
    }
    
    console.log(`\n${colors.blue}=== Diagnostic Complete ===${colors.reset}`);
}

// Run diagnostics
runDiagnostics().catch(error => {
    console.error(`${colors.red}Diagnostic script failed: ${error.message}${colors.reset}`);
    process.exit(1);
});