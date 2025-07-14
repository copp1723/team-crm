/**
 * TEAM CRM SERVER
 * Main entry point for the AI-augmented team CRM system
 * 
 * This server provides:
 * - RESTful API for team updates
 * - WebSocket real-time communication
 * - Web interface for team input and executive dashboard
 * - Integration with the Team Orchestrator
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import { TeamOrchestrator } from './core/orchestration/team-orchestrator.js';
import { ExecutiveIntelligenceAPI } from './api/executive-intelligence-api.js';
import { AdminAPI } from './api/admin-api.js';
import { CalendarAPI } from './api/calendar-api.js';
import { EnhancedAPIResponse } from './api/enhanced-api-response.js';
import { ValidationMiddleware } from './middleware/validation.js';
import { registerMemoryStatsAPI } from './api/memory-stats-api.js';
import { EnhancedRateLimitingMiddleware } from './middleware/enhanced-rate-limiting.js';
import { ActivityLoggerMiddleware } from './middleware/activity-logger.js';
import { setupAuth } from './middleware/auth.js';
import { RealtimeManager } from './websocket/realtime-manager.js';
import { TeamCollaboration } from './collaboration/team-collaboration.js';
import { assistantEmailHandler } from './core/email/assistant-email-handler.js';
import { calendarService } from './core/calendar/calendar-service.js';
import { meetingProcessor } from './core/calendar/meeting-processor.js';
import { WebhookManager } from './core/webhooks/webhook-manager.js';
import { SlackIntegration } from './core/webhooks/slack-integration.js';
import { WebhookAPI } from './api/webhook-api.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TeamCRMServer {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.server = createServer(this.app);
        this.orchestrator = null;
        this.executiveAPI = null;
        this.adminAPI = null;
        this.calendarAPI = null;
        this.rateLimiter = null;
        this.activityLogger = null;
        this.realtimeManager = null;
        this.teamCollaboration = null;
        this.webhookManager = null;
        this.slackIntegration = null;
        this.webhookAPI = null;
        this.actualPort = null;
        this.actualHost = null;
        
        this.setupMiddleware();
        this.setupRoutes();
    }
    
    /**
     * Initialize and start the server
     */
    async start() {
        try {
            logger.info('Starting Team CRM Server...');
            
            // Initialize Redis-based rate limiting
            this.rateLimiter = new EnhancedRateLimitingMiddleware({
                redisHost: this.config.redis?.host,
                redisPort: this.config.redis?.port,
                redisPassword: this.config.redis?.password,
                enableBehaviorAnalysis: true,
                enableDynamicLimits: true,
                autoBlacklist: {
                    enabled: true,
                    threshold: 15,
                    windowMs: 300000, // 5 minutes
                    banDuration: 1800 // 30 minutes
                }
            });
            await this.rateLimiter.initialize();
            
            // Initialize activity logger
            this.activityLogger = new ActivityLoggerMiddleware({
                enabled: true,
                logRequestBody: true,
                logResponseData: false,
                performanceThreshold: 3000
            });
            
            // Setup rate limiting middleware now that it's initialized
            this.setupRateLimiting();
            
            // Initialize real-time WebSocket manager
            this.realtimeManager = new RealtimeManager(this.server, {
                heartbeatInterval: 30000,
                maxConnections: 50,
                rateLimitWindowMs: 60000,
                maxMessagesPerWindow: 100
            });
            
            // Initialize the orchestrator
            this.orchestrator = new TeamOrchestrator(this.config);
            await this.orchestrator.initialize();
            
            // Initialize team collaboration system
            this.teamCollaboration = new TeamCollaboration(
                this.realtimeManager,
                this.orchestrator.contextAwareAI,
                {
                    maxMessageHistory: 1000,
                    messageRetentionDays: 30,
                    enableAIModeration: true,
                    enableSmartSuggestions: true
                }
            );
            
            // Initialize executive intelligence API
            this.executiveAPI = new ExecutiveIntelligenceAPI(this.orchestrator, null);
            this.executiveAPI.registerEndpoints(this.app);
            
            // Initialize admin API
            this.adminAPI = new AdminAPI();
            this.adminAPI.registerEndpoints(this.app);
            
            // Initialize calendar API
            this.calendarAPI = new CalendarAPI(this.orchestrator);
            this.calendarAPI.registerEndpoints(this.app);
            
            // Initialize memory stats API
            registerMemoryStatsAPI(this.app, this.orchestrator);
            
            // Initialize webhook system
            this.webhookManager = new WebhookManager(this.orchestrator.notificationSystem);
            this.slackIntegration = new SlackIntegration(this.webhookManager, this.orchestrator);
            this.webhookAPI = new WebhookAPI(this.webhookManager);
            this.webhookAPI.registerEndpoints(this.app);
            
            // Register activity logger admin endpoints
            this.activityLogger.createAdminEndpoints(this.app);
            
            // Connect notification system to executive API
            if (this.orchestrator.notificationSystem) {
                this.orchestrator.notificationSystem.executiveAPI = this.executiveAPI;
            }
            
            // Setup orchestrator event handlers
            this.setupOrchestratorEvents();
            
            const port = this.config.interface?.webInterface?.port || process.env.PORT || 8080;
            // In production, bind to 0.0.0.0 for Render
            const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : (this.config.interface?.webInterface?.host || 'localhost');
            
            logger.info(`Attempting to listen on ${host}:${port}`);
            
            this.server.listen(port, host, () => {
                this.actualPort = port;
                this.actualHost = host === '0.0.0.0' ? 'localhost' : host;
                logger.info(`Team CRM Server running at http://${this.actualHost}:${this.actualPort}`);
                logger.info(`Team Input: http://${this.actualHost}:${this.actualPort}/chat`);
                logger.info(`Executive View: http://${this.actualHost}:${this.actualPort}/executive-dashboard`);
                logger.info(`API Docs: http://${this.actualHost}:${this.actualPort}/api/docs`);
            });
            
            this.server.on('error', (error) => {
                logger.error('Server error', { error });
            });
            
            return true;
            
        } catch (error) {
            logger.error('Error starting Team CRM Server', { error });
            throw error;
        }
    }
    
    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Security headers first
        this.app.use(ValidationMiddleware.securityHeaders);
        
        // Request size limiting
        this.app.use(ValidationMiddleware.createSizeLimiter('10mb'));
        
        // Setup authentication if in production
        if (process.env.NODE_ENV === 'production') {
            setupAuth(this.app);
        }
        
        // Rate limiting will be added after initialization
        
        this.app.use(cors());
        this.app.use(express.json({ limit: '1mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
        
        // Input sanitization
        this.app.use(ValidationMiddleware.sanitizeInputs);
        
        // Session tracking for activity logging
        if (this.activityLogger) {
            this.app.use(this.activityLogger.createSessionMiddleware());
        }
        
        // Serve static files for web interface
        const webInterfacePath = path.join(__dirname, '../web-interface');
        const publicPath = path.join(__dirname, '../public');
        const srcPath = path.join(__dirname, '../src'); // For ES6 module imports
        
        this.app.use('/static', express.static(webInterfacePath));
        this.app.use(express.static(publicPath)); // Serve favicon and other static assets
        
        // Serve source files for ES6 module imports (with proper MIME type)
        this.app.use('/src', express.static(srcPath, {
            setHeaders: (res, path) => {
                if (path.endsWith('.js')) {
                    res.setHeader('Content-Type', 'application/javascript');
                }
            }
        }));
        
        logger.info('Static file serving configured:', {
            webInterface: webInterfacePath,
            public: publicPath,
            src: srcPath
        });
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`);
            next();
        });
    }
    
    /**
     * Setup rate limiting middleware after initialization
     */
    setupRateLimiting() {
        if (!this.rateLimiter) return;
        
        // Store activity logger reference for rate limiter to use
        if (this.activityLogger) {
            this.app.locals.activityLogger = this.activityLogger;
        }
        
        // Enhanced Redis-based rate limiting
        this.app.use('/api/', this.rateLimiter.createSmartMiddleware('api'));
        this.app.use('/api/intelligence/', this.rateLimiter.createSmartMiddleware('ai'));
        this.app.use('/api/update', this.rateLimiter.createSmartMiddleware('updates'));
        this.app.use('/api/summary/', this.rateLimiter.createSmartMiddleware('summaries'));
        this.app.use('/api/auth/', this.rateLimiter.createSmartMiddleware('auth'));
        
        // Add activity logging middleware after rate limiting
        if (this.activityLogger) {
            this.app.use(this.activityLogger.createMiddleware());
            
            // Special middleware for login endpoint
            this.app.use('/api/auth/login', this.activityLogger.createLoginMiddleware());
            
            // UI interaction tracking endpoint
            this.app.post('/api/track/interaction', this.activityLogger.createUIInteractionMiddleware());
        }
    }
    
    /**
     * Setup API routes
     */
    setupRoutes() {
        // Simple test route
        this.app.get('/test', (req, res) => {
            res.send('Test route works!');
        });
        
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const health = this.orchestrator ? await this.orchestrator.healthCheck() : { 
                    status: 'initializing',
                    components: {
                        ai: { status: 'initializing' },
                        database: { status: 'unknown' },
                        memory: { 
                            heapUsed: process.memoryUsage().heapUsed,
                            uptime: process.uptime()
                        }
                    }
                };
                
                const response = EnhancedAPIResponse.createHealthResponse(health);
                res.json(response);
            } catch (error) {
                const errorResponse = EnhancedAPIResponse.createError(error, {
                    endpoint: '/health'
                });
                res.status(500).json(errorResponse);
            }
        });
        
        // System status
        this.app.get('/api/status', (req, res) => {
            try {
                const status = this.orchestrator ? this.orchestrator.getSystemStatus() : { initialized: false };
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Team members
        this.app.get('/api/team', (req, res) => {
            try {
                const members = this.orchestrator ? this.orchestrator.getTeamMembers() : [];
                res.json(members);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Assistant email webhook
        this.app.post('/api/email/assistant-webhook', async (req, res) => {
            try {
                console.log('Assistant email webhook received');
                
                // Process with assistant email handler
                const result = await assistantEmailHandler.queueEmail(req.body);
                
                res.json({
                    success: true,
                    message: 'Email queued for processing',
                    position: result.position
                });
                
            } catch (error) {
                console.error('Assistant email webhook error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Calendar API endpoints are now handled by CalendarAPI class
        // See src/api/calendar-api.js for implementation
        
        // Process team update
        this.app.post('/api/update', ValidationMiddleware.validateTeamUpdate, async (req, res) => {
            const startTime = Date.now();
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            try {
                const { memberName, updateText, metadata } = req.body;
                
                console.log(`[${requestId}] Processing update from ${memberName}`);
                
                if (!this.orchestrator) {
                    const error = new Error('System not ready. Please try again in a moment.');
                    return res.status(503).json(
                        EnhancedAPIResponse.createError(error, {
                            memberName,
                            requestId,
                            endpoint: '/api/update'
                        })
                    );
                }
                
                // Process the update with enhanced error handling
                const result = await this.orchestrator.processTeamUpdate(
                    memberName, 
                    updateText, 
                    metadata || {}
                );
                
                console.log(`[${requestId}] Update processed successfully in ${Date.now() - startTime}ms`);
                
                // Return enhanced response
                const response = EnhancedAPIResponse.createUpdateSuccess(result);
                res.json(response);
                
                // Emit real-time update
                if (this.realtimeManager) {
                    this.realtimeManager.broadcastToChannel('team-updates', {
                        type: 'updateProcessed',
                        data: {
                            memberName: result.memberName,
                            updateId: result.updateId,
                            extractedItems: result.extracted?.totalItems || 0,
                            confidence: result.confidence || 0.5,
                            hasEscalation: result.extracted?.detailedAnalysis?.executiveEscalation?.required || false
                        },
                        timestamp: new Date().toISOString()
                    });
                }
                
            } catch (error) {
                const processingTime = Date.now() - startTime;
                console.error(`[${requestId}] Error processing update (${processingTime}ms):`, error);
                
                const errorResponse = EnhancedAPIResponse.createError(error, {
                    memberName: req.body.memberName,
                    requestId,
                    endpoint: '/api/update'
                });
                
                // Determine appropriate status code based on error type
                const statusCode = error.message.includes('validation') ? 400 :
                                 error.message.includes('timeout') ? 408 :
                                 error.message.includes('API') ? 503 : 500;
                
                res.status(statusCode).json(errorResponse);
            }
        });
        
        // Force generate executive summary
        this.app.post('/api/summary/generate', async (req, res) => {
            try {
                if (!this.orchestrator) {
                    return res.status(503).json({ 
                        error: 'System not ready. Please try again.' 
                    });
                }
                
                const summary = await this.orchestrator.generateExecutiveSummary();
                res.json(summary);
                
            } catch (error) {
                console.error('Error generating summary:', error);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get recent summaries
        this.app.get('/api/summaries', async (req, res) => {
            try {
                // This would get recent summaries from memory
                // For now, return the current master agent stats
                const stats = this.orchestrator ? this.orchestrator.getSystemStatus() : {};
                res.json({
                    summaries: [],
                    masterAgent: stats.masterAgent || null
                });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Configuration endpoint
        this.app.get('/api/config', (req, res) => {
            try {
                // Return safe config (no API keys)
                const safeConfig = {
                    team: this.config.team,
                    interface: this.config.interface,
                    processing: this.config.processing
                };
                res.json(safeConfig);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Team Collaboration API endpoints
        
        // Get available rooms
        this.app.get('/api/collaboration/rooms', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const userInfo = {
                    role: req.headers['x-user-role'] || 'team_member',
                    name: req.headers['x-user-name'] || 'Unknown'
                };
                
                const rooms = this.teamCollaboration.getAvailableRooms(userInfo);
                res.json({ rooms });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Join a room
        this.app.post('/api/collaboration/rooms/:roomId/join', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const { userId, userInfo = {} } = req.body;
                
                if (!userId) {
                    return res.status(400).json({ error: 'Hey, we need to know who you are! Mind providing your userId?' });
                }
                
                const room = await this.teamCollaboration.joinRoom(roomId, userId, userInfo);
                res.json({ success: true, room: this.teamCollaboration.sanitizeRoomForBroadcast(room) });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Leave a room
        this.app.post('/api/collaboration/rooms/:roomId/leave', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const { userId } = req.body;
                
                if (!userId) {
                    return res.status(400).json({ error: 'Hey, we need to know who you are! Mind providing your userId?' });
                }
                
                const success = await this.teamCollaboration.leaveRoom(roomId, userId);
                res.json({ success });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Send a message
        this.app.post('/api/collaboration/rooms/:roomId/messages', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const { userId, content, type = 'text', metadata = {} } = req.body;
                
                if (!userId || !content) {
                    return res.status(400).json({ error: 'Looks like we\'re missing something! We need both your userId and some content to work with.' });
                }
                
                const message = await this.teamCollaboration.sendMessage(roomId, userId, content, {
                    type,
                    metadata
                });
                
                res.json({ success: true, message: this.teamCollaboration.sanitizeMessageForBroadcast(message) });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Get room history
        this.app.get('/api/collaboration/rooms/:roomId/history', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const { limit = 50, offset = 0 } = req.query;
                
                const messages = this.teamCollaboration.getRoomHistory(roomId, parseInt(limit), parseInt(offset));
                res.json({ messages });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Get room members
        this.app.get('/api/collaboration/rooms/:roomId/members', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const members = this.teamCollaboration.getRoomMembers(roomId);
                res.json({ members });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Start typing indicator
        this.app.post('/api/collaboration/rooms/:roomId/typing/start', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const { userId } = req.body;
                
                if (!userId) {
                    return res.status(400).json({ error: 'Hey, we need to know who you are! Mind providing your userId?' });
                }
                
                this.teamCollaboration.startTyping(roomId, userId);
                res.json({ success: true });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Stop typing indicator
        this.app.post('/api/collaboration/rooms/:roomId/typing/stop', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const { roomId } = req.params;
                const { userId } = req.body;
                
                if (!userId) {
                    return res.status(400).json({ error: 'Hey, we need to know who you are! Mind providing your userId?' });
                }
                
                this.teamCollaboration.stopTyping(roomId, userId);
                res.json({ success: true });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Get collaboration statistics
        this.app.get('/api/collaboration/stats', async (req, res) => {
            try {
                if (!this.teamCollaboration) {
                    return res.status(503).json({ error: 'Collaboration system not available' });
                }
                
                const stats = this.teamCollaboration.getStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        
        // Job monitoring endpoints
        this.app.get('/api/jobs/stats', async (req, res) => {
            try {
                if (!this.jobIntegration) {
                    return res.status(503).json({ error: 'Job system not available' });
                }
                
                const stats = await this.jobIntegration.getStats();
                
                // Calculate additional metrics
                const totalInQueue = Object.values(stats.queues?.queues || {})
                    .reduce((sum, queue) => sum + (queue.waiting || 0) + (queue.active || 0), 0);
                
                const successRate = stats.processing.totalJobsCompleted + stats.processing.totalJobsFailed > 0
                    ? stats.processing.totalJobsCompleted / (stats.processing.totalJobsCompleted + stats.processing.totalJobsFailed)
                    : 1;
                
                res.json({
                    ...stats,
                    totalInQueue,
                    successRate,
                    processingRate: stats.processing.totalJobsCompleted / Math.max(1, Date.now() / 60000), // jobs per minute
                    recentJobs: 0, // Placeholder
                    queueTrend: 'stable',
                    successTrend: 0 // Placeholder
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.get('/api/jobs/queues', async (req, res) => {
            try {
                if (!this.jobIntegration || !this.jobIntegration.queueManager) {
                    return res.status(503).json({ error: 'Queue system not available' });
                }
                
                const stats = await this.jobIntegration.queueManager.getQueueStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.get('/api/jobs/recent', async (req, res) => {
            try {
                const { filter = 'all', limit = 50 } = req.query;
                
                // This would integrate with your job history system
                // For now, return mock data
                const jobs = Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
                    id: `job-${Date.now() - i * 1000}`,
                    queue: ['ai-processing', 'executive-summaries', 'notifications'][i % 3],
                    name: ['extract-update', 'generate-summary', 'send-notification'][i % 3],
                    status: ['completed', 'active', 'failed', 'waiting'][i % 4],
                    timestamp: new Date(Date.now() - i * 60000).toISOString(),
                    duration: Math.floor(Math.random() * 5000) + 1000,
                    attemptsMade: 1,
                    attempts: 3
                }));
                
                const filteredJobs = filter === 'all' ? jobs : jobs.filter(job => job.status === filter);
                
                res.json({ jobs: filteredJobs, total: filteredJobs.length });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.get('/api/jobs/:jobId/status', async (req, res) => {
            try {
                if (!this.jobIntegration) {
                    return res.status(503).json({ error: 'Job system not available' });
                }
                
                const status = await this.jobIntegration.getJobStatus(req.params.jobId);
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.delete('/api/jobs/:jobId', async (req, res) => {
            try {
                if (!this.jobIntegration) {
                    return res.status(503).json({ error: 'Job system not available' });
                }
                
                const cancelled = await this.jobIntegration.cancelJob(req.params.jobId);
                res.json({ cancelled });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Web interface routes
        this.app.get('/', (req, res) => {
            res.redirect('/chat');
        });
        
        this.app.get('/chat', async (req, res) => {
            try {
                const html = await fs.readFile(path.join(__dirname, '../web-interface/chat.html'), 'utf8');
                res.send(html);
            } catch (error) {
                console.error('Error loading chat interface:', error);
                res.status(500).send('Error loading chat interface');
            }
        });
        
        // Team collaboration interface
        this.app.get('/collaboration', async (req, res) => {
            try {
                const html = await fs.readFile(path.join(__dirname, '../web-interface/team-collaboration.html'), 'utf8');
                res.send(html);
            } catch (error) {
                console.error('Error loading collaboration interface:', error);
                res.status(500).send('Error loading collaboration interface');
            }
        });
        
        // Main executive route
        this.app.get('/executive-dashboard', async (req, res) => {
            try {
                const html = await fs.readFile(path.join(__dirname, '../web-interface/executive-dashboard.html'), 'utf8');
                res.send(html);
            } catch (error) {
                console.error('Error loading executive dashboard:', error);
                res.status(500).send('Error loading executive dashboard');
            }
        });
        
        // Hide the useless legacy dashboard - executives don't need this
        this.app.get('/dashboard', async (req, res) => {
            res.redirect('/executive-dashboard');
        });
        
        // Job monitor interface
        this.app.get('/jobs', async (req, res) => {
            try {
                const html = await fs.readFile(path.join(__dirname, '../web-interface/job-monitor.html'), 'utf8');
                res.send(html);
            } catch (error) {
                console.error('Error loading job monitor interface:', error);
                res.status(500).send('Error loading job monitor interface');
            }
        });
        
        // Admin interface
        this.app.get('/admin', async (req, res) => {
            try {
                const html = await fs.readFile(path.join(__dirname, '../web-interface/admin.html'), 'utf8');
                res.send(html);
            } catch (error) {
                console.error('Error loading admin interface:', error);
                res.status(500).send('Error loading admin interface');
            }
        });
        
        // Rate limiting monitoring dashboard
        this.app.get('/rate-limits', async (req, res) => {
            try {
                const html = await fs.readFile(path.join(__dirname, '../web-interface/rate-limit-monitor.html'), 'utf8');
                res.send(html);
            } catch (error) {
                console.error('Error loading rate limit monitor:', error);
                res.status(500).send('Error loading rate limit monitor');
            }
        });
        
        // Rate limiting admin endpoints (if rate limiter is available)
        if (this.rateLimiter) {
            this.rateLimiter.createAdminEndpoints(this.app);
        }
        
        this.app.get('/api/docs', (req, res) => {
            res.json({
                title: 'Team CRM API Documentation',
                version: '1.0.0',
                endpoints: {
                    'GET /health': 'System health check',
                    'GET /api/status': 'Get system status and statistics',
                    'GET /api/team': 'Get list of team members',
                    'POST /api/update': 'Submit team update (requires: memberName, updateText)',
                    'POST /api/summary/generate': 'Force generate executive summary',
                    'GET /api/summaries': 'Get recent executive summaries',
                    'GET /api/config': 'Get system configuration',
                    'GET /api/dashboard/executive': 'Get executive dashboard summary data',
                    'GET /api/intelligence/follow-ups': 'Get follow-ups and action items',
                    'GET /api/analytics/forecast/monthly_value': 'Get revenue forecast data',
                    'GET /api/jobs/stats': 'Get job processing statistics',
                    'GET /api/jobs/queues': 'Get queue status and metrics',
                    'GET /api/jobs/recent': 'Get recent job history',
                    'GET /api/jobs/:jobId/status': 'Get specific job status',
                    'DELETE /api/jobs/:jobId': 'Cancel a specific job',
                    'GET /admin/rate-limits/stats': 'Get rate limiting statistics',
                    'POST /admin/rate-limits/reset/:clientId': 'Reset rate limits for client',
                    'POST /admin/rate-limits/whitelist/:clientId': 'Add client to whitelist',
                    'POST /admin/rate-limits/blacklist/:clientId': 'Add client to blacklist',
                    'GET /admin/rate-limits/status/:clientId': 'Get rate limit status for client',
                    'GET /api/calendar/auth/init/:userId': 'Initialize Google Calendar OAuth flow for user',
                    'GET /auth/google/callback': 'Handle Google Calendar OAuth callback',
                    'GET /api/calendar/calendars/:userId': 'Get user\'s Google calendars',
                    'GET /api/calendar/events/:userId': 'Get upcoming calendar events (query: calendarId, timeMin, timeMax, maxResults)',
                    'POST /api/calendar/events/:userId': 'Create calendar event (body: calendarId, eventData)',
                    'PUT /api/calendar/events/:userId/:eventId': 'Update calendar event (body: calendarId, eventData)',
                    'DELETE /api/calendar/events/:userId/:eventId': 'Delete calendar event (query: calendarId)',
                    'POST /api/calendar/availability/:userId': 'Check availability for time slots (body: timeSlots, calendarIds)',
                    'POST /api/calendar/optimal-time/:userId': 'Find optimal meeting time (body: duration, preferences)',
                    'POST /api/calendar/process-meeting': 'Process meeting invite from email (body: emailData, userId)',
                    'POST /api/calendar/process-followup': 'Process meeting follow-up from email (body: emailData)',
                    'GET /chat': 'Team chat interface',
                    'GET /dashboard': 'Redirects to executive dashboard',
                    'GET /executive-dashboard': 'Executive situational awareness system',
                    'GET /jobs': 'Job monitoring dashboard',
                    'GET /rate-limits': 'Rate limiting monitoring dashboard'
                },
                websocket: {
                    'connect to ws://host:port': 'Real-time updates and notifications'
                }
            });
        });
        
        // Voice input route (MISSING - this is causing the 404)
        this.app.get('/voice-input', async (req, res) => {
            try {
                logger.info('Voice input route accessed - this was missing!');
                const html = await fs.readFile(path.join(__dirname, '../web-interface/voice-input.html'), 'utf8');
                res.send(html);
            } catch (error) {
                logger.error('Error loading voice input interface:', error);
                res.status(500).send('Error loading voice input interface');
            }
        });
    }
    
    /**
     * Connect real-time manager to data sources
     */
    connectRealtimeDataSources() {
        if (!this.realtimeManager) return;
        
        // Connect rate limiter stats
        if (this.rateLimiter) {
            this.realtimeManager.getRateLimitData = async () => {
                try {
                    return await this.rateLimiter.getStats();
                } catch (error) {
                    return { error: error.message };
                }
            };
        }
        
        // Connect job queue stats (if available)
        if (this.jobIntegration) {
            this.realtimeManager.getJobQueueData = async () => {
                try {
                    return await this.jobIntegration.getStats();
                } catch (error) {
                    return { error: error.message };
                }
            };
        }
        
        // Connect executive intelligence data
        if (this.executiveAPI) {
            this.realtimeManager.getExecutiveData = async () => {
                try {
                    const summary = await this.executiveAPI.generateExecutiveSummary();
                    return {
                        summary,
                        timestamp: new Date().toISOString()
                    };
                } catch (error) {
                    return { error: error.message };
                }
            };
        }
        
        // Connect team updates data
        if (this.orchestrator) {
            this.realtimeManager.getTeamUpdatesData = async () => {
                try {
                    const members = this.orchestrator.getTeamMembers();
                    const status = this.orchestrator.getSystemStatus();
                    return {
                        members,
                        status,
                        timestamp: new Date().toISOString()
                    };
                } catch (error) {
                    return { error: error.message };
                }
            };
        }
    }
    
    /**
     * Setup orchestrator event handlers for real-time updates
     */
    setupOrchestratorEvents() {
        if (!this.realtimeManager) return;
        
        this.orchestrator.on('updateProcessed', (data) => {
            this.realtimeManager.broadcastToChannel('team-updates', {
                type: 'updateProcessed',
                data,
                timestamp: new Date().toISOString()
            });
        });
        
        this.orchestrator.on('summaryGenerated', (data) => {
            this.realtimeManager.broadcastToChannel('executive', {
                type: 'summaryGenerated',
                data,
                timestamp: new Date().toISOString()
            });
        });
        
        this.orchestrator.on('error', (data) => {
            this.realtimeManager.broadcastToChannel('system-health', {
                type: 'error',
                data,
                timestamp: new Date().toISOString()
            });
        });

        // Executive intelligence events
        this.orchestrator.on('escalationCreated', (data) => {
            this.realtimeManager.broadcastToChannel('executive', {
                type: 'escalationCreated',
                data,
                timestamp: new Date().toISOString()
            });
        });

        this.orchestrator.on('executiveComment', (data) => {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'executiveComment',
                data,
                timestamp: new Date().toISOString()
            });
        });
        
        // Connect real-time data sources after orchestrator is ready
        this.connectRealtimeDataSources();
    }
    
    /**
     * Get real-time WebSocket statistics
     */
    getRealtimeStats() {
        return this.realtimeManager ? this.realtimeManager.getStats() : null;
    }
    
    /**
     * Generate chat interface HTML
     */
    async generateChatInterface() {
        const members = this.orchestrator ? this.orchestrator.getTeamMembers() : [];
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team CRM - Chat Interface</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; color: #333; }
        .member-select { margin-bottom: 20px; }
        .member-select select { padding: 10px; font-size: 16px; border-radius: 4px; border: 1px solid #ddd; width: 200px; }
        .update-form { margin-bottom: 30px; }
        .update-form textarea { width: 100%; height: 120px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; resize: vertical; }
        .submit-btn { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        .submit-btn:hover { background: #0056b3; }
        .submit-btn:disabled { background: #6c757d; cursor: not-allowed; }
        .status { margin-top: 20px; padding: 15px; border-radius: 4px; }
        .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .live-updates { margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 4px; }
        .live-updates h3 { margin-top: 0; color: #495057; }
        .update-item { padding: 10px; margin: 10px 0; background: white; border-radius: 4px; border-left: 4px solid #007bff; }
        .nav-links { margin-bottom: 20px; text-align: center; }
        .nav-links a { margin: 0 15px; color: #007bff; text-decoration: none; font-weight: bold; }
        .nav-links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-links">
            <a href="/chat">Team Chat</a>
            <a href="/executive-dashboard">Executive Intelligence</a>
            <a href="/api/docs">API Docs</a>
        </div>
        
        <div class="header">
            <h1>Team CRM - Update Interface</h1>
            <p>Submit your updates and let AI extract the key information for Tre</p>
        </div>
        
        <div class="member-select">
            <label for="memberSelect"><strong>Who are you?</strong></label><br>
            <select id="memberSelect">
                <option value="">Select your name...</option>
                ${members.map(member => `<option value="${member.key}">${member.name} (${member.role})</option>`).join('')}
            </select>
        </div>
        
        <div class="update-form">
            <label for="updateText"><strong>Your Update:</strong></label><br>
            <textarea id="updateText" placeholder="Type your update here... Be natural! The AI will extract priorities, action items, client info, and urgent matters automatically."></textarea>
            <br><br>
            <button id="submitBtn" class="submit-btn">Submit Update</button>
        </div>
        
        <div id="status" class="status" style="display: none;"></div>
        
        <div class="live-updates">
            <h3>Live Updates</h3>
            <div id="liveUpdates">Connecting to real-time updates...</div>
        </div>
    </div>
    
    <script>
        const memberSelect = document.getElementById('memberSelect');
        const updateText = document.getElementById('updateText');
        const submitBtn = document.getElementById('submitBtn');
        const status = document.getElementById('status');
        const liveUpdates = document.getElementById('liveUpdates');
        
        // WebSocket connection
        const ws = new WebSocket('ws://' + window.location.host);
        
        ws.onopen = function() {
            liveUpdates.innerHTML = '<div style="color: green;">Connected to real-time updates</div>';
        };
        
        ws.onmessage = function(event) {
            const message = JSON.parse(event.data);
            addLiveUpdate(message);
        };
        
        ws.onclose = function() {
            liveUpdates.innerHTML = '<div style="color: red;">Disconnected from real-time updates</div>';
        };
        
        // Submit update
        submitBtn.addEventListener('click', async function() {
            const member = memberSelect.value;
            const text = updateText.value.trim();
            
            if (!member || !text) {
                showStatus('Please select your name and enter an update.', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            
            try {
                const response = await fetch('/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        memberName: member,
                        updateText: text
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showStatus('Update processed successfully! AI extracted ' + (result.extracted.totalItems || 0) + ' items.', 'success');
                    updateText.value = '';
                } else {
                    showStatus('Error: ' + result.error, 'error');
                }
                
            } catch (error) {
                showStatus('Error submitting update: ' + error.message, 'error');
            }
            
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Update';
        });
        
        function showStatus(message, type) {
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
            setTimeout(() => {
                status.style.display = 'none';
            }, 5000);
        }
        
        function addLiveUpdate(message) {
            const div = document.createElement('div');
            div.className = 'update-item';
            
            if (message.type === 'updateProcessed') {
                div.innerHTML = \`<strong>\${message.data.memberName}</strong> submitted an update - \${message.data.extractedItems} items extracted\`;
            } else if (message.type === 'summaryGenerated') {
                div.innerHTML = \`<strong>Executive Summary Generated</strong> - \${message.data.processedUpdates} updates processed\`;
                div.style.borderLeftColor = '#28a745';
            } else if (message.type === 'connected') {
                div.innerHTML = \`Connected: \${message.message}\`;
                div.style.borderLeftColor = '#28a745';
            }
            
            liveUpdates.appendChild(div);
            
            // Keep only last 10 updates
            while (liveUpdates.children.length > 11) {
                liveUpdates.removeChild(liveUpdates.children[1]);
            }
        }
    </script>
</body>
</html>`;
    }
    
    /**
     * Get the actual port the server is running on
     */
    getPort() {
        return this.actualPort || process.env.PORT || 8080;
    }
    
    /**
     * Get the actual host the server is running on
     */
    getHost() {
        return this.actualHost || 'localhost';
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('Shutting down Team CRM Server...');
        
        if (this.teamCollaboration) {
            await this.teamCollaboration.shutdown();
        }
        
        if (this.orchestrator) {
            await this.orchestrator.shutdown();
        }
        
        this.server.close();
        console.log('Team CRM Server shutdown complete');
    }
}