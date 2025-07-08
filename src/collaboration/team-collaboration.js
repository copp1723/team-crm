/**
 * Team Collaboration System
 * Real-time team communication and collaboration features
 */

import { logger } from '../utils/logger.js';

export class TeamCollaboration {
    constructor(realtimeManager, contextAwareAI, config = {}) {
        this.realtimeManager = realtimeManager;
        this.contextAwareAI = contextAwareAI;
        this.config = {
            maxMessageHistory: config.maxMessageHistory || 1000,
            messageRetentionDays: config.messageRetentionDays || 30,
            enableAIModeration: config.enableAIModeration !== false,
            enableSmartSuggestions: config.enableSmartSuggestions !== false,
            ...config
        };
        
        this.logger = logger.child({ component: 'TeamCollaboration' });
        
        // Collaboration data
        this.activeRooms = new Map();
        this.messageHistory = new Map();
        this.userPresence = new Map();
        this.typingIndicators = new Map();
        
        // Room types
        this.roomTypes = {
            GENERAL: 'general',
            PROJECT: 'project',
            EXECUTIVE: 'executive',
            DIRECT: 'direct_message',
            AI_CHAT: 'ai_chat'
        };
        
        // Statistics
        this.stats = {
            messagesExchanged: 0,
            roomsCreated: 0,
            activeUsers: 0,
            aiInteractions: 0
        };
        
        this.initializeDefaultRooms();
    }
    
    /**
     * Initialize default collaboration rooms
     */
    initializeDefaultRooms() {
        // General team room
        this.createRoom('general', {
            name: 'General Team Chat',
            type: this.roomTypes.GENERAL,
            description: 'Main team communication channel',
            public: true,
            persistent: true
        });
        
        // Executive room
        this.createRoom('executive', {
            name: 'Executive Communications',
            type: this.roomTypes.EXECUTIVE,
            description: 'Executive and leadership discussions',
            public: false,
            persistent: true,
            requiresRole: 'executive'
        });
        
        // AI Assistant room
        this.createRoom('ai-assistant', {
            name: 'AI Assistant',
            type: this.roomTypes.AI_CHAT,
            description: 'Chat with the team AI assistant',
            public: true,
            persistent: true,
            aiEnabled: true
        });
        
        this.logger.info('Default collaboration rooms initialized');
    }
    
    /**
     * Create a new collaboration room
     */
    createRoom(roomId, options = {}) {
        const room = {
            id: roomId,
            name: options.name || roomId,
            type: options.type || this.roomTypes.GENERAL,
            description: options.description || '',
            createdAt: Date.now(),
            createdBy: options.createdBy || 'system',
            
            // Room settings
            public: options.public !== false,
            persistent: options.persistent !== false,
            maxMembers: options.maxMembers || 50,
            requiresRole: options.requiresRole || null,
            
            // Features
            aiEnabled: options.aiEnabled || false,
            fileSharing: options.fileSharing !== false,
            threadSupport: options.threadSupport !== false,
            
            // State
            members: new Set(),
            activeMembers: new Set(),
            messageCount: 0,
            lastActivity: Date.now()
        };
        
        this.activeRooms.set(roomId, room);
        this.messageHistory.set(roomId, []);
        this.stats.roomsCreated++;
        
        this.logger.info('Created collaboration room', { roomId, type: room.type });
        
        // Broadcast room creation
        if (this.realtimeManager) {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'room_created',
                room: this.sanitizeRoomForBroadcast(room)
            });
        }
        
        return room;
    }
    
    /**
     * Join a collaboration room
     */
    async joinRoom(roomId, userId, userInfo = {}) {
        const room = this.activeRooms.get(roomId);
        if (!room) {
            throw new Error(`Room ${roomId} not found`);
        }
        
        // Check permissions
        if (room.requiresRole && userInfo.role !== room.requiresRole) {
            throw new Error(`Access denied. Room requires role: ${room.requiresRole}`);
        }
        
        if (room.members.size >= room.maxMembers) {
            throw new Error('Room is at maximum capacity');
        }
        
        // Add user to room
        room.members.add(userId);
        room.activeMembers.add(userId);
        room.lastActivity = Date.now();
        
        // Update user presence
        this.userPresence.set(userId, {
            currentRoom: roomId,
            joinedAt: Date.now(),
            userInfo
        });
        
        this.logger.info('User joined room', { userId, roomId });
        
        // Broadcast join event
        if (this.realtimeManager) {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'user_joined',
                roomId,
                userId,
                userInfo: this.sanitizeUserInfo(userInfo),
                timestamp: Date.now()
            });
        }
        
        // Send room history to user
        await this.sendRoomHistory(roomId, userId);
        
        return room;
    }
    
    /**
     * Leave a collaboration room
     */
    async leaveRoom(roomId, userId) {
        const room = this.activeRooms.get(roomId);
        if (!room) {
            return false;
        }
        
        room.activeMembers.delete(userId);
        
        // Remove from permanent membership if not persistent
        if (!room.persistent) {
            room.members.delete(userId);
        }
        
        // Update user presence
        const presence = this.userPresence.get(userId);
        if (presence && presence.currentRoom === roomId) {
            this.userPresence.delete(userId);
        }
        
        this.logger.info('User left room', { userId, roomId });
        
        // Broadcast leave event
        if (this.realtimeManager) {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'user_left',
                roomId,
                userId,
                timestamp: Date.now()
            });
        }
        
        return true;
    }
    
    /**
     * Send a message to a room
     */
    async sendMessage(roomId, userId, messageContent, options = {}) {
        const room = this.activeRooms.get(roomId);
        if (!room) {
            throw new Error(`Room ${roomId} not found`);
        }
        
        if (!room.activeMembers.has(userId) && !room.members.has(userId)) {
            throw new Error('User not a member of this room');
        }
        
        const message = {
            id: this.generateMessageId(),
            roomId,
            userId,
            content: messageContent,
            timestamp: Date.now(),
            type: options.type || 'text',
            metadata: options.metadata || {},
            
            // Message features
            threadId: options.threadId || null,
            replyTo: options.replyTo || null,
            edited: false,
            editHistory: [],
            
            // AI features
            aiProcessed: false,
            aiResponse: null,
            sentiment: null
        };
        
        // AI moderation and processing
        if (this.config.enableAIModeration || room.aiEnabled) {
            await this.processMessageWithAI(message, room);
        }
        
        // Store message
        const roomHistory = this.messageHistory.get(roomId);
        roomHistory.push(message);
        
        // Trim history if too long
        if (roomHistory.length > this.config.maxMessageHistory) {
            roomHistory.splice(0, roomHistory.length - this.config.maxMessageHistory);
        }
        
        // Update room stats
        room.messageCount++;
        room.lastActivity = Date.now();
        this.stats.messagesExchanged++;
        
        this.logger.debug('Message sent', { 
            roomId, 
            userId, 
            messageId: message.id,
            type: message.type 
        });
        
        // Broadcast message
        if (this.realtimeManager) {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'message',
                message: this.sanitizeMessageForBroadcast(message)
            });
        }
        
        // Handle AI responses for AI-enabled rooms
        if (room.aiEnabled && this.contextAwareAI) {
            await this.handleAIResponse(message, room);
        }
        
        return message;
    }
    
    /**
     * Process message with AI for moderation and analysis
     */
    async processMessageWithAI(message, room) {
        try {
            if (!this.contextAwareAI) return;
            
            // Analyze sentiment
            message.sentiment = await this.contextAwareAI.analyzeSentiment(message.content);
            
            // Check for escalation signals
            const escalationSignals = await this.contextAwareAI.detectEscalationSignals(message.content);
            if (escalationSignals.length > 0) {
                message.metadata.escalationSignals = escalationSignals;
                
                // Notify executives if needed
                if (escalationSignals.some(signal => ['urgent', 'critical', 'escalate'].includes(signal))) {
                    await this.notifyExecutives(message, room);
                }
            }
            
            // Extract topics and entities
            message.metadata.topics = await this.contextAwareAI.extractTopics(message.content);
            message.metadata.entities = await this.contextAwareAI.extractEntities(message.content);
            
            message.aiProcessed = true;
            
        } catch (error) {
            this.logger.warn('AI message processing failed', { error, messageId: message.id });
        }
    }
    
    /**
     * Handle AI responses in AI-enabled rooms
     */
    async handleAIResponse(userMessage, room) {
        try {
            if (!this.contextAwareAI) return;
            
            this.stats.aiInteractions++;
            
            // Generate context-aware response
            const aiResponse = await this.contextAwareAI.generateResponse(userMessage.content, {
                memberName: userMessage.userId,
                conversationId: `room_${room.id}`,
                sessionId: `session_${Date.now()}`,
                urgency: userMessage.metadata.escalationSignals?.length > 0 ? 'high' : 'normal',
                metadata: {
                    roomContext: {
                        roomId: room.id,
                        roomType: room.type,
                        recentMessages: this.getRecentMessages(room.id, 5)
                    }
                }
            });
            
            // Send AI response as a message
            const aiMessage = {
                id: this.generateMessageId(),
                roomId: room.id,
                userId: 'ai-assistant',
                content: aiResponse.response,
                timestamp: Date.now(),
                type: 'ai_response',
                metadata: {
                    replyTo: userMessage.id,
                    confidence: aiResponse.confidence || 0.8,
                    followUpSuggestions: aiResponse.followUpSuggestions || [],
                    escalationRecommendations: aiResponse.escalationRecommendations || []
                },
                aiProcessed: true,
                aiResponse: aiResponse
            };
            
            // Store AI message
            const roomHistory = this.messageHistory.get(room.id);
            roomHistory.push(aiMessage);
            
            // Broadcast AI response
            if (this.realtimeManager) {
                this.realtimeManager.broadcastToChannel('collaboration', {
                    type: 'message',
                    message: this.sanitizeMessageForBroadcast(aiMessage)
                });
            }
            
            this.logger.debug('AI response generated', { 
                roomId: room.id, 
                originalMessageId: userMessage.id,
                aiMessageId: aiMessage.id 
            });
            
        } catch (error) {
            this.logger.error('AI response generation failed', { error, roomId: room.id });
        }
    }
    
    /**
     * Start typing indicator
     */
    startTyping(roomId, userId) {
        const typingKey = `${roomId}:${userId}`;
        const typingInfo = {
            roomId,
            userId,
            startedAt: Date.now()
        };
        
        this.typingIndicators.set(typingKey, typingInfo);
        
        // Broadcast typing indicator
        if (this.realtimeManager) {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'typing_start',
                roomId,
                userId,
                timestamp: Date.now()
            });
        }
        
        // Auto-stop typing after 5 seconds
        setTimeout(() => {
            if (this.typingIndicators.has(typingKey)) {
                this.stopTyping(roomId, userId);
            }
        }, 5000);
    }
    
    /**
     * Stop typing indicator
     */
    stopTyping(roomId, userId) {
        const typingKey = `${roomId}:${userId}`;
        this.typingIndicators.delete(typingKey);
        
        // Broadcast stop typing
        if (this.realtimeManager) {
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'typing_stop',
                roomId,
                userId,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Get room history
     */
    getRoomHistory(roomId, limit = 50, offset = 0) {
        const history = this.messageHistory.get(roomId) || [];
        return history.slice(offset, offset + limit).map(msg => this.sanitizeMessageForBroadcast(msg));
    }
    
    /**
     * Get recent messages for context
     */
    getRecentMessages(roomId, limit = 10) {
        const history = this.messageHistory.get(roomId) || [];
        return history.slice(-limit).map(msg => ({
            userId: msg.userId,
            content: msg.content,
            timestamp: msg.timestamp
        }));
    }
    
    /**
     * Send room history to user
     */
    async sendRoomHistory(roomId, userId) {
        const history = this.getRoomHistory(roomId, 20);
        
        if (this.realtimeManager) {
            // Send directly to the specific user (would need enhancement to realtime manager)
            this.realtimeManager.broadcastToChannel('collaboration', {
                type: 'room_history',
                roomId,
                targetUserId: userId,
                messages: history
            });
        }
    }
    
    /**
     * Get list of available rooms for a user
     */
    getAvailableRooms(userInfo = {}) {
        const rooms = [];
        
        for (const [roomId, room] of this.activeRooms) {
            // Check if user can access this room
            if (!room.public && room.requiresRole && userInfo.role !== room.requiresRole) {
                continue;
            }
            
            rooms.push({
                id: room.id,
                name: room.name,
                type: room.type,
                description: room.description,
                memberCount: room.members.size,
                activeMemberCount: room.activeMembers.size,
                lastActivity: room.lastActivity,
                messageCount: room.messageCount,
                aiEnabled: room.aiEnabled
            });
        }
        
        return rooms.sort((a, b) => b.lastActivity - a.lastActivity);
    }
    
    /**
     * Get active users in a room
     */
    getRoomMembers(roomId) {
        const room = this.activeRooms.get(roomId);
        if (!room) return [];
        
        const members = [];
        for (const userId of room.activeMembers) {
            const presence = this.userPresence.get(userId);
            members.push({
                userId,
                joinedAt: presence?.joinedAt,
                userInfo: presence?.userInfo ? this.sanitizeUserInfo(presence.userInfo) : {}
            });
        }
        
        return members;
    }
    
    /**
     * Notify executives of escalation
     */
    async notifyExecutives(message, room) {
        try {
            const executiveRoom = this.activeRooms.get('executive');
            if (!executiveRoom) return;
            
            const escalationMessage = {
                id: this.generateMessageId(),
                roomId: 'executive',
                userId: 'system',
                content: `🚨 Escalation detected in ${room.name}: "${message.content.substring(0, 100)}..."`,
                timestamp: Date.now(),
                type: 'escalation_alert',
                metadata: {
                    originalMessage: message.id,
                    originalRoom: room.id,
                    escalationSignals: message.metadata.escalationSignals
                }
            };
            
            const executiveHistory = this.messageHistory.get('executive');
            executiveHistory.push(escalationMessage);
            
            // Broadcast to executives
            if (this.realtimeManager) {
                this.realtimeManager.broadcastToChannel('collaboration', {
                    type: 'escalation_alert',
                    message: this.sanitizeMessageForBroadcast(escalationMessage)
                });
            }
            
            this.logger.info('Executive escalation sent', { 
                originalMessageId: message.id, 
                roomId: room.id 
            });
            
        } catch (error) {
            this.logger.error('Failed to notify executives', { error });
        }
    }
    
    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Sanitize room data for broadcasting
     */
    sanitizeRoomForBroadcast(room) {
        return {
            id: room.id,
            name: room.name,
            type: room.type,
            description: room.description,
            memberCount: room.members.size,
            activeMemberCount: room.activeMembers.size,
            lastActivity: room.lastActivity,
            aiEnabled: room.aiEnabled
        };
    }
    
    /**
     * Sanitize message for broadcasting
     */
    sanitizeMessageForBroadcast(message) {
        return {
            id: message.id,
            roomId: message.roomId,
            userId: message.userId,
            content: message.content,
            timestamp: message.timestamp,
            type: message.type,
            sentiment: message.sentiment,
            metadata: {
                topics: message.metadata.topics,
                replyTo: message.replyTo,
                threadId: message.threadId,
                escalationSignals: message.metadata.escalationSignals,
                followUpSuggestions: message.metadata.followUpSuggestions?.slice(0, 3) // Limit suggestions
            }
        };
    }
    
    /**
     * Sanitize user info for broadcasting
     */
    sanitizeUserInfo(userInfo) {
        return {
            name: userInfo.name,
            role: userInfo.role,
            avatar: userInfo.avatar
        };
    }
    
    /**
     * Get collaboration statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeRooms: this.activeRooms.size,
            activeUsers: this.userPresence.size,
            typingUsers: this.typingIndicators.size,
            totalMessages: Array.from(this.messageHistory.values())
                .reduce((total, history) => total + history.length, 0)
        };
    }
    
    /**
     * Cleanup old messages and inactive users
     */
    cleanup() {
        const now = Date.now();
        const retentionMs = this.config.messageRetentionDays * 24 * 60 * 60 * 1000;
        
        // Clean up old messages
        for (const [roomId, history] of this.messageHistory) {
            const cutoffTime = now - retentionMs;
            const filteredHistory = history.filter(msg => msg.timestamp > cutoffTime);
            this.messageHistory.set(roomId, filteredHistory);
        }
        
        // Clean up old typing indicators
        for (const [key, typing] of this.typingIndicators) {
            if (now - typing.startedAt > 10000) { // 10 seconds
                this.typingIndicators.delete(key);
            }
        }
        
        this.logger.debug('Collaboration cleanup completed');
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Team Collaboration...');
            
            // Clean up data
            this.activeRooms.clear();
            this.messageHistory.clear();
            this.userPresence.clear();
            this.typingIndicators.clear();
            
            this.logger.info('Team Collaboration shutdown complete');
        } catch (error) {
            this.logger.error('Error during Team Collaboration shutdown', { error });
        }
    }
}