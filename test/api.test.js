/**
 * Basic API tests for Team CRM
 * Simple test suite for internal tool validation
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8080';
const STARTUP_DELAY = 3000; // 3 seconds for server to start

let serverProcess;

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/**
 * Start the server
 */
async function startServer() {
    return new Promise((resolve) => {
        console.log('Starting server...');
        serverProcess = spawn('npm', ['start'], {
            stdio: 'pipe',
            shell: true
        });
        
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Team CRM Server running')) {
                console.log('Server started successfully');
                setTimeout(resolve, 1000); // Give it a moment to fully initialize
            }
        });
        
        serverProcess.stderr.on('data', (data) => {
            console.error('Server error:', data.toString());
        });
        
        // Fallback timeout
        setTimeout(resolve, STARTUP_DELAY);
    });
}

/**
 * Stop the server
 */
function stopServer() {
    if (serverProcess) {
        console.log('Stopping server...');
        serverProcess.kill('SIGTERM');
    }
}

/**
 * Test an endpoint
 */
async function testEndpoint(method, path, expectedStatus, body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${BASE_URL}${path}`, options);
        const success = response.status === expectedStatus;
        
        console.log(
            `${success ? GREEN + '✓' : RED + '✗'} ${method} ${path} - ${response.status} ${success ? '==' : '!='} ${expectedStatus}${RESET}`
        );
        
        if (!success) {
            const text = await response.text();
            console.log(`  Response: ${text.substring(0, 100)}...`);
        }
        
        return success;
    } catch (error) {
        console.log(`${RED}✗ ${method} ${path} - Error: ${error.message}${RESET}`);
        return false;
    }
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('\n=== Team CRM API Tests ===\n');
    
    let passed = 0;
    let failed = 0;
    
    // Test health endpoint
    if (await testEndpoint('GET', '/health', 200)) passed++; else failed++;
    
    // Test API endpoints
    if (await testEndpoint('GET', '/api/status', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/team', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/config', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/summaries', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/docs', 200)) passed++; else failed++;
    
    // Test new endpoints
    if (await testEndpoint('GET', '/api/dashboard/executive', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/intelligence/follow-ups', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/analytics/forecast/monthly_value', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/api/dealers/active-pilots', 200)) passed++; else failed++;
    
    // Test web interface endpoints
    if (await testEndpoint('GET', '/chat', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/executive-dashboard', 200)) passed++; else failed++;
    if (await testEndpoint('GET', '/dashboard', 302)) passed++; else failed++; // Should redirect
    
    // Test POST endpoints
    if (await testEndpoint('POST', '/api/update', 400)) passed++; else failed++; // Missing required fields
    if (await testEndpoint('POST', '/api/update', 200, {
        memberName: 'Joe',
        updateText: 'Test update from automated tests'
    })) passed++; else failed++;
    
    if (await testEndpoint('POST', '/api/summary/generate', 200)) passed++; else failed++;
    
    // Summary
    console.log(`\n=== Test Summary ===`);
    console.log(`${GREEN}Passed: ${passed}${RESET}`);
    console.log(`${RED}Failed: ${failed}${RESET}`);
    console.log(`Total: ${passed + failed}\n`);
    
    return failed === 0;
}

/**
 * Main test runner
 */
async function main() {
    try {
        await startServer();
        const success = await runTests();
        stopServer();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Test runner error:', error);
        stopServer();
        process.exit(1);
    }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    stopServer();
    process.exit(1);
});

main();