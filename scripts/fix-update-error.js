#!/usr/bin/env node

/**
 * Quick fix script for TeamCRM update errors
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

async function checkRedisConnection() {
    console.log(`${colors.blue}Checking Redis connection...${colors.reset}`);
    
    try {
        const { createClient } = await import('ioredis');
        const redis = new createClient({
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: 1
        });
        
        await redis.ping();
        console.log(`${colors.green}✓ Redis is running${colors.reset}`);
        redis.disconnect();
        return true;
    } catch (error) {
        console.log(`${colors.yellow}⚠ Redis is not running (optional for basic functionality)${colors.reset}`);
        return false;
    }
}

async function updateValidationMiddleware() {
    console.log(`\n${colors.blue}Checking validation middleware...${colors.reset}`);
    
    const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'validation.js');
    
    try {
        await fs.access(middlewarePath);
        console.log(`${colors.green}✓ Validation middleware exists${colors.reset}`);
    } catch (error) {
        console.log(`${colors.yellow}Creating basic validation middleware...${colors.reset}`);
        
        const validationContent = `/**
 * Basic validation middleware
 */

export class ValidationMiddleware {
    static validateTeamUpdate(req, res, next) {
        const { memberName, updateText } = req.body;
        
        if (!memberName || !updateText) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Missing required fields: memberName and updateText',
                    type: 'validation_error'
                }
            });
        }
        
        if (updateText.length < 10) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Update text must be at least 10 characters long',
                    type: 'validation_error'
                }
            });
        }
        
        if (updateText.length > 5000) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Update text cannot exceed 5000 characters',
                    type: 'validation_error'
                }
            });
        }
        
        next();
    }
    
    static securityHeaders(req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    }
    
    static createSizeLimiter(maxSize) {
        return (req, res, next) => next();
    }
    
    static sanitizeInputs(req, res, next) {
        if (req.body && typeof req.body === 'object') {
            Object.keys(req.body).forEach(key => {
                if (typeof req.body[key] === 'string') {
                    req.body[key] = req.body[key].trim();
                }
            });
        }
        next();
    }
}
`;
        
        await fs.mkdir(path.dirname(middlewarePath), { recursive: true });
        await fs.writeFile(middlewarePath, validationContent);
        console.log(`${colors.green}✓ Created validation middleware${colors.reset}`);
    }
}

async function createMinimalServer() {
    console.log(`\n${colors.blue}Creating minimal test server...${colors.reset}`);
    
    const testServerPath = path.join(__dirname, '..', 'test-server.js');
    
    const serverContent = `/**
 * Minimal test server for debugging
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web-interface')));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: 'test-server',
        timestamp: new Date().toISOString()
    });
});

// Team members
app.get('/api/team', (req, res) => {
    res.json([
        { key: 'joe', name: 'Joe', role: 'Account Executive' },
        { key: 'charlie', name: 'Charlie', role: 'Client Success Manager' }
    ]);
});

// Update endpoint
app.post('/api/update', async (req, res) => {
    const { memberName, updateText } = req.body;
    
    if (!memberName || !updateText) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Missing required fields: memberName and updateText',
                type: 'validation_error'
            }
        });
    }
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    res.json({
        success: true,
        updateId: 'test-' + Date.now(),
        memberName,
        confidence: 0.85,
        analysis: {
            confidence: 0.85,
            actionItems: [
                {
                    text: 'Follow up on ' + updateText.substring(0, 50) + '...',
                    priority: 3,
                    assignee: memberName
                }
            ],
            clients: [],
            priorities: [],
            executiveEscalation: {
                required: false
            }
        },
        extracted: {
            totalItems: 1,
            detailedAnalysis: {}
        },
        metadata: {
            processingTime: 0.5
        }
    });
});

// Serve chat interface
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'web-interface', 'chat.html'));
});

app.get('/', (req, res) => {
    res.redirect('/chat');
});

app.listen(PORT, () => {
    console.log(\`Test server running at http://localhost:\${PORT}\`);
    console.log(\`Chat interface: http://localhost:\${PORT}/chat\`);
});
`;
    
    await fs.writeFile(testServerPath, serverContent);
    console.log(`${colors.green}✓ Created test server at test-server.js${colors.reset}`);
    
    return testServerPath;
}

async function runQuickFix() {
    console.log(`${colors.blue}=== TeamCRM Quick Fix ===${colors.reset}\n`);
    
    // Check if main server is running
    let serverRunning = false;
    try {
        const response = await fetch('http://localhost:10000/health');
        serverRunning = response.ok;
    } catch (error) {
        // Server not running
    }
    
    if (serverRunning) {
        console.log(`${colors.green}✓ Server is already running${colors.reset}`);
        console.log(`\n${colors.yellow}If you're still having issues, try:${colors.reset}`);
        console.log('1. Clear your browser cache');
        console.log('2. Check browser console for errors');
        console.log('3. Make sure you\'re accessing http://localhost:10000/chat');
    } else {
        console.log(`${colors.yellow}Server is not running. Attempting fixes...${colors.reset}`);
        
        // Check Redis
        await checkRedisConnection();
        
        // Check/create validation middleware
        await updateValidationMiddleware();
        
        // Offer to create test server
        console.log(`\n${colors.blue}Options:${colors.reset}`);
        console.log('1. Start the main server: npm start');
        console.log('2. Create and run a minimal test server');
        
        if (process.argv.includes('--test')) {
            const testServerPath = await createMinimalServer();
            console.log(`\n${colors.yellow}Starting test server...${colors.reset}`);
            
            const serverProcess = spawn('node', [testServerPath], {
                stdio: 'inherit',
                shell: true
            });
            
            serverProcess.on('error', (error) => {
                console.error(`${colors.red}Failed to start test server: ${error.message}${colors.reset}`);
            });
        } else {
            console.log(`\n${colors.yellow}Run with --test flag to create and start a minimal test server${colors.reset}`);
            console.log('Example: node scripts/fix-update-error.js --test');
        }
    }
    
    console.log(`\n${colors.blue}=== Additional Troubleshooting ===${colors.reset}`);
    console.log('\n1. Check that all dependencies are installed:');
    console.log('   npm install');
    console.log('\n2. Ensure .env file has required variables:');
    console.log('   - OPENROUTER_API_KEY');
    console.log('   - PORT=10000');
    console.log('   - NODE_ENV=production');
    console.log('\n3. For the deployed server on Render:');
    console.log('   - Check deployment logs in Render dashboard');
    console.log('   - Verify environment variables are set');
    console.log('   - Try manual redeploy');
}

// Run the fix
runQuickFix().catch(error => {
    console.error(`${colors.red}Fix script failed: ${error.message}${colors.reset}`);
    process.exit(1);
});