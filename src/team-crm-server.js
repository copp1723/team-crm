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
import { ValidationMiddleware } from './middleware/validation.js';
import { EnhancedRateLimitingMiddleware } from './middleware/enhanced-rate-limiting.js';
import { setupAuth } from './middleware/auth.js';
import { RealtimeManager } from './websocket/realtime-manager.js';
import { TeamCollaboration } from './collaboration/team-collaboration.js';

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
        this.rateLimiter = null;
        this.realtimeManager = null;
        this.teamCollaboration = null;
        
        this.setupMiddleware();
        this.setupRoutes();
    }
    
    /**
     * Initialize and start the server
     */
    async start() {
        try {
            console.log('Starting Team CRM Server...');
            
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
            
            // Connect notification system to executive API
            if (this.orchestrator.notificationSystem) {
                this.orchestrator.notificationSystem.executiveAPI = this.executiveAPI;
            }
            
            // Setup orchestrator event handlers
            this.setupOrchestratorEvents();
            
            const port = this.config.interface?.webInterface?.port || 8080;
            // In production, bind to 0.0.0.0 for Render
            const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : (this.config.interface?.webInterface?.host || 'localhost');
            
            console.log(`Attempting to listen on ${host}:${port}`);
            
            this.server.listen(port, host, () => {
                console.log(`Team CRM Server running at http://${host}:${port}`);
                console.log(`Team Input: http://${host}:${port}/chat`);
                console.log(`Executive View: http://${host}:${port}/executive-dashboard`);
                console.log(`API Docs: http://${host}:${port}/api/docs`);
            });
            
            this.server.on('error', (error) => {
                console.error('Server error:', error);
            });
            
            return true;
            
        } catch (error) {
            console.error('Error starting Team CRM Server:', error);
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
        
        // Serve static files for web interface
        const webInterfacePath = path.join(__dirname, '../web-interface');
        this.app.use('/static', express.static(webInterfacePath));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
    }
    
    /**
     * Setup rate limiting middleware after initialization
     */
    setupRateLimiting() {
        if (!this.rateLimiter) return;
        
        // Enhanced Redis-based rate limiting
        this.app.use('/api/', this.rateLimiter.createSmartMiddleware('api'));
        this.app.use('/api/intelligence/', this.rateLimiter.createSmartMiddleware('ai'));
        this.app.use('/api/update', this.rateLimiter.createSmartMiddleware('updates'));
        this.app.use('/api/summary/', this.rateLimiter.createSmartMiddleware('summaries'));
        this.app.use('/api/auth/', this.rateLimiter.createSmartMiddleware('auth'));
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
                const health = this.orchestrator ? await this.orchestrator.healthCheck() : { status: 'initializing' };
                res.json(health);
            } catch (error) {
                res.status(500).json({ status: 'error', message: error.message });
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
        
        // Process team update
        this.app.post('/api/update', ValidationMiddleware.validateTeamUpdate, async (req, res) => {
            try {
                const { memberName, updateText, metadata } = req.body;
                
                if (!this.orchestrator) {
                    return res.status(503).json({ 
                        error: 'System not ready. Please try again.' 
                    });
                }
                
                const result = await this.orchestrator.processTeamUpdate(
                    memberName, 
                    updateText, 
                    metadata || {}
                );
                
                res.json(result);
                
            } catch (error) {
                console.error('Error processing update:', error);
                res.status(500).json({ error: error.message });
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
                    return res.status(400).json({ error: 'userId is required' });
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
                    return res.status(400).json({ error: 'userId is required' });
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
                    return res.status(400).json({ error: 'userId and content are required' });
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
                    return res.status(400).json({ error: 'userId is required' });
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
                    return res.status(400).json({ error: 'userId is required' });
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