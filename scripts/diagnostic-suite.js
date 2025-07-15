#!/usr/bin/env node

/**
 * Team CRM Comprehensive Diagnostic Suite
 * Consolidated diagnostic tool combining troubleshooting, server diagnosis, and server discovery
 */

import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

// Diagnostic modes
const DIAGNOSTIC_MODES = {
    FULL: 'full',
    QUICK: 'quick',
    SERVER_ONLY: 'server',
    CONFIG_ONLY: 'config'
};

class DiagnosticSuite {
    constructor(options = {}) {
        this.mode = options.mode || DIAGNOSTIC_MODES.FULL;
        this.verbose = options.verbose || false;
        this.results = {
            fileStructure: {},
            environment: {},
            configuration: {},
            serverStatus: {},
            apiEndpoints: {},
            summary: {
                totalChecks: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };
    }

    /**
     * Run comprehensive diagnostics
     */
    async runDiagnostics() {
        console.log(`${colors.cyan}🔍 Team CRM Comprehensive Diagnostic Suite${colors.reset}`);
        console.log(`${colors.cyan}=============================================${colors.reset}\n`);
        console.log(`Mode: ${this.mode}\n`);

        try {
            if (this.mode === DIAGNOSTIC_MODES.FULL || this.mode === DIAGNOSTIC_MODES.CONFIG_ONLY) {
                await this.checkFileStructure();
                await this.checkEnvironmentVariables();
                await this.checkConfiguration();
            }

            if (this.mode === DIAGNOSTIC_MODES.FULL || this.mode === DIAGNOSTIC_MODES.SERVER_ONLY) {
                await this.findAndTestServer();
                await this.testApiEndpoints();
            }

            await this.generateSummaryReport();

        } catch (error) {
            console.error(`${colors.red}Diagnostic suite failed: ${error.message}${colors.reset}`);
            if (this.verbose) {
                console.error(error.stack);
            }
        }
    }

    /**
     * Check file structure and required files
     */
    async checkFileStructure() {
        console.log(`${colors.blue}📁 Checking File Structure...${colors.reset}`);
        
        const requiredFiles = [
            { path: join(process.cwd(), 'package.json'), name: 'Package.json', critical: true },
            { path: join(process.cwd(), 'start.js'), name: 'Main entry point', critical: true },
            { path: join(process.cwd(), 'src/team-crm-server.js'), name: 'Server file', critical: true },
            { path: join(process.cwd(), 'config/team-config.json'), name: 'Team configuration', critical: true },
            { path: join(process.cwd(), 'web-interface/chat.html'), name: 'Chat interface', critical: false },
            { path: join(process.cwd(), 'public/favicon.ico'), name: 'Favicon', critical: false },
            { path: join(process.cwd(), '.env'), name: 'Environment file', critical: true }
        ];

        for (const file of requiredFiles) {
            const exists = await this.checkFile(file.path, file.name, file.critical);
            this.results.fileStructure[file.name] = exists;
        }

        console.log();
    }

    /**
     * Check individual file existence
     */
    async checkFile(filePath, description, critical = false) {
        try {
            await fs.access(filePath);
            console.log(`${colors.green}✅ ${description}: ${filePath}${colors.reset}`);
            this.incrementCounter('passed');
            return true;
        } catch (error) {
            const symbol = critical ? '❌' : '⚠️';
            const color = critical ? colors.red : colors.yellow;
            console.log(`${color}${symbol} ${description}: ${filePath} - ${error.message}${colors.reset}`);
            this.incrementCounter(critical ? 'failed' : 'warnings');
            return false;
        }
    }

    /**
     * Check environment variables
     */
    async checkEnvironmentVariables() {
        console.log(`${colors.blue}🌍 Checking Environment Variables...${colors.reset}`);

        const requiredEnvVars = [
            { name: 'OPENROUTER_API_KEY', critical: true },
            { name: 'DATABASE_URL', critical: true },
            { name: 'NODE_ENV', critical: false },
            { name: 'PORT', critical: false }
        ];

        const optionalEnvVars = [
            'SUPERMEMORY_API_KEY',
            'LOG_LEVEL',
            'REDIS_URL'
        ];

        // Check required variables
        for (const envVar of requiredEnvVars) {
            const value = process.env[envVar.name];
            if (value && value.trim() !== '') {
                console.log(`${colors.green}✅ ${envVar.name}: Set${colors.reset}`);
                this.results.environment[envVar.name] = 'set';
                this.incrementCounter('passed');
            } else {
                const symbol = envVar.critical ? '❌' : '⚠️';
                const color = envVar.critical ? colors.red : colors.yellow;
                console.log(`${color}${symbol} ${envVar.name}: Missing or empty${colors.reset}`);
                this.results.environment[envVar.name] = 'missing';
                this.incrementCounter(envVar.critical ? 'failed' : 'warnings');
            }
        }

        // Check optional variables
        for (const envVar of optionalEnvVars) {
            const value = process.env[envVar];
            if (value && value.trim() !== '') {
                console.log(`${colors.green}ℹ️  ${envVar}: Set (optional)${colors.reset}`);
                this.results.environment[envVar] = 'set';
            } else {
                console.log(`${colors.yellow}⚠️  ${envVar}: Not set (optional)${colors.reset}`);
                this.results.environment[envVar] = 'not_set';
            }
        }

        console.log();
    }

    /**
     * Check configuration files
     */
    async checkConfiguration() {
        console.log(`${colors.blue}⚙️  Checking Configuration...${colors.reset}`);

        try {
            // Check team configuration
            const teamConfigPath = join(process.cwd(), 'config/team-config.json');
            const teamConfigData = await fs.readFile(teamConfigPath, 'utf8');
            const teamConfig = JSON.parse(teamConfigData);

            console.log(`${colors.green}✅ Team configuration loaded successfully${colors.reset}`);
            this.incrementCounter('passed');

            // Validate team members
            const memberCount = Object.keys(teamConfig.team?.members || {}).length;
            console.log(`${colors.green}ℹ️  Found ${memberCount} team members configured${colors.reset}`);
            this.results.configuration.teamMembers = memberCount;

            // Validate executives
            const executiveCount = teamConfig.team?.executives?.length || 0;
            console.log(`${colors.green}ℹ️  Found ${executiveCount} executives configured${colors.reset}`);
            this.results.configuration.executives = executiveCount;

        } catch (error) {
            console.log(`${colors.red}❌ Team configuration error: ${error.message}${colors.reset}`);
            this.incrementCounter('failed');
        }

        try {
            // Check feature flags
            const flagsPath = join(process.cwd(), 'config/feature-flags.json');
            const flagsData = await fs.readFile(flagsPath, 'utf8');
            const flags = JSON.parse(flagsData);

            console.log(`${colors.green}✅ Feature flags loaded successfully${colors.reset}`);
            console.log(`${colors.green}ℹ️  Found ${Object.keys(flags).length} feature flags${colors.reset}`);
            this.results.configuration.featureFlags = Object.keys(flags).length;
            this.incrementCounter('passed');

        } catch (error) {
            console.log(`${colors.yellow}⚠️  Feature flags not found or invalid: ${error.message}${colors.reset}`);
            this.incrementCounter('warnings');
        }

        console.log();
    }

    /**
     * Find and test running server
     */
    async findAndTestServer() {
        console.log(`${colors.blue}🔍 Finding and Testing Server...${colors.reset}`);

        const possiblePorts = [
            process.env.PORT || 10000,
            8080,
            3000,
            10000
        ];

        let serverFound = false;

        for (const port of possiblePorts) {
            try {
                console.log(`   Checking port ${port}...`);
                const response = await fetch(`http://localhost:${port}/health`, { 
                    timeout: 3000 
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`${colors.green}✅ Server found on port ${port}${colors.reset}`);
                    console.log(`   Status: ${data.status || 'unknown'}`);
                    console.log(`   URLs:`);
                    console.log(`   - Chat: http://localhost:${port}/chat`);
                    console.log(`   - Executive: http://localhost:${port}/executive-dashboard`);
                    console.log(`   - Admin: http://localhost:${port}/admin`);
                    console.log(`   - API Health: http://localhost:${port}/health`);
                    
                    this.results.serverStatus.running = true;
                    this.results.serverStatus.port = port;
                    this.results.serverStatus.status = data.status;
                    this.incrementCounter('passed');
                    serverFound = true;
                    
                    // Test server responsiveness
                    await this.testServerHealth(port);
                    break;
                }
            } catch (error) {
                // Silent fail, continue checking other ports
            }
        }

        if (!serverFound) {
            console.log(`${colors.red}❌ No running Team CRM server found${colors.reset}`);
            console.log(`${colors.yellow}💡 Start the server with: npm start${colors.reset}`);
            this.results.serverStatus.running = false;
            this.incrementCounter('failed');
        }

        console.log();
    }

    /**
     * Test server health and performance
     */
    async testServerHealth(port) {
        console.log(`${colors.blue}🏥 Testing Server Health...${colors.reset}`);

        try {
            const startTime = Date.now();
            const response = await fetch(`http://localhost:${port}/health`, { timeout: 5000 });
            const responseTime = Date.now() - startTime;

            if (response.ok) {
                const data = await response.json();
                console.log(`${colors.green}✅ Health check passed (${responseTime}ms)${colors.reset}`);
                
                if (responseTime > 2000) {
                    console.log(`${colors.yellow}⚠️  Slow response time: ${responseTime}ms${colors.reset}`);
                    this.incrementCounter('warnings');
                } else {
                    this.incrementCounter('passed');
                }

                this.results.serverStatus.responseTime = responseTime;
                this.results.serverStatus.healthData = data;
            }
        } catch (error) {
            console.log(`${colors.red}❌ Health check failed: ${error.message}${colors.reset}`);
            this.incrementCounter('failed');
        }
    }

    /**
     * Test API endpoints
     */
    async testApiEndpoints() {
        if (!this.results.serverStatus.running) {
            console.log(`${colors.yellow}⚠️  Skipping API tests - server not running${colors.reset}\n`);
            return;
        }

        console.log(`${colors.blue}🌐 Testing API Endpoints...${colors.reset}`);
        const port = this.results.serverStatus.port;

        const endpoints = [
            { path: '/health', method: 'GET', critical: true },
            { path: '/api/docs', method: 'GET', critical: false },
            { path: '/api/team/members', method: 'GET', critical: true },
            { path: '/api/executive/summary', method: 'GET', critical: false }
        ];

        for (const endpoint of endpoints) {
            await this.testEndpoint(port, endpoint);
        }

        // Test update endpoint with sample data
        await this.testUpdateEndpoint(port);

        console.log();
    }

    /**
     * Test individual endpoint
     */
    async testEndpoint(port, endpoint) {
        try {
            const response = await fetch(`http://localhost:${port}${endpoint.path}`, {
                method: endpoint.method,
                timeout: 5000
            });

            const symbol = response.ok ? '✅' : (endpoint.critical ? '❌' : '⚠️');
            const color = response.ok ? colors.green : (endpoint.critical ? colors.red : colors.yellow);
            
            console.log(`${color}${symbol} ${endpoint.method} ${endpoint.path} - ${response.status} ${response.statusText}${colors.reset}`);
            
            this.results.apiEndpoints[endpoint.path] = {
                status: response.status,
                ok: response.ok
            };

            if (response.ok) {
                this.incrementCounter('passed');
            } else {
                this.incrementCounter(endpoint.critical ? 'failed' : 'warnings');
            }

        } catch (error) {
            const symbol = endpoint.critical ? '❌' : '⚠️';
            const color = endpoint.critical ? colors.red : colors.yellow;
            console.log(`${color}${symbol} ${endpoint.method} ${endpoint.path} - ${error.message}${colors.reset}`);
            
            this.results.apiEndpoints[endpoint.path] = {
                status: 'error',
                error: error.message,
                ok: false
            };

            this.incrementCounter(endpoint.critical ? 'failed' : 'warnings');
        }
    }

    /**
     * Test update endpoint with sample data
     */
    async testUpdateEndpoint(port) {
        console.log(`   Testing update endpoint with sample data...`);
        
        try {
            const response = await fetch(`http://localhost:${port}/api/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberName: 'test',
                    updateText: 'Diagnostic test message - can be ignored.'
                }),
                timeout: 5000
            });

            if (response.ok) {
                console.log(`${colors.green}✅ Update endpoint working (${response.status})${colors.reset}`);
                this.incrementCounter('passed');
            } else {
                console.log(`${colors.yellow}⚠️  Update endpoint returned: ${response.status} ${response.statusText}${colors.reset}`);
                this.incrementCounter('warnings');
            }

            this.results.apiEndpoints['/api/update'] = {
                status: response.status,
                ok: response.ok
            };

        } catch (error) {
            console.log(`${colors.red}❌ Update endpoint failed: ${error.message}${colors.reset}`);
            this.results.apiEndpoints['/api/update'] = {
                status: 'error',
                error: error.message,
                ok: false
            };
            this.incrementCounter('failed');
        }
    }

    /**
     * Generate summary report
     */
    async generateSummaryReport() {
        console.log(`${colors.magenta}📊 Diagnostic Summary Report${colors.reset}`);
        console.log(`${colors.magenta}=============================${colors.reset}\n`);

        const { summary } = this.results;
        const successRate = summary.totalChecks > 0 ? ((summary.passed / summary.totalChecks) * 100).toFixed(1) : 0;

        console.log(`Total Checks: ${summary.totalChecks}`);
        console.log(`${colors.green}Passed: ${summary.passed}${colors.reset}`);
        console.log(`${colors.red}Failed: ${summary.failed}${colors.reset}`);
        console.log(`${colors.yellow}Warnings: ${summary.warnings}${colors.reset}`);
        console.log(`Success Rate: ${successRate}%\n`);

        // Determine overall status
        let overallStatus;
        let statusColor;
        
        if (summary.failed === 0) {
            overallStatus = summary.warnings === 0 ? 'EXCELLENT' : 'GOOD';
            statusColor = summary.warnings === 0 ? colors.green : colors.yellow;
        } else if (summary.failed <= 2) {
            overallStatus = 'NEEDS ATTENTION';
            statusColor = colors.yellow;
        } else {
            overallStatus = 'CRITICAL ISSUES';
            statusColor = colors.red;
        }

        console.log(`${statusColor}Overall Status: ${overallStatus}${colors.reset}\n`);

        // Recommendations
        this.generateRecommendations();

        // Save results to file if verbose
        if (this.verbose) {
            await this.saveResultsToFile();
        }
    }

    /**
     * Generate recommendations based on results
     */
    generateRecommendations() {
        console.log(`${colors.blue}💡 Recommendations:${colors.reset}`);

        if (!this.results.serverStatus.running) {
            console.log(`${colors.yellow}• Start the server: npm start${colors.reset}`);
        }

        if (this.results.environment.OPENROUTER_API_KEY === 'missing') {
            console.log(`${colors.yellow}• Set OPENROUTER_API_KEY in your .env file${colors.reset}`);
        }

        if (this.results.environment.DATABASE_URL === 'missing') {
            console.log(`${colors.yellow}• Set DATABASE_URL in your .env file${colors.reset}`);
        }

        if (this.results.serverStatus.responseTime > 2000) {
            console.log(`${colors.yellow}• Server response time is slow - check system resources${colors.reset}`);
        }

        if (this.results.summary.failed === 0 && this.results.summary.warnings === 0) {
            console.log(`${colors.green}• All systems are operating normally!${colors.reset}`);
        }

        console.log();
    }

    /**
     * Save detailed results to file
     */
    async saveResultsToFile() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `diagnostic-results-${timestamp}.json`;
            const filepath = join(process.cwd(), filename);
            
            await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
            console.log(`${colors.blue}📄 Detailed results saved to: ${filename}${colors.reset}\n`);
        } catch (error) {
            console.log(`${colors.yellow}⚠️  Could not save results file: ${error.message}${colors.reset}\n`);
        }
    }

    /**
     * Increment result counters
     */
    incrementCounter(type) {
        this.results.summary.totalChecks++;
        this.results.summary[type] = (this.results.summary[type] || 0) + 1;
    }
}

/**
 * Parse command line arguments
 */
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        mode: DIAGNOSTIC_MODES.FULL,
        verbose: false
    };

    for (const arg of args) {
        switch (arg) {
            case '--quick':
                options.mode = DIAGNOSTIC_MODES.QUICK;
                break;
            case '--server-only':
                options.mode = DIAGNOSTIC_MODES.SERVER_ONLY;
                break;
            case '--config-only':
                options.mode = DIAGNOSTIC_MODES.CONFIG_ONLY;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Team CRM Diagnostic Suite

Usage: node scripts/diagnostic-suite.js [options]

Options:
  --quick         Run quick diagnostics (minimal checks)
  --server-only   Test server and API endpoints only  
  --config-only   Check configuration and files only
  --verbose, -v   Verbose output and save results to file
  --help, -h      Show this help message

Examples:
  node scripts/diagnostic-suite.js                 # Full diagnostics
  node scripts/diagnostic-suite.js --server-only   # Server tests only
  node scripts/diagnostic-suite.js --verbose       # Full with detailed output
                `);
                process.exit(0);
        }
    }

    return options;
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const options = parseArguments();
    const diagnostics = new DiagnosticSuite(options);
    
    diagnostics.runDiagnostics().catch(error => {
        console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}