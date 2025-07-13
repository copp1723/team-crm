/**
 * AI Retry Handler
 * Provides robust error handling and retry logic for AI API calls
 */

export class AIRetryHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000;
        this.maxDelay = options.maxDelay || 10000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.timeout = options.timeout || 30000;
    }

    /**
     * Execute an AI call with automatic retry logic
     */
    async executeWithRetry(aiFunction, context = {}) {
        let lastError;
        
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                // Add timeout wrapper
                const result = await this.withTimeout(
                    aiFunction(),
                    this.timeout,
                    `AI call timed out after ${this.timeout}ms`
                );
                
                // Log successful recovery if this wasn't the first attempt
                if (attempt > 0) {
                    console.log(`AI call succeeded after ${attempt} retries`);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                
                // Calculate delay with exponential backoff
                const delay = Math.min(
                    this.initialDelay * Math.pow(this.backoffMultiplier, attempt),
                    this.maxDelay
                );
                
                console.warn(`AI call failed (attempt ${attempt + 1}/${this.maxRetries}):`, {
                    error: error.message,
                    retryIn: delay,
                    context
                });
                
                // Don't delay on the last attempt
                if (attempt < this.maxRetries - 1) {
                    await this.sleep(delay);
                }
            }
        }
        
        // All retries exhausted
        throw new Error(`AI call failed after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Wrap a promise with a timeout
     */
    async withTimeout(promise, timeoutMs, timeoutMessage) {
        let timeoutId;
        
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, timeoutMs);
        });
        
        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * Determine if an error is retryable
     */
    isRetryableError(error) {
        // Network errors
        if (error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND') {
            return true;
        }
        
        // Rate limiting
        if (error.status === 429 || error.message?.includes('rate limit')) {
            return true;
        }
        
        // Server errors (5xx)
        if (error.status >= 500 && error.status < 600) {
            return true;
        }
        
        // Timeout errors
        if (error.message?.includes('timeout')) {
            return true;
        }
        
        // OpenRouter specific errors
        if (error.message?.includes('temporarily unavailable') ||
            error.message?.includes('model is overloaded')) {
            return true;
        }
        
        return false;
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a fallback response for critical failures
     */
    createFallbackResponse(originalInput, error) {
        return {
            success: false,
            fallback: true,
            error: error.message,
            timestamp: new Date().toISOString(),
            originalInput,
            message: 'AI service temporarily unavailable. Your update has been recorded and will be processed when service is restored.',
            extracted_data: {
                raw_text: originalInput,
                requires_manual_review: true
            }
        };
    }
}