/**
 * Real-time WebSocket Manager for Team CRM
 * Provides live updates for dashboards, job queues, rate limiting, and team collaboration
 */

import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';

export class RealtimeManager {
    constructor(server, config = {}) {
        this.server = server;
        this.config = {
            heartbeatInterval: config.heartbeatInterval || 30000,
            maxConnections: config.maxConnections || 100,
            rateLimitWindowMs: config.rateLimitWindowMs || 60000,
            maxMessagesPerWindow: config.maxMessagesPerWindow || 60,
            ...config
        };
        
        this.wss = new WebSocketServer({ 
            server: this.server,
            path: '/realtime'
        });
        
        this.clients = new Map();
        this.channels = new Map();
        this.connectionCounts = new Map();
        this.messageRateLimit = new Map();
        
        this.logger = logger.child({ component: 'RealtimeManager' });
        
        this.setupWebSocketServer();
        this.startHeartbeat();
        
        // Channel subscriptions for different data types
        this.initializeChannels();
    }
    
    /**
     * Initialize available channels for subscriptions
     */
    initializeChannels() {
        const channels = [
            'rate-limits',      // Rate limiting statistics and alerts
            'job-queue',        // Background job status updates
            'executive',        // Executive dashboard data
            'team-updates',     // Team member updates and messages
            'system-health',    // System performance and health
            'ai-intelligence',  // AI processing and insights
            'collaboration'     // Real-time team collaboration
        ];
        
        channels.forEach(channel => {
            this.channels.set(channel, new Set());
        });
        
        this.logger.info('Initialized WebSocket channels', { channels });
    }
    
    /**
     * Setup WebSocket server with connection handling
     */
    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            const clientIP = req.socket.remoteAddress;
            const clientId = this.generateClientId();
            
            // Rate limiting check
            if (!this.checkConnectionRateLimit(clientIP)) {
                ws.close(1008, 'Connection rate limit exceeded');
                return;
            }
            
            // Connection limit check
            if (this.clients.size >= this.config.maxConnections) {
                ws.close(1008, 'Server at capacity');
                return;
            }
            
            const client = {
                id: clientId,
                ws: ws,
                ip: clientIP,
                connectedAt: new Date(),
                lastPing: new Date(),
                subscriptions: new Set(),
                metadata: {
                    userAgent: req.headers['user-agent'],
                    origin: req.headers.origin
                }
            };
            
            this.clients.set(clientId, client);
            this.trackConnection(clientIP);
            
            this.logger.info('Client connected', {
                clientId,
                clientIP,
                totalConnections: this.clients.size
            });
            
            // Send welcome message
            this.sendToClient(clientId, {
                type: 'connected',
                clientId: clientId,
                timestamp: new Date().toISOString(),
                availableChannels: Array.from(this.channels.keys()),
                message: 'Connected to Team CRM Real-time Updates'
            });
            
            this.setupClientEventHandlers(clientId, ws);
        });
        
        this.wss.on('error', (error) => {
            this.logger.error('WebSocket server error', { error });
        });
    }
    
    /**
     * Setup event handlers for individual client
     */
    setupClientEventHandlers(clientId, ws) {
        ws.on('message', (message) => {
            try {
                if (!this.checkMessageRateLimit(clientId)) {
                    this.sendToClient(clientId, {
                        type: 'error',
                        error: 'Message rate limit exceeded'
                    });
                    return;
                }
                
                const data = JSON.parse(message);
                this.handleClientMessage(clientId, data);
                
            } catch (error) {
                this.logger.warn('Invalid message from client', { clientId, error: error.message });
                this.sendToClient(clientId, {
                    type: 'error',
                    error: 'Invalid message format'
                });
            }
        });
        
        ws.on('pong', () => {
            const client = this.clients.get(clientId);
            if (client) {
                client.lastPing = new Date();
            }
        });
        
        ws.on('close', (code, reason) => {
            this.handleClientDisconnect(clientId, code, reason);
        });
        
        ws.on('error', (error) => {
            this.logger.warn('Client WebSocket error', { clientId, error: error.message });
            this.handleClientDisconnect(clientId, 1011, 'WebSocket error');
        });
    }
    
    /**
     * Handle incoming client messages
     */
    handleClientMessage(clientId, data) {
        const { type, ...payload } = data;
        
        switch (type) {
            case 'subscribe':
                this.handleSubscription(clientId, payload.channel, true);
                break;
                
            case 'unsubscribe':
                this.handleSubscription(clientId, payload.channel, false);
                break;
                
            case 'ping':
                this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                break;
                
            case 'get-status':
                this.sendStatusUpdate(clientId);
                break;
                
            case 'collaboration-message':
                this.handleCollaborationMessage(clientId, payload);
                break;
                
            default:
                this.logger.warn('Unknown message type', { clientId, type });
                this.sendToClient(clientId, {
                    type: 'error',
                    error: `Unknown message type: ${type}`
                });
        }
    }
    
    /**
     * Handle channel subscriptions
     */
    handleSubscription(clientId, channel, subscribe) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        if (!this.channels.has(channel)) {
            this.sendToClient(clientId, {
                type: 'error',
                error: `Unknown channel: ${channel}`
            });
            return;
        }
        
        const channelSet = this.channels.get(channel);
        
        if (subscribe) {
            channelSet.add(clientId);
            client.subscriptions.add(channel);
            
            this.logger.debug('Client subscribed to channel', { clientId, channel });
            
            this.sendToClient(clientId, {
                type: 'subscription-confirmed',
                channel: channel,
                subscribed: true
            });
            
            // Send initial data for the channel
            this.sendInitialChannelData(clientId, channel);
            
        } else {
            channelSet.delete(clientId);
            client.subscriptions.delete(channel);
            
            this.logger.debug('Client unsubscribed from channel', { clientId, channel });
            
            this.sendToClient(clientId, {
                type: 'subscription-confirmed',
                channel: channel,
                subscribed: false
            });
        }
    }
    
    /**
     * Send initial data when client subscribes to channel
     */
    async sendInitialChannelData(clientId, channel) {
        try {
            let initialData = {};
            
            switch (channel) {
                case 'rate-limits':
                    initialData = await this.getRateLimitData();
                    break;
                    
                case 'job-queue':
                    initialData = await this.getJobQueueData();
                    break;
                    
                case 'executive':
                    initialData = await this.getExecutiveData();
                    break;
                    
                case 'system-health':
                    initialData = await this.getSystemHealthData();
                    break;
                    
                case 'team-updates':
                    initialData = await this.getTeamUpdatesData();
                    break;
                    
                default:
                    initialData = { message: `Welcome to ${channel} channel` };
            }
            
            this.sendToClient(clientId, {
                type: 'channel-data',
                channel: channel,
                data: initialData,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            this.logger.error('Error sending initial channel data', { clientId, channel, error });
        }
    }
    
    /**
     * Handle collaboration messages
     */
    handleCollaborationMessage(clientId, payload) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const message = {
            type: 'collaboration-message',
            from: clientId,
            timestamp: new Date().toISOString(),
            ...payload
        };
        
        // Broadcast to all clients subscribed to collaboration channel
        this.broadcastToChannel('collaboration', message);
        
        this.logger.debug('Collaboration message broadcasted', { clientId, messageType: payload.messageType });
    }
    
    /**
     * Handle client disconnection
     */
    handleClientDisconnect(clientId, code, reason) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        // Remove from all channel subscriptions
        client.subscriptions.forEach(channel => {
            const channelSet = this.channels.get(channel);
            if (channelSet) {
                channelSet.delete(clientId);
            }
        });
        
        // Remove from clients map
        this.clients.delete(clientId);
        
        // Update connection count
        this.untrackConnection(client.ip);
        
        this.logger.info('Client disconnected', {
            clientId,
            code,
            reason: reason?.toString(),
            connectedDuration: Date.now() - client.connectedAt.getTime(),
            totalConnections: this.clients.size
        });
    }
    
    /**
     * Broadcast message to all clients in a channel
     */
    broadcastToChannel(channel, message) {
        const channelSet = this.channels.get(channel);
        if (!channelSet) return;
        
        const broadcastMessage = {
            type: 'channel-broadcast',
            channel: channel,
            data: message,
            timestamp: new Date().toISOString()
        };
        
        let successCount = 0;
        let errorCount = 0;
        
        channelSet.forEach(clientId => {
            try {
                this.sendToClient(clientId, broadcastMessage);
                successCount++;
            } catch (error) {
                errorCount++;
                this.logger.warn('Failed to send broadcast to client', { clientId, channel, error: error.message });
            }
        });
        
        this.logger.debug('Channel broadcast completed', {
            channel,
            successCount,
            errorCount,
            totalSubscribers: channelSet.size
        });
    }
    
    /**
     * Send message to specific client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== client.ws.OPEN) {
            return false;
        }
        
        try {
            client.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            this.logger.warn('Failed to send message to client', { clientId, error: error.message });
            this.handleClientDisconnect(clientId, 1011, 'Send error');
            return false;
        }
    }
    
    /**
     * Send status update to client
     */
    sendStatusUpdate(clientId) {
        const status = {
            connectedClients: this.clients.size,
            availableChannels: Array.from(this.channels.keys()),
            serverUptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            subscriptions: {}
        };
        
        // Add subscription counts per channel
        this.channels.forEach((subscribers, channel) => {
            status.subscriptions[channel] = subscribers.size;
        });
        
        this.sendToClient(clientId, {
            type: 'status-update',
            data: status,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Rate limiting for connections
     */
    checkConnectionRateLimit(clientIP) {
        const currentConnections = this.connectionCounts.get(clientIP) || 0;
        return currentConnections < 5; // Max 5 connections per IP
    }
    
    /**
     * Rate limiting for messages
     */
    checkMessageRateLimit(clientId) {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;
        
        if (!this.messageRateLimit.has(clientId)) {
            this.messageRateLimit.set(clientId, []);
        }
        
        const messages = this.messageRateLimit.get(clientId);
        
        // Remove old messages outside window
        const recentMessages = messages.filter(timestamp => timestamp > windowStart);
        
        if (recentMessages.length >= this.config.maxMessagesPerWindow) {
            return false;
        }
        
        // Add current message
        recentMessages.push(now);
        this.messageRateLimit.set(clientId, recentMessages);
        
        return true;
    }
    
    /**
     * Track connections per IP
     */
    trackConnection(clientIP) {
        const current = this.connectionCounts.get(clientIP) || 0;
        this.connectionCounts.set(clientIP, current + 1);
    }
    
    /**
     * Untrack connections per IP
     */
    untrackConnection(clientIP) {
        const current = this.connectionCounts.get(clientIP) || 0;
        if (current <= 1) {
            this.connectionCounts.delete(clientIP);
        } else {
            this.connectionCounts.set(clientIP, current - 1);
        }
    }
    
    /**
     * Start heartbeat to keep connections alive
     */
    startHeartbeat() {
        setInterval(() => {
            const now = new Date();
            const deadClients = [];
            
            this.clients.forEach((client, clientId) => {
                const timeSinceLastPing = now - client.lastPing;
                
                if (timeSinceLastPing > this.config.heartbeatInterval * 2) {
                    // Client hasn't responded to ping in 2 intervals, consider dead
                    deadClients.push(clientId);
                } else if (timeSinceLastPing > this.config.heartbeatInterval) {
                    // Send ping
                    if (client.ws.readyState === client.ws.OPEN) {
                        client.ws.ping();
                    }
                }
            });
            
            // Clean up dead clients
            deadClients.forEach(clientId => {
                this.handleClientDisconnect(clientId, 1000, 'Heartbeat timeout');
            });
            
        }, this.config.heartbeatInterval);
    }
    
    /**
     * Generate unique client ID
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get current statistics
     */
    getStats() {
        const channelStats = {};
        this.channels.forEach((subscribers, channel) => {
            channelStats[channel] = subscribers.size;
        });
        
        return {
            connectedClients: this.clients.size,
            totalConnections: Array.from(this.connectionCounts.values()).reduce((a, b) => a + b, 0),
            channels: channelStats,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
    
    /**
     * Data fetchers for different channels (to be implemented with actual data sources)
     */
    async getRateLimitData() {
        return {
            currentRequests: Math.floor(Math.random() * 100),
            blockedRequests: Math.floor(Math.random() * 10),
            algorithms: {
                sliding_window: Math.floor(Math.random() * 50),
                token_bucket: Math.floor(Math.random() * 30),
                fixed_window: Math.floor(Math.random() * 20)
            },
            alerts: []
        };
    }
    
    async getJobQueueData() {
        return {
            activeJobs: Math.floor(Math.random() * 5),
            completedJobs: Math.floor(Math.random() * 100),
            failedJobs: Math.floor(Math.random() * 3),
            queueDepth: Math.floor(Math.random() * 10)
        };
    }
    
    async getExecutiveData() {
        return {
            teamUpdates: Math.floor(Math.random() * 20),
            aiInsights: Math.floor(Math.random() * 5),
            criticalItems: Math.floor(Math.random() * 3),
            performanceScore: Math.floor(Math.random() * 40) + 60
        };
    }
    
    async getSystemHealthData() {
        return {
            cpu: Math.floor(Math.random() * 30) + 20,
            memory: Math.floor(Math.random() * 40) + 30,
            uptime: process.uptime(),
            status: 'healthy'
        };
    }
    
    async getTeamUpdatesData() {
        return {
            recentUpdates: [],
            activeMembers: Math.floor(Math.random() * 4) + 1,
            pendingTasks: Math.floor(Math.random() * 10)
        };
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.logger.info('Shutting down WebSocket server...');
        
        // Notify all clients
        this.clients.forEach((client, clientId) => {
            this.sendToClient(clientId, {
                type: 'server-shutdown',
                message: 'Server is shutting down',
                timestamp: new Date().toISOString()
            });
        });
        
        // Close all connections
        this.wss.clients.forEach(ws => {
            ws.close(1001, 'Server shutdown');
        });
        
        // Close server
        this.wss.close();
        
        this.logger.info('WebSocket server shutdown complete');
    }
}