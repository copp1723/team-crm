/**
 * KEYWORD FILTER
 * Analyzes team updates for configured keywords and calculates priority boosts
 * Integrates with existing orchestration to influence executive escalations
 */

export class KeywordFilter {
    constructor(config) {
        this.config = config;
        this.keywordConfig = null;
        this.enabled = false;
        this.matchCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        this.initialize();
    }

    /**
     * Initialize the keyword filter with configuration
     */
    initialize() {
        try {
            this.loadConfiguration();
            console.log('✅ Keyword Filter initialized');
        } catch (error) {
            console.error('❌ Keyword Filter initialization failed:', error);
            this.enabled = false;
        }
    }

    /**
     * Load and validate keyword configuration
     */
    loadConfiguration() {
        const businessRules = this.config.business_rules;
        
        if (!businessRules || !businessRules.keyword_filtering) {
            throw new Error('Keyword filtering configuration not found');
        }

        this.keywordConfig = businessRules.keyword_filtering;
        this.enabled = this.keywordConfig.enabled === true;

        if (!this.enabled) {
            console.log('ℹ️ Keyword filtering is disabled in configuration');
            return;
        }

        // Validate configuration structure
        this.validateConfiguration();
        
        // Prepare keywords for efficient matching
        this.prepareKeywords();
        
        console.log(`📝 Loaded ${this.getTotalKeywordCount()} keywords across ${Object.keys(this.keywordConfig.keywords).length} priority levels`);
    }

    /**
     * Validate keyword configuration structure
     */
    validateConfiguration() {
        const required = ['keywords', 'executive_escalation_threshold'];
        for (const field of required) {
            if (!(field in this.keywordConfig)) {
                throw new Error(`Missing required keyword configuration field: ${field}`);
            }
        }

        if (!this.keywordConfig.keywords || typeof this.keywordConfig.keywords !== 'object') {
            throw new Error('Keywords configuration must be an object');
        }

        // Validate each keyword level
        for (const [level, config] of Object.entries(this.keywordConfig.keywords)) {
            if (!config.priority_boost || typeof config.priority_boost !== 'number') {
                throw new Error(`Invalid priority_boost for keyword level: ${level}`);
            }
            
            if (!Array.isArray(config.terms) || config.terms.length === 0) {
                throw new Error(`Invalid or empty terms array for keyword level: ${level}`);
            }
        }
    }

    /**
     * Prepare keywords for efficient matching
     */
    prepareKeywords() {
        this.compiledKeywords = {};
        
        for (const [level, config] of Object.entries(this.keywordConfig.keywords)) {
            this.compiledKeywords[level] = {
                priority_boost: config.priority_boost,
                terms: config.terms.map(term => 
                    this.keywordConfig.case_sensitive ? term : term.toLowerCase()
                )
            };
        }
    }

    /**
     * Main analysis method - analyzes both raw text and extracted data
     */
    analyze(rawText, extractedData = {}) {
        if (!this.enabled) {
            return this.createEmptyResult();
        }

        try {
            // Generate cache key
            const cacheKey = this.generateCacheKey(rawText, extractedData);
            
            // Check cache first
            const cached = this.matchCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }

            // Perform analysis
            const result = this.performAnalysis(rawText, extractedData);
            
            // Cache result
            this.matchCache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });
            
            // Clean old cache entries periodically
            this.cleanCache();
            
            return result;
            
        } catch (error) {
            console.error('Error in keyword analysis:', error);
            return this.createEmptyResult();
        }
    }

    /**
     * Perform the actual keyword analysis
     */
    performAnalysis(rawText, extractedData) {
        const matches = {
            raw_text: this.scanText(rawText),
            structured_data: this.scanStructuredData(extractedData)
        };

        // Combine and deduplicate matches
        const allMatches = this.combineMatches(matches);
        
        // Calculate priority boost
        const priorityBoost = this.calculatePriorityBoost(allMatches);
        
        // Determine if executive escalation is needed
        const requiresEscalation = priorityBoost >= this.keywordConfig.executive_escalation_threshold;

        return {
            matches: allMatches,
            priority_boost: priorityBoost,
            requires_escalation: requiresEscalation,
            keyword_analysis: {
                raw_text_matches: matches.raw_text.length,
                structured_data_matches: matches.structured_data.length,
                total_unique_matches: allMatches.length,
                highest_priority_level: this.getHighestPriorityLevel(allMatches)
            },
            processed_at: new Date().toISOString()
        };
    }

    /**
     * Scan raw text for keyword matches
     */
    scanText(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const searchText = this.keywordConfig.case_sensitive ? text : text.toLowerCase();
        const matches = [];

        for (const [level, config] of Object.entries(this.compiledKeywords)) {
            for (const term of config.terms) {
                if (this.matchesKeyword(searchText, term)) {
                    matches.push({
                        term,
                        level,
                        priority_boost: config.priority_boost,
                        source: 'raw_text',
                        context: this.extractContext(text, term)
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Scan structured data for keyword matches
     */
    scanStructuredData(data) {
        if (!data || typeof data !== 'object') {
            return [];
        }

        const matches = [];
        const textFields = this.extractTextFromStructuredData(data);

        for (const field of textFields) {
            if (field.value && typeof field.value === 'string') {
                const fieldMatches = this.scanText(field.value);
                
                // Add field context to matches
                fieldMatches.forEach(match => {
                    matches.push({
                        ...match,
                        source: 'structured_data',
                        field_path: field.path,
                        context: this.extractContext(field.value, match.term)
                    });
                });
            }
        }

        return matches;
    }

    /**
     * Extract text fields from structured data recursively
     */
    extractTextFromStructuredData(data, path = '') {
        const textFields = [];

        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                textFields.push(...this.extractTextFromStructuredData(item, `${path}[${index}]`));
            });
        } else if (data && typeof data === 'object') {
            Object.entries(data).forEach(([key, value]) => {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (typeof value === 'string') {
                    textFields.push({
                        path: currentPath,
                        value
                    });
                } else if (value && (typeof value === 'object' || Array.isArray(value))) {
                    textFields.push(...this.extractTextFromStructuredData(value, currentPath));
                }
            });
        }

        return textFields;
    }

    /**
     * Check if text matches a keyword
     */
    matchesKeyword(text, keyword) {
        if (this.keywordConfig.match_whole_words) {
            // Match whole words only
            const wordBoundaryRegex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
            return wordBoundaryRegex.test(text);
        } else {
            // Simple substring matching
            return text.includes(keyword);
        }
    }

    /**
     * Extract context around a matched keyword
     */
    extractContext(text, keyword, contextLength = 50) {
        const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (keywordIndex === -1) return text.substring(0, contextLength);

        const start = Math.max(0, keywordIndex - contextLength);
        const end = Math.min(text.length, keywordIndex + keyword.length + contextLength);
        
        let context = text.substring(start, end);
        
        // Add ellipsis if we truncated
        if (start > 0) context = '...' + context;
        if (end < text.length) context = context + '...';
        
        return context;
    }

    /**
     * Combine and deduplicate matches from different sources
     */
    combineMatches(matches) {
        const allMatches = [...matches.raw_text, ...matches.structured_data];
        const uniqueMatches = new Map();

        // Deduplicate by term and level, keeping the first occurrence
        allMatches.forEach(match => {
            const key = `${match.term}_${match.level}`;
            if (!uniqueMatches.has(key)) {
                uniqueMatches.set(key, match);
            }
        });

        return Array.from(uniqueMatches.values());
    }

    /**
     * Calculate total priority boost from matches
     */
    calculatePriorityBoost(matches) {
        let totalBoost = 0;
        const levelBoosts = new Map();

        // Sum boost per level to avoid duplicate counting
        matches.forEach(match => {
            const currentBoost = levelBoosts.get(match.level) || 0;
            levelBoosts.set(match.level, Math.max(currentBoost, match.priority_boost));
        });

        // Sum all level boosts
        levelBoosts.forEach(boost => {
            totalBoost += boost;
        });

        return totalBoost;
    }

    /**
     * Get the highest priority level from matches
     */
    getHighestPriorityLevel(matches) {
        if (matches.length === 0) return null;

        const levels = ['critical', 'high', 'medium', 'low'];
        for (const level of levels) {
            if (matches.some(match => match.level === level)) {
                return level;
            }
        }

        return matches[0]?.level || null;
    }

    /**
     * Generate cache key for analysis results
     */
    generateCacheKey(rawText, extractedData) {
        const textHash = this.simpleHash(rawText || '');
        const dataHash = this.simpleHash(JSON.stringify(extractedData || {}));
        return `${textHash}_${dataHash}`;
    }

    /**
     * Simple hash function for cache keys
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Clean old cache entries
     */
    cleanCache() {
        if (this.matchCache.size < 100) return; // Only clean when cache gets large

        const now = Date.now();
        for (const [key, value] of this.matchCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.matchCache.delete(key);
            }
        }
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Create empty result for when filtering is disabled
     */
    createEmptyResult() {
        return {
            matches: [],
            priority_boost: 0,
            requires_escalation: false,
            keyword_analysis: {
                raw_text_matches: 0,
                structured_data_matches: 0,
                total_unique_matches: 0,
                highest_priority_level: null
            },
            processed_at: new Date().toISOString()
        };
    }

    /**
     * Get total number of configured keywords
     */
    getTotalKeywordCount() {
        return Object.values(this.keywordConfig.keywords || {})
            .reduce((total, config) => total + (config.terms?.length || 0), 0);
    }

    /**
     * Get configuration summary for debugging
     */
    getConfigurationSummary() {
        if (!this.enabled) {
            return { enabled: false };
        }

        return {
            enabled: true,
            total_keywords: this.getTotalKeywordCount(),
            levels: Object.keys(this.keywordConfig.keywords),
            escalation_threshold: this.keywordConfig.executive_escalation_threshold,
            case_sensitive: this.keywordConfig.case_sensitive,
            match_whole_words: this.keywordConfig.match_whole_words
        };
    }

    /**
     * Update configuration (for dynamic configuration changes)
     */
    updateConfiguration(newConfig) {
        this.config = newConfig;
        this.matchCache.clear(); // Clear cache when config changes
        this.initialize();
    }
}