/**
 * Job Queue Integration for Team CRM
 * Integrates BullMQ background processing with existing Team CRM workflow
 */

import { QueueManager } from './queue-manager.js';
import { AIProcessingWorker } from './ai-processing-worker.js';
import { logger } from '../../utils/logger.js';

export class JobIntegration {
    constructor(teamOrchestrator, config) {
        this.orchestrator = teamOrchestrator;
        this.config = config;
        this.queueManager = null;
        this.aiWorker = null;
        this.isInitialized = false;
        this.logger = logger.child({ component: 'JobIntegration' });
        
        this.jobCallbacks = new Map();
        this.processingStats = {
            totalJobsQueued: 0,
            totalJobsCompleted: 0,
            totalJobsFailed: 0,
            averageProcessingTime: 0
        };
    }
    
    /**
     * Initialize job integration
     */
    async initialize() {
        try {
            this.logger.info('Initializing Job Integration...');
            
            // Initialize queue manager
            this.queueManager = new QueueManager({
                redisHost: process.env.REDIS_HOST,
                redisPort: process.env.REDIS_PORT,
                redisPassword: process.env.REDIS_PASSWORD
            });
            
            await this.queueManager.initialize();
            await this.queueManager.startWorkers();
            
            // Initialize AI processing worker
            this.aiWorker = new AIProcessingWorker(
                this.orchestrator.aiProvider,
                this.orchestrator.memorySystem
            );
            
            await this.aiWorker.initialize(this.config);
            
            // Setup job event handlers
            this.setupJobEventHandlers();
            
            this.isInitialized = true;
            this.logger.info('Job Integration initialized successfully');
            
        } catch (error) {
            this.logger.error('Failed to initialize Job Integration', { error });
            throw error;
        }
    }
    
    /**
     * Process team update asynchronously
     */
    async processTeamUpdateAsync(memberName, updateText, metadata = {}, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Job Integration not initialized');
            }
            
            const jobId = `update-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Queue the AI processing job
            const job = await this.queueManager.addJob('ai-processing', 'extract-update', {
                memberName,
                updateText,
                metadata,
                requestId: jobId
            }, {
                priority: options.urgent ? 10 : 5,
                delay: options.delay || 0
            });
            
            this.processingStats.totalJobsQueued++;
            
            this.logger.info('Team update queued for processing', {
                jobId: job.id,
                member: memberName,
                textLength: updateText.length,
                priority: options.urgent ? 'high' : 'normal'
            });
            
            // Return immediate response
            return {
                success: true,
                jobId: job.id,
                requestId: jobId,
                message: 'Update queued for AI processing',
                estimatedProcessingTime: '30-60 seconds',
                status: 'queued'
            };
            
        } catch (error) {
            this.logger.error('Failed to queue team update', {
                member: memberName,
                error: error.message
            });
            
            // Fallback to synchronous processing
            return await this.orchestrator.processTeamUpdate(memberName, updateText, metadata);
        }
    }
    
    /**
     * Generate executive summary asynchronously
     */
    async generateExecutiveSummaryAsync(updates, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Job Integration not initialized');
            }
            
            const jobId = `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Queue the summary generation job
            const job = await this.queueManager.addJob('executive-summaries', 'generate-summary', {
                updates,
                timeframe: options.timeframe || '24h',
                includeTrends: options.includeTrends !== false,
                includeMetrics: options.includeMetrics !== false,
                requestId: jobId
            }, {
                priority: options.urgent ? 10 : 3,
                delay: options.delay || 0
            });
            
            this.processingStats.totalJobsQueued++;
            
            this.logger.info('Executive summary queued for generation', {
                jobId: job.id,
                updateCount: updates.length,
                timeframe: options.timeframe
            });
            
            return {
                success: true,
                jobId: job.id,
                requestId: jobId,
                message: 'Executive summary queued for generation',
                estimatedProcessingTime: '60-120 seconds',
                status: 'queued'
            };
            
        } catch (error) {
            this.logger.error('Failed to queue executive summary', { error: error.message });
            
            // Fallback to synchronous processing
            return await this.orchestrator.generateExecutiveSummary();
        }
    }
    
    /**
     * Process insights generation asynchronously
     */
    async generateInsightsAsync(data, analysisType, context = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Job Integration not initialized');
            }
            
            const jobId = `insights-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Queue the insights generation job
            const job = await this.queueManager.addJob('ai-processing', 'generate-insights', {
                data,
                analysisType,
                context,
                requestId: jobId
            }, {
                priority: 3,
                delay: 0
            });
            
            this.processingStats.totalJobsQueued++;
            
            this.logger.info('Insights generation queued', {
                jobId: job.id,
                analysisType,
                dataSize: Array.isArray(data) ? data.length : 'single'
            });
            
            return {
                success: true,
                jobId: job.id,
                requestId: jobId,
                message: 'Insights generation queued',
                analysisType,
                status: 'queued'
            };
            
        } catch (error) {
            this.logger.error('Failed to queue insights generation', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Process sentiment analysis asynchronously
     */
    async analyzeSentimentAsync(texts, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Job Integration not initialized');
            }
            
            const jobId = `sentiment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Queue the sentiment analysis job
            const job = await this.queueManager.addJob('ai-processing', 'analyze-sentiment', {
                texts,
                options,
                requestId: jobId
            }, {
                priority: 5,
                delay: 0
            });
            
            this.processingStats.totalJobsQueued++;
            
            const textCount = Array.isArray(texts) ? texts.length : 1;
            this.logger.info('Sentiment analysis queued', {
                jobId: job.id,
                textCount
            });
            
            return {
                success: true,
                jobId: job.id,
                requestId: jobId,
                message: 'Sentiment analysis queued',
                textCount,
                status: 'queued'
            };
            
        } catch (error) {
            this.logger.error('Failed to queue sentiment analysis', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Schedule memory processing
     */
    async scheduleMemoryProcessing(type, data, options = {}) {
        try {
            if (!this.isInitialized) {
                return false;
            }
            
            const job = await this.queueManager.addJob('memory-processing', type, data, {
                priority: 1, // Low priority for background tasks
                delay: options.delay || 0
            });
            
            this.logger.debug('Memory processing scheduled', {
                jobId: job.id,
                type,
                delay: options.delay
            });
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to schedule memory processing', { error: error.message });
            return false;
        }
    }
    
    /**
     * Schedule analytics processing
     */
    async scheduleAnalyticsProcessing(type, data, options = {}) {
        try {
            if (!this.isInitialized) {
                return false;
            }
            
            const job = await this.queueManager.addJob('analytics', type, data, {
                priority: 2,
                delay: options.delay || 0
            });
            
            this.logger.debug('Analytics processing scheduled', {
                jobId: job.id,
                type,
                delay: options.delay
            });
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to schedule analytics processing', { error: error.message });
            return false;
        }
    }
    
    /**
     * Send notification asynchronously
     */
    async sendNotificationAsync(type, recipients, message, urgency = 'medium') {
        try {
            if (!this.isInitialized) {
                return false;
            }
            
            const priority = urgency === 'high' ? 10 : urgency === 'medium' ? 5 : 1;
            
            const job = await this.queueManager.addJob('notifications', 'send-notification', {
                type,
                recipients,
                message,
                urgency
            }, {
                priority,
                delay: 0
            });
            
            this.logger.info('Notification queued', {
                jobId: job.id,
                type,
                recipients: recipients.length,
                urgency
            });
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to queue notification', { error: error.message });
            return false;
        }
    }
    
    /**
     * Register callback for job completion
     */
    registerJobCallback(requestId, callback) {
        this.jobCallbacks.set(requestId, callback);
    }
    
    /**
     * Setup job event handlers
     */
    setupJobEventHandlers() {
        // Override queue manager job processors to integrate with our workflow
        this.queueManager.processUpdateExtraction = async (data) => {
            return await this.aiWorker.processUpdateExtraction(data);
        };
        
        this.queueManager.processExecutiveSummaryJob = async (job) => {
            return await this.aiWorker.processExecutiveSummaryGeneration(job.data);
        };
        
        this.queueManager.generateExecutiveSummary = async (updates, timeframe) => {
            // Integrate with your existing master agent
            if (this.orchestrator.masterAgent) {
                return await this.orchestrator.masterAgent.generateComprehensiveSummary(updates, { timeframe });
            }
            return { summary: 'Executive summary generation not available', fallback: true };
        };
        
        this.queueManager.storeInteraction = async (data) => {
            // Integrate with memory system
            if (this.orchestrator.memorySystem && this.orchestrator.memorySystem.enabled) {
                return await this.orchestrator.memorySystem.storeInteraction(data);
            }
            return { stored: false, reason: 'Memory system not available' };
        };
        
        this.queueManager.sendNotification = async (data) => {
            // Integrate with notification system
            if (this.orchestrator.notificationSystem) {
                return await this.orchestrator.notificationSystem.sendNotification(data);
            }
            return { sent: false, reason: 'Notification system not available' };
        };
    }
    
    /**
     * Handle job completion events
     */
    handleJobCompletion(jobId, result, requestId) {
        this.processingStats.totalJobsCompleted++;
        
        // Execute callback if registered
        const callback = this.jobCallbacks.get(requestId);
        if (callback) {
            try {
                callback(result);
                this.jobCallbacks.delete(requestId);
            } catch (error) {
                this.logger.error('Job callback failed', { requestId, error: error.message });
            }
        }
        
        // Emit completion event for real-time updates
        if (this.orchestrator.emit) {
            this.orchestrator.emit('job:completed', {
                jobId,
                requestId,
                result,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle job failure events
     */
    handleJobFailure(jobId, error, requestId) {
        this.processingStats.totalJobsFailed++;
        
        this.logger.error('Job failed', { jobId, requestId, error });
        
        // Execute callback with error if registered
        const callback = this.jobCallbacks.get(requestId);
        if (callback) {
            try {
                callback(null, error);
                this.jobCallbacks.delete(requestId);
            } catch (callbackError) {
                this.logger.error('Job failure callback failed', { requestId, error: callbackError.message });
            }
        }
        
        // Emit failure event for real-time updates
        if (this.orchestrator.emit) {
            this.orchestrator.emit('job:failed', {
                jobId,
                requestId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Get job processing statistics
     */
    getStats() {
        return {
            processing: this.processingStats,
            queues: this.queueManager ? this.queueManager.getQueueStats() : null,
            aiWorker: this.aiWorker ? this.aiWorker.getStats() : null,
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Get job status
     */
    async getJobStatus(jobId) {
        try {
            if (!this.queueManager) {
                return { error: 'Queue manager not available' };
            }
            
            // Check all queues for the job
            for (const [queueName, queue] of this.queueManager.queues.entries()) {
                try {
                    const job = await queue.getJob(jobId);
                    if (job) {
                        return {
                            id: job.id,
                            name: job.name,
                            queue: queueName,
                            status: await job.getState(),
                            progress: job.progress,
                            data: job.data,
                            createdAt: new Date(job.timestamp).toISOString(),
                            processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
                            finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
                            attemptsMade: job.attemptsMade,
                            failedReason: job.failedReason
                        };
                    }
                } catch (error) {
                    // Continue checking other queues
                }
            }
            
            return { error: 'Job not found' };
            
        } catch (error) {
            this.logger.error('Failed to get job status', { jobId, error: error.message });
            return { error: error.message };
        }
    }
    
    /**
     * Cancel a job
     */
    async cancelJob(jobId) {
        try {
            if (!this.queueManager) {
                return false;
            }
            
            // Check all queues for the job
            for (const [queueName, queue] of this.queueManager.queues.entries()) {
                try {
                    const job = await queue.getJob(jobId);
                    if (job) {
                        await job.remove();
                        this.logger.info('Job cancelled', { jobId, queue: queueName });
                        return true;
                    }
                } catch (error) {
                    // Continue checking other queues
                }
            }
            
            return false;
            
        } catch (error) {
            this.logger.error('Failed to cancel job', { jobId, error: error.message });
            return false;
        }
    }
    
    /**
     * Pause job processing
     */
    async pauseProcessing(queueName = null) {
        try {
            if (!this.queueManager) {
                return false;
            }
            
            if (queueName) {
                await this.queueManager.pauseQueue(queueName);
                this.logger.info(`Queue paused: ${queueName}`);
            } else {
                // Pause all queues
                for (const [name] of this.queueManager.queues.entries()) {
                    await this.queueManager.pauseQueue(name);
                }
                this.logger.info('All queues paused');
            }
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to pause processing', { queueName, error: error.message });
            return false;
        }
    }
    
    /**
     * Resume job processing
     */
    async resumeProcessing(queueName = null) {
        try {
            if (!this.queueManager) {
                return false;
            }
            
            if (queueName) {
                await this.queueManager.resumeQueue(queueName);
                this.logger.info(`Queue resumed: ${queueName}`);
            } else {
                // Resume all queues
                for (const [name] of this.queueManager.queues.entries()) {
                    await this.queueManager.resumeQueue(name);
                }
                this.logger.info('All queues resumed');
            }
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to resume processing', { queueName, error: error.message });
            return false;
        }
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Job Integration...');
            
            if (this.queueManager) {
                await this.queueManager.shutdown();
            }
            
            this.isInitialized = false;
            this.logger.info('Job Integration shutdown complete');
            
        } catch (error) {
            this.logger.error('Error during Job Integration shutdown', { error });
        }
    }
}