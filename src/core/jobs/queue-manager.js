/**
 * BullMQ Job Queue Manager
 * Handles background job processing for Team CRM
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';
import { AIRetryHandler } from '../../utils/ai-retry-handler.js';

export class QueueManager {
    constructor(options = {}) {
        this.redisConfig = {
            host: options.redisHost || process.env.REDIS_HOST || 'localhost',
            port: options.redisPort || process.env.REDIS_PORT || 6379,
            password: options.redisPassword || process.env.REDIS_PASSWORD,
            db: options.redisDb || process.env.REDIS_DB || 0,
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            lazyConnect: true
        };
        
        this.connection = new Redis(this.redisConfig);
        this.queues = new Map();
        this.workers = new Map();
        this.queueEvents = new Map();
        this.isInitialized = false;
        
        this.logger = logger.child({ component: 'QueueManager' });
        this.aiRetryHandler = new AIRetryHandler();
        
        // Queue configurations
        this.queueConfigs = {
            'ai-processing': {
                name: 'ai-processing',
                concurrency: 3,
                defaultJobOptions: {
                    removeOnComplete: 50,
                    removeOnFail: 20,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000
                    }
                }
            },
            'executive-summaries': {
                name: 'executive-summaries',
                concurrency: 2,
                defaultJobOptions: {
                    removeOnComplete: 20,
                    removeOnFail: 10,
                    attempts: 2,
                    backoff: {
                        type: 'exponential',
                        delay: 5000
                    }
                }
            },
            'memory-processing': {
                name: 'memory-processing',
                concurrency: 5,
                defaultJobOptions: {
                    removeOnComplete: 100,
                    removeOnFail: 50,
                    attempts: 2,
                    backoff: {
                        type: 'fixed',
                        delay: 3000
                    }
                }
            },
            'notifications': {
                name: 'notifications',
                concurrency: 10,
                defaultJobOptions: {
                    removeOnComplete: 30,
                    removeOnFail: 10,
                    attempts: 3,
                    backoff: {
                        type: 'fixed',
                        delay: 1000
                    }
                }
            },
            'analytics': {
                name: 'analytics',
                concurrency: 2,
                defaultJobOptions: {
                    removeOnComplete: 100,
                    removeOnFail: 20,
                    attempts: 1 // Analytics failures shouldn't retry aggressively
                }
            }
        };
        
        this.stats = {
            queuesCreated: 0,
            workersStarted: 0,
            jobsProcessed: 0,
            jobsFailed: 0,
            totalProcessingTime: 0
        };
    }
    
    /**
     * Initialize the queue manager
     */
    async initialize() {
        try {
            this.logger.info('Initializing Queue Manager...');
            
            // Test Redis connection
            await this.connection.ping();
            this.logger.info('Redis connection established');
            
            // Create all queues
            await this.createQueues();
            
            // Setup queue monitoring
            this.setupQueueMonitoring();
            
            this.isInitialized = true;
            this.logger.info('Queue Manager initialized successfully', {
                queues: this.queues.size,
                workers: this.workers.size
            });
            
        } catch (error) {
            this.logger.error('Failed to initialize Queue Manager', { error });
            throw error;
        }
    }
    
    /**
     * Create all configured queues
     */
    async createQueues() {
        for (const [queueName, config] of Object.entries(this.queueConfigs)) {
            try {
                // Create queue
                const queue = new Queue(config.name, {
                    connection: this.redisConfig,
                    defaultJobOptions: config.defaultJobOptions
                });
                
                this.queues.set(queueName, queue);
                
                // Create queue events monitor
                const queueEvents = new QueueEvents(config.name, {
                    connection: this.redisConfig
                });
                
                this.queueEvents.set(queueName, queueEvents);
                this.stats.queuesCreated++;
                
                this.logger.info(`Queue created: ${queueName}`, {
                    concurrency: config.concurrency,
                    attempts: config.defaultJobOptions.attempts
                });
                
            } catch (error) {
                this.logger.error(`Failed to create queue: ${queueName}`, { error });
                throw error;
            }
        }
    }
    
    /**
     * Start workers for all queues
     */
    async startWorkers() {
        for (const [queueName, config] of Object.entries(this.queueConfigs)) {
            try {
                const worker = new Worker(
                    config.name,
                    this.getJobProcessor(queueName),
                    {
                        connection: this.redisConfig,
                        concurrency: config.concurrency
                    }
                );
                
                // Setup worker event handlers
                this.setupWorkerEvents(worker, queueName);
                
                this.workers.set(queueName, worker);
                this.stats.workersStarted++;
                
                this.logger.info(`Worker started for queue: ${queueName}`, {
                    concurrency: config.concurrency
                });
                
            } catch (error) {
                this.logger.error(`Failed to start worker for queue: ${queueName}`, { error });
                throw error;
            }
        }
    }
    
    /**
     * Get the appropriate job processor for a queue
     */
    getJobProcessor(queueName) {
        const processors = {
            'ai-processing': this.processAIJob.bind(this),
            'executive-summaries': this.processExecutiveSummaryJob.bind(this),
            'memory-processing': this.processMemoryJob.bind(this),
            'notifications': this.processNotificationJob.bind(this),
            'analytics': this.processAnalyticsJob.bind(this)
        };
        
        return processors[queueName] || this.processGenericJob.bind(this);
    }
    
    /**
     * Add a job to a specific queue
     */
    async addJob(queueName, jobType, data, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Queue Manager not initialized');
            }
            
            const queue = this.queues.get(queueName);
            if (!queue) {
                throw new Error(`Queue not found: ${queueName}`);
            }
            
            const job = await queue.add(jobType, {
                ...data,
                timestamp: new Date().toISOString(),
                jobId: `${queueName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }, {
                ...options,
                priority: options.priority || 0,
                delay: options.delay || 0
            });
            
            this.logger.info(`Job added to queue: ${queueName}`, {
                jobId: job.id,
                jobType,
                priority: options.priority || 0
            });
            
            return job;
            
        } catch (error) {
            this.logger.error(`Failed to add job to queue: ${queueName}`, { error, jobType });
            throw error;
        }
    }
    
    /**
     * Process AI-related jobs
     */
    async processAIJob(job) {
        const startTime = Date.now();
        
        try {
            this.logger.info(`Processing AI job: ${job.name}`, { jobId: job.id });
            
            const { jobType, data } = job.data;
            let result;
            
            switch (jobType) {
                case 'extract-update':
                    result = await this.processUpdateExtraction(data);
                    break;
                    
                case 'generate-insights':
                    result = await this.processInsightGeneration(data);
                    break;
                    
                case 'analyze-sentiment':
                    result = await this.processSentimentAnalysis(data);
                    break;
                    
                default:
                    throw new Error(`Unknown AI job type: ${jobType}`);
            }
            
            const processingTime = Date.now() - startTime;
            this.stats.jobsProcessed++;
            this.stats.totalProcessingTime += processingTime;
            
            this.logger.info(`AI job completed: ${job.name}`, {
                jobId: job.id,
                processingTime: `${processingTime}ms`
            });
            
            return result;
            
        } catch (error) {
            this.stats.jobsFailed++;
            this.logger.error(`AI job failed: ${job.name}`, {
                jobId: job.id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Process executive summary jobs
     */
    async processExecutiveSummaryJob(job) {
        try {
            this.logger.info(`Processing executive summary job: ${job.name}`, { jobId: job.id });
            
            const { updates, timeframe } = job.data;
            
            // Use AI retry handler for summary generation
            const result = await this.aiRetryHandler.executeWithRetry(async () => {
                // This would integrate with your existing master executive agent
                return await this.generateExecutiveSummary(updates, timeframe);
            });
            
            this.stats.jobsProcessed++;
            
            return {
                summary: result,
                generatedAt: new Date().toISOString(),
                updateCount: updates.length,
                timeframe
            };
            
        } catch (error) {
            this.stats.jobsFailed++;
            this.logger.error(`Executive summary job failed: ${job.name}`, {
                jobId: job.id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Process memory-related jobs
     */
    async processMemoryJob(job) {
        try {
            this.logger.info(`Processing memory job: ${job.name}`, { jobId: job.id });
            
            const { jobType, data } = job.data;
            let result;
            
            switch (jobType) {
                case 'store-interaction':
                    result = await this.storeInteraction(data);
                    break;
                    
                case 'analyze-patterns':
                    result = await this.analyzePatterns(data);
                    break;
                    
                case 'cleanup-old-data':
                    result = await this.cleanupOldData(data);
                    break;
                    
                default:
                    throw new Error(`Unknown memory job type: ${jobType}`);
            }
            
            this.stats.jobsProcessed++;
            return result;
            
        } catch (error) {
            this.stats.jobsFailed++;
            this.logger.error(`Memory job failed: ${job.name}`, {
                jobId: job.id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Process notification jobs
     */
    async processNotificationJob(job) {
        try {
            this.logger.info(`Processing notification job: ${job.name}`, { jobId: job.id });
            
            const { type, recipients, message, urgency } = job.data;
            
            // This would integrate with your notification system
            const result = await this.sendNotification({
                type,
                recipients,
                message,
                urgency,
                timestamp: new Date().toISOString()
            });
            
            this.stats.jobsProcessed++;
            return result;
            
        } catch (error) {
            this.stats.jobsFailed++;
            this.logger.error(`Notification job failed: ${job.name}`, {
                jobId: job.id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Process analytics jobs
     */
    async processAnalyticsJob(job) {
        try {
            this.logger.info(`Processing analytics job: ${job.name}`, { jobId: job.id });
            
            const { jobType, data } = job.data;
            let result;
            
            switch (jobType) {
                case 'generate-metrics':
                    result = await this.generateMetrics(data);
                    break;
                    
                case 'trend-analysis':
                    result = await this.performTrendAnalysis(data);
                    break;
                    
                case 'performance-report':
                    result = await this.generatePerformanceReport(data);
                    break;
                    
                default:
                    throw new Error(`Unknown analytics job type: ${jobType}`);
            }
            
            this.stats.jobsProcessed++;
            return result;
            
        } catch (error) {
            this.stats.jobsFailed++;
            this.logger.error(`Analytics job failed: ${job.name}`, {
                jobId: job.id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Process generic jobs
     */
    async processGenericJob(job) {
        try {
            this.logger.info(`Processing generic job: ${job.name}`, { jobId: job.id });
            
            // Basic job processing
            const result = {
                processed: true,
                timestamp: new Date().toISOString(),
                data: job.data
            };
            
            this.stats.jobsProcessed++;
            return result;
            
        } catch (error) {
            this.stats.jobsFailed++;
            this.logger.error(`Generic job failed: ${job.name}`, {
                jobId: job.id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Setup worker event handlers
     */
    setupWorkerEvents(worker, queueName) {
        worker.on('completed', (job, result) => {
            this.logger.debug(`Job completed in queue: ${queueName}`, {
                jobId: job.id,
                jobName: job.name
            });
        });
        
        worker.on('failed', (job, err) => {
            this.logger.error(`Job failed in queue: ${queueName}`, {
                jobId: job?.id,
                jobName: job?.name,
                error: err.message,
                attempts: job?.attemptsMade
            });
        });
        
        worker.on('progress', (job, progress) => {
            this.logger.debug(`Job progress in queue: ${queueName}`, {
                jobId: job.id,
                progress
            });
        });
        
        worker.on('error', (err) => {
            this.logger.error(`Worker error in queue: ${queueName}`, { error: err.message });
        });
    }
    
    /**
     * Setup queue monitoring
     */
    setupQueueMonitoring() {
        for (const [queueName, queueEvents] of this.queueEvents.entries()) {
            queueEvents.on('waiting', ({ jobId }) => {
                this.logger.debug(`Job waiting in queue: ${queueName}`, { jobId });
            });
            
            queueEvents.on('active', ({ jobId }) => {
                this.logger.debug(`Job active in queue: ${queueName}`, { jobId });
            });
            
            queueEvents.on('completed', ({ jobId, returnvalue }) => {
                this.logger.debug(`Job completed in queue: ${queueName}`, { jobId });
            });
            
            queueEvents.on('failed', ({ jobId, failedReason }) => {
                this.logger.warn(`Job failed in queue: ${queueName}`, {
                    jobId,
                    reason: failedReason
                });
            });
        }
    }
    
    /**
     * Get queue statistics
     */
    async getQueueStats() {
        const stats = {};
        
        for (const [queueName, queue] of this.queues.entries()) {
            try {
                const counts = await queue.getJobCounts();
                stats[queueName] = {
                    ...counts,
                    isPaused: await queue.isPaused()
                };
            } catch (error) {
                this.logger.error(`Failed to get stats for queue: ${queueName}`, { error });
                stats[queueName] = { error: error.message };
            }
        }
        
        return {
            queues: stats,
            manager: this.stats,
            redis: {
                status: this.connection.status,
                host: this.redisConfig.host,
                port: this.redisConfig.port
            }
        };
    }
    
    /**
     * Pause a specific queue
     */
    async pauseQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue not found: ${queueName}`);
        }
        
        await queue.pause();
        this.logger.info(`Queue paused: ${queueName}`);
    }
    
    /**
     * Resume a specific queue
     */
    async resumeQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue not found: ${queueName}`);
        }
        
        await queue.resume();
        this.logger.info(`Queue resumed: ${queueName}`);
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.logger.info('Shutting down Queue Manager...');
        
        // Close all workers
        for (const [queueName, worker] of this.workers.entries()) {
            try {
                await worker.close();
                this.logger.info(`Worker closed: ${queueName}`);
            } catch (error) {
                this.logger.error(`Error closing worker: ${queueName}`, { error });
            }
        }
        
        // Close all queue events
        for (const [queueName, queueEvents] of this.queueEvents.entries()) {
            try {
                await queueEvents.close();
                this.logger.info(`Queue events closed: ${queueName}`);
            } catch (error) {
                this.logger.error(`Error closing queue events: ${queueName}`, { error });
            }
        }
        
        // Close all queues
        for (const [queueName, queue] of this.queues.entries()) {
            try {
                await queue.close();
                this.logger.info(`Queue closed: ${queueName}`);
            } catch (error) {
                this.logger.error(`Error closing queue: ${queueName}`, { error });
            }
        }
        
        // Close Redis connection
        try {
            await this.connection.disconnect();
            this.logger.info('Redis connection closed');
        } catch (error) {
            this.logger.error('Error closing Redis connection', { error });
        }
        
        this.logger.info('Queue Manager shutdown complete');
    }
    
    // Placeholder methods for actual job processing logic
    // These would integrate with your existing Team CRM components
    
    async processUpdateExtraction(data) {
        // Integrate with EnhancedPersonalAssistant
        return { extracted: true, data };
    }
    
    async processInsightGeneration(data) {
        // Integrate with AI Intelligence Engine
        return { insights: [], data };
    }
    
    async processSentimentAnalysis(data) {
        // Sentiment analysis logic
        return { sentiment: 'neutral', confidence: 0.8 };
    }
    
    async generateExecutiveSummary(updates, timeframe) {
        // Integrate with Master Executive Agent
        return { summary: 'Executive summary', updates: updates.length };
    }
    
    async storeInteraction(data) {
        // Integrate with Memory System
        return { stored: true, id: data.id };
    }
    
    async analyzePatterns(data) {
        // Pattern analysis logic
        return { patterns: [], analyzed: true };
    }
    
    async cleanupOldData(data) {
        // Data cleanup logic
        return { cleaned: 0, retention: data.retentionDays };
    }
    
    async sendNotification(data) {
        // Notification sending logic
        return { sent: true, recipients: data.recipients.length };
    }
    
    async generateMetrics(data) {
        // Metrics generation logic
        return { metrics: {}, period: data.period };
    }
    
    async performTrendAnalysis(data) {
        // Trend analysis logic
        return { trends: [], period: data.period };
    }
    
    async generatePerformanceReport(data) {
        // Performance report logic
        return { report: {}, generated: true };
    }
}