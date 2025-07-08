/**
 * Enhanced Logger with Monitoring
 * Provides structured logging and system monitoring
 */

export class Logger {
    constructor(options = {}) {
        this.serviceName = options.serviceName || 'team-crm';
        this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
        this.includeTimestamp = options.includeTimestamp !== false;
        this.includeLevel = options.includeLevel !== false;
        this.colorize = options.colorize !== false && process.stdout.isTTY;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };
        
        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[35m', // Magenta
            trace: '\x1b[37m', // White
            reset: '\x1b[0m'
        };
        
        this.metrics = {
            logsWritten: 0,
            errorCount: 0,
            warnCount: 0,
            infoCount: 0,
            debugCount: 0,
            startTime: new Date(),
            lastError: null
        };
        
        // Buffer for recent logs (useful for debugging)
        this.recentLogs = [];
        this.maxRecentLogs = 100;
    }
    
    /**
     * Log an error message
     */
    error(message, meta = {}) {
        this.log('error', message, meta);
        this.metrics.errorCount++;
        this.metrics.lastError = { message, meta, timestamp: new Date() };
    }
    
    /**
     * Log a warning message
     */
    warn(message, meta = {}) {
        this.log('warn', message, meta);
        this.metrics.warnCount++;
    }
    
    /**
     * Log an info message
     */
    info(message, meta = {}) {
        this.log('info', message, meta);
        this.metrics.infoCount++;
    }
    
    /**
     * Log a debug message
     */
    debug(message, meta = {}) {
        this.log('debug', message, meta);
        this.metrics.debugCount++;
    }
    
    /**
     * Log a trace message
     */
    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }
    
    /**
     * Core logging function
     */
    log(level, message, meta = {}) {
        if (this.levels[level] > this.levels[this.logLevel]) {
            return; // Skip if below log level
        }
        
        const logEntry = this.formatLogEntry(level, message, meta);
        
        // Store in recent logs buffer
        this.recentLogs.push({
            timestamp: new Date(),
            level,
            message,
            meta: { ...meta }
        });
        
        // Keep buffer size manageable
        if (this.recentLogs.length > this.maxRecentLogs) {
            this.recentLogs.shift();
        }
        
        // Output to console
        if (level === 'error') {
            console.error(logEntry);
        } else if (level === 'warn') {
            console.warn(logEntry);
        } else {
            console.log(logEntry);
        }
        
        this.metrics.logsWritten++;
    }
    
    /**
     * Format log entry for output
     */
    formatLogEntry(level, message, meta) {
        let parts = [];
        
        // Timestamp
        if (this.includeTimestamp) {
            parts.push(`[${new Date().toISOString()}]`);
        }
        
        // Service name
        parts.push(`[${this.serviceName}]`);
        
        // Level
        if (this.includeLevel) {
            const levelStr = this.colorize 
                ? `${this.colors[level]}${level.toUpperCase()}${this.colors.reset}`
                : level.toUpperCase();
            parts.push(`[${levelStr}]`);
        }
        
        // Message
        parts.push(message);
        
        // Meta data
        if (Object.keys(meta).length > 0) {
            const metaStr = this.formatMeta(meta);
            parts.push(metaStr);
        }
        
        return parts.join(' ');
    }
    
    /**
     * Format metadata for logging
     */
    formatMeta(meta) {
        try {
            // Handle error objects specially
            if (meta.error instanceof Error) {
                meta.error = {
                    name: meta.error.name,
                    message: meta.error.message,
                    stack: meta.error.stack
                };
            }
            
            return JSON.stringify(meta, null, 0);
        } catch (error) {
            return '[Meta serialization failed]';
        }
    }
    
    /**
     * Create a child logger with additional context
     */
    child(additionalMeta = {}) {
        return new ChildLogger(this, additionalMeta);
    }
    
    /**
     * Get logger metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime.getTime(),
            recentLogCount: this.recentLogs.length
        };
    }
    
    /**
     * Get recent logs
     */
    getRecentLogs(count = 50) {
        return this.recentLogs.slice(-count);
    }
    
    /**
     * Clear recent logs buffer
     */
    clearRecentLogs() {
        this.recentLogs = [];
    }
    
    /**
     * Performance timer utility
     */
    time(label) {
        return new PerformanceTimer(this, label);
    }
}

/**
 * Child logger with additional context
 */
class ChildLogger {
    constructor(parent, additionalMeta) {
        this.parent = parent;
        this.additionalMeta = additionalMeta;
    }
    
    error(message, meta = {}) {
        this.parent.error(message, { ...this.additionalMeta, ...meta });
    }
    
    warn(message, meta = {}) {
        this.parent.warn(message, { ...this.additionalMeta, ...meta });
    }
    
    info(message, meta = {}) {
        this.parent.info(message, { ...this.additionalMeta, ...meta });
    }
    
    debug(message, meta = {}) {
        this.parent.debug(message, { ...this.additionalMeta, ...meta });
    }
    
    trace(message, meta = {}) {
        this.parent.trace(message, { ...this.additionalMeta, ...meta });
    }
    
    child(additionalMeta = {}) {
        return new ChildLogger(this.parent, { ...this.additionalMeta, ...additionalMeta });
    }
    
    time(label) {
        return this.parent.time(label);
    }
}

/**
 * Performance timer utility
 */
class PerformanceTimer {
    constructor(logger, label) {
        this.logger = logger;
        this.label = label;
        this.startTime = Date.now();
    }
    
    end(meta = {}) {
        const duration = Date.now() - this.startTime;
        this.logger.info(`Timer: ${this.label}`, {
            duration: `${duration}ms`,
            ...meta
        });
        return duration;
    }
}

/**
 * System Monitor
 */
export class SystemMonitor {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.monitoringInterval = options.interval || 60000; // 1 minute
        this.alertThresholds = {
            memoryUsage: options.memoryThreshold || 0.8, // 80%
            errorRate: options.errorRateThreshold || 0.1, // 10%
            responseTime: options.responseTimeThreshold || 5000 // 5 seconds
        };
        
        this.metrics = {
            requests: 0,
            errors: 0,
            totalResponseTime: 0,
            lastResetTime: Date.now()
        };
        
        this.intervalId = null;
        this.isMonitoring = false;
    }
    
    /**
     * Start system monitoring
     */
    start() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.logger.info('System monitoring started');
        
        this.intervalId = setInterval(() => {
            this.collectMetrics();
        }, this.monitoringInterval);
    }
    
    /**
     * Stop system monitoring
     */
    stop() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.logger.info('System monitoring stopped');
    }
    
    /**
     * Record a request for monitoring
     */
    recordRequest(responseTime, isError = false) {
        this.metrics.requests++;
        this.metrics.totalResponseTime += responseTime;
        
        if (isError) {
            this.metrics.errors++;
        }
    }
    
    /**
     * Collect and log system metrics
     */
    collectMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const uptime = process.uptime();
            const errorRate = this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0;
            const avgResponseTime = this.metrics.requests > 0 ? this.metrics.totalResponseTime / this.metrics.requests : 0;
            
            const metrics = {
                memory: {
                    rss: this.formatBytes(memUsage.rss),
                    heapUsed: this.formatBytes(memUsage.heapUsed),
                    heapTotal: this.formatBytes(memUsage.heapTotal),
                    external: this.formatBytes(memUsage.external)
                },
                uptime: this.formatUptime(uptime),
                requests: this.metrics.requests,
                errors: this.metrics.errors,
                errorRate: (errorRate * 100).toFixed(2) + '%',
                avgResponseTime: avgResponseTime.toFixed(2) + 'ms'
            };
            
            this.logger.info('System metrics', metrics);
            
            // Check for alerts
            this.checkAlerts(memUsage, errorRate, avgResponseTime);
            
            // Reset metrics for next interval
            this.resetMetrics();
            
        } catch (error) {
            this.logger.error('Failed to collect system metrics', { error });
        }
    }
    
    /**
     * Check if any metrics exceed alert thresholds
     */
    checkAlerts(memUsage, errorRate, avgResponseTime) {
        const memoryUsageRatio = memUsage.heapUsed / memUsage.heapTotal;
        
        if (memoryUsageRatio > this.alertThresholds.memoryUsage) {
            this.logger.warn('High memory usage detected', {
                usage: (memoryUsageRatio * 100).toFixed(2) + '%',
                threshold: (this.alertThresholds.memoryUsage * 100).toFixed(2) + '%'
            });
        }
        
        if (errorRate > this.alertThresholds.errorRate) {
            this.logger.warn('High error rate detected', {
                errorRate: (errorRate * 100).toFixed(2) + '%',
                threshold: (this.alertThresholds.errorRate * 100).toFixed(2) + '%'
            });
        }
        
        if (avgResponseTime > this.alertThresholds.responseTime) {
            this.logger.warn('High response time detected', {
                avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
                threshold: this.alertThresholds.responseTime + 'ms'
            });
        }
    }
    
    /**
     * Reset metrics for next monitoring cycle
     */
    resetMetrics() {
        this.metrics = {
            requests: 0,
            errors: 0,
            totalResponseTime: 0,
            lastResetTime: Date.now()
        };
    }
    
    /**
     * Format bytes for human reading
     */
    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    /**
     * Format uptime for human reading
     */
    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
}

// Export default logger instance
export const logger = new Logger();