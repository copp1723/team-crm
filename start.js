/**
 * TEAM CRM FOUNDATION - MAIN ENTRY POINT
 * 
 * Start the AI-augmented team CRM system
 * 
 * Usage:
 *   node start.js                    # Start with default config
 *   npm start                        # Same as above
 *   npm run dev                      # Start in development mode
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

import { TeamCRMServer } from './src/team-crm-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (only in development)
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

/**
 * Load configuration from config file
 */
async function loadConfig() {
    try {
        const configPath = join(__dirname, 'config', 'team-config.json');
        const configFile = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configFile);
        
        // Apply environment-specific overrides
        const env = process.env.NODE_ENV || 'development';
        if (config.environments && config.environments[env]) {
            console.log(`Applying ${env} environment overrides...`);
            applyOverrides(config, config.environments[env]);
        }
        
        return config;
        
    } catch (error) {
        console.error('Error loading configuration:', error.message);
        console.log('Using default configuration...');
        return getDefaultConfig();
    }
}

/**
 * Apply environment-specific configuration overrides
 */
function applyOverrides(config, overrides) {
    for (const [key, value] of Object.entries(overrides)) {
        if (key.includes('.')) {
            // Handle nested keys like "processing.summaryGeneration.schedule"
            const keys = key.split('.');
            let current = config;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) current[keys[i]] = {};
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
        } else {
            config[key] = value;
        }
    }
}

/**
 * Get default configuration if config file is missing
 */
function getDefaultConfig() {
    return {
        metadata: {
            version: "1.0.0",
            description: "Default team CRM configuration"
        },
        project: {
            name: "Team CRM Foundation",
            description: "AI-powered team communication system"
        },
        team: {
            members: {
                joe: {
                    name: "Joe",
                    role: "Team Lead",
                    description: "Project management specialist",
                    model: "anthropic/claude-3-sonnet-20240229",
                    capabilities: ["client-updates", "priority-extraction", "action-items"],
                    focusAreas: ["client relationships", "project timelines"],
                    updateStyle: "detailed",
                    extractionPrompts: {
                        priorities: "Extract high-priority items",
                        actionItems: "Identify action items",
                        clientInfo: "Note client feedback"
                    }
                },
                charlie: {
                    name: "Charlie", 
                    role: "Technical Lead",
                    description: "Development progress specialist",
                    model: "openai/gpt-4-turbo-preview",
                    capabilities: ["progress-tracking", "technical-issues"],
                    focusAreas: ["development progress", "technical challenges"],
                    updateStyle: "technical",
                    extractionPrompts: {
                        progress: "Extract development progress",
                        blockers: "Identify technical blockers"
                    }
                },
                josh: {
                    name: "Josh",
                    role: "Business Analyst",
                    description: "Revenue analysis specialist", 
                    model: "anthropic/claude-3-opus-20240229",
                    capabilities: ["revenue-analysis", "strategic-insights"],
                    focusAreas: ["revenue impact", "business metrics"],
                    updateStyle: "analytical",
                    extractionPrompts: {
                        revenue: "Extract revenue-related items",
                        insights: "Identify strategic insights"
                    }
                }
            },
            executive: {
                name: "Tre",
                role: "Executive",
                description: "Receives strategic summaries",
                summaryStyle: "executive",
                focusAreas: ["strategic decisions", "attention allocation"],
                summaryPrompts: {
                    attention: "Where does attention need to be focused?",
                    revenue: "What has revenue impact?",
                    urgent: "What requires immediate decision?"
                }
            }
        },
        ai: {
            provider: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1",
            timeout: 30000,
            models: {
                extraction: "anthropic/claude-3-sonnet-20240229",
                analysis: "openai/gpt-4-turbo-preview", 
                summary: "anthropic/claude-3-opus-20240229"
            }
        },
        memory: {
            enabled: Boolean(process.env.SUPERMEMORY_API_KEY),
            settings: {
                baseUrl: "https://api.supermemory.ai",
                timeout: 30000
            }
        },
        interface: {
            webInterface: {
                enabled: true,
                port: parseInt(process.env.PORT || '8080'),
                host: process.env.HOST || "localhost"
            }
        },
        processing: {
            summaryGeneration: {
                schedule: "every 30 minutes"
            }
        }
    };
}

/**
 * Validate required environment variables
 */
function validateEnvironment() {
    // Check for alternative environment variable names
    if (!process.env.OPENROUTER_API_KEY && process.env.OpenRouter) {
        process.env.OPENROUTER_API_KEY = process.env.OpenRouter;
    }
    if (!process.env.SUPERMEMORY_API_KEY && process.env.SuperMemory) {
        process.env.SUPERMEMORY_API_KEY = process.env.SuperMemory;
    }
    
    const required = ['OPENROUTER_API_KEY'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => {
            console.error(`   - ${key}`);
        });
        console.error('\nPlease copy .env.example to .env and add your API keys.');
        process.exit(1);
    }
    
    const optional = ['SUPERMEMORY_API_KEY'];
    const missingOptional = optional.filter(key => !process.env[key]);
    
    if (missingOptional.length > 0) {
        console.log('⚠️  Optional environment variables not set:');
        missingOptional.forEach(key => {
            console.log(`   - ${key} (persistent memory features will be disabled)`);
        });
        console.log('');
    }
    
    console.log('✅ Environment validation complete');
}

/**
 * Display startup banner
 */
function displayBanner(config) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     TEAM CRM FOUNDATION                     ║
║                  AI-Augmented Team Insights                 ║
╠══════════════════════════════════════════════════════════════╣
║ Version: ${config.metadata?.version || '1.0.0'}                                            ║
║ Team Members: ${Object.keys(config.team?.members || {}).length} configured                               ║
║ Executive: ${config.team?.executive?.name || 'Tre'}                                              ║
║ AI Provider: ${config.ai?.provider || 'openrouter'}                                       ║
║ Memory: ${config.memory?.enabled ? 'Enabled' : 'Disabled'}                                         ║
╚══════════════════════════════════════════════════════════════╝
`);
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown(server) {
    const shutdown = async () => {
        console.log('\n🛑 Received shutdown signal. Gracefully shutting down...');
        try {
            await server.shutdown();
            console.log('✅ Shutdown complete');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    };
    
    process.on('SIGINT', shutdown);  // Ctrl+C
    process.on('SIGTERM', shutdown); // Termination signal
    process.on('SIGUSR2', shutdown); // Nodemon restart
}

/**
 * Main startup function
 */
async function main() {
    try {
        console.log('🚀 Starting Team CRM Foundation...\n');
        
        // Validate environment
        validateEnvironment();
        
        // Load configuration
        console.log('📝 Loading configuration...');
        const config = await loadConfig();
        
        // Display banner
        displayBanner(config);
        
        // Create and start server
        console.log('🔧 Initializing server...');
        const server = new TeamCRMServer(config);
        
        // Setup graceful shutdown
        setupGracefulShutdown(server);
        
        // Start the server
        await server.start();
        
        console.log('\n✅ Team CRM Foundation is running!');
        console.log('\n📋 Quick Start:');
        console.log('   1. Visit http://localhost:3000/chat to submit team updates');
        console.log('   2. View http://localhost:3000/executive-dashboard for executive awareness');
        console.log('   3. Use the API at http://localhost:3000/api/docs for programmatic access');
        console.log('\n💡 Press Ctrl+C to stop the server');
        
    } catch (error) {
        console.error('❌ Failed to start Team CRM Foundation:', error);
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Check that all required environment variables are set');
        console.error('   2. Verify your OpenRouter API key is valid');
        console.error('   3. Ensure the configured port is available');
        console.error('   4. Check the configuration file for syntax errors');
        process.exit(1);
    }
}

// Start the application
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});