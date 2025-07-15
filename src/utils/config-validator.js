/**
 * Configuration Validation System
 * Validates team configuration and environment variables at startup
 */

import { logger } from './logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Configuration schema definitions
 */
const REQUIRED_ENV_VARS = [
    'OPENROUTER_API_KEY',
    'DATABASE_URL',
    'NODE_ENV',
    'PORT'
];

const OPTIONAL_ENV_VARS = [
    'SUPERMEMORY_API_KEY',
    'LOG_LEVEL',
    'REDIS_URL'
];

const SUPPORTED_AI_MODELS = [
    'claude-3-sonnet',
    'claude-3-opus',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo'
];

const VALID_ROLES = [
    'Co-Founder & Senior Sales Consultant',
    'VP Sales',
    'System Administrator',
    'Operations'
];

const VALID_FOCUS_AREAS = [
    'dealer_relationships',
    'strategic_accounts',
    'pilot_success',
    'expansion_sales',
    'new_dealer_acquisition',
    'relationship_management',
    'strategic_partnerships',
    'pilot_conversions',
    'sales_activities',
    'operational_efficiency',
    'process_optimization',
    'system_management',
    'operational_support',
    'workflow_management',
    'quality_assurance'
];

/**
 * Configuration validator class
 */
export class ConfigValidator {
    constructor(options = {}) {
        this.logger = options.logger || logger;
        this.strict = options.strict !== false;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Validate all configuration
     */
    async validateAll() {
        this.errors = [];
        this.warnings = [];

        try {
            // Validate environment variables
            this.validateEnvironment();

            // Validate team configuration
            const teamConfig = await this.loadTeamConfig();
            if (teamConfig) {
                this.validateTeamConfig(teamConfig);
            }

            // Validate feature flags
            await this.validateFeatureFlags();

            // Report results
            this.reportValidationResults();

            return {
                valid: this.errors.length === 0,
                errors: this.errors,
                warnings: this.warnings
            };

        } catch (error) {
            this.errors.push(`Configuration validation failed: ${error.message}`);
            return {
                valid: false,
                errors: this.errors,
                warnings: this.warnings
            };
        }
    }

    /**
     * Validate environment variables
     */
    validateEnvironment() {
        this.logger.info('Validating environment variables...');

        // Check required environment variables
        for (const envVar of REQUIRED_ENV_VARS) {
            if (!process.env[envVar]) {
                this.errors.push(`Required environment variable missing: ${envVar}`);
            } else if (process.env[envVar].trim() === '') {
                this.errors.push(`Required environment variable is empty: ${envVar}`);
            }
        }

        // Validate specific environment variable formats
        this.validateDatabaseUrl();
        this.validatePort();
        this.validateNodeEnv();
        this.validateApiKeys();

        // Check optional environment variables
        for (const envVar of OPTIONAL_ENV_VARS) {
            if (!process.env[envVar]) {
                this.warnings.push(`Optional environment variable not set: ${envVar}`);
            }
        }
    }

    /**
     * Validate database URL format
     */
    validateDatabaseUrl() {
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl) {
            try {
                const url = new URL(dbUrl);
                if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
                    this.warnings.push('DATABASE_URL should use postgres:// or postgresql:// protocol');
                }
                if (!url.hostname) {
                    this.errors.push('DATABASE_URL missing hostname');
                }
                if (!url.pathname || url.pathname === '/') {
                    this.errors.push('DATABASE_URL missing database name');
                }
            } catch (error) {
                this.errors.push(`Invalid DATABASE_URL format: ${error.message}`);
            }
        }
    }

    /**
     * Validate port configuration
     */
    validatePort() {
        const port = process.env.PORT;
        if (port) {
            const portNum = parseInt(port, 10);
            if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                this.errors.push(`Invalid PORT value: ${port}. Must be between 1 and 65535`);
            }
        }
    }

    /**
     * Validate NODE_ENV
     */
    validateNodeEnv() {
        const nodeEnv = process.env.NODE_ENV;
        if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
            this.warnings.push(`Unusual NODE_ENV value: ${nodeEnv}. Expected: development, production, or test`);
        }
    }

    /**
     * Validate API keys format
     */
    validateApiKeys() {
        const apiKeys = [
            { name: 'OPENROUTER_API_KEY', prefix: 'sk-or-' },
            { name: 'SUPERMEMORY_API_KEY', prefix: null }
        ];

        for (const { name, prefix } of apiKeys) {
            const value = process.env[name];
            if (value) {
                if (value.length < 10) {
                    this.warnings.push(`${name} seems too short (${value.length} characters)`);
                }
                if (prefix && !value.startsWith(prefix)) {
                    this.warnings.push(`${name} doesn't start with expected prefix: ${prefix}`);
                }
                if (value.includes(' ')) {
                    this.errors.push(`${name} contains spaces - this is likely incorrect`);
                }
            }
        }
    }

    /**
     * Load and validate team configuration
     */
    async loadTeamConfig() {
        try {
            const configPath = join(process.cwd(), 'config', 'team-config.json');
            const configData = readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.errors.push('Team configuration file not found: config/team-config.json');
            } else if (error instanceof SyntaxError) {
                this.errors.push(`Invalid JSON in team configuration: ${error.message}`);
            } else {
                this.errors.push(`Failed to load team configuration: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Validate team configuration structure
     */
    validateTeamConfig(config) {
        this.logger.info('Validating team configuration...');

        // Validate top-level structure
        this.validateRequiredFields(config, ['team', 'ai_configuration', 'business_rules'], 'root config');

        if (config.team) {
            this.validateTeamStructure(config.team);
        }

        if (config.ai_configuration) {
            this.validateAIConfiguration(config.ai_configuration);
        }

        if (config.business_rules) {
            this.validateBusinessRules(config.business_rules);
        }
    }

    /**
     * Validate team structure
     */
    validateTeamStructure(team) {
        this.validateRequiredFields(team, ['name', 'members'], 'team config');

        if (team.members) {
            this.validateTeamMembers(team.members);
        }

        if (team.executives) {
            this.validateExecutives(team.executives);
        }
    }

    /**
     * Validate team members
     */
    validateTeamMembers(members) {
        if (Object.keys(members).length === 0) {
            this.errors.push('No team members defined');
            return;
        }

        for (const [memberId, member] of Object.entries(members)) {
            this.validateTeamMember(memberId, member);
        }
    }

    /**
     * Validate individual team member
     */
    validateTeamMember(memberId, member) {
        const requiredFields = ['id', 'name', 'role', 'focus_areas', 'extraction_priorities', 'ai_model'];
        this.validateRequiredFields(member, requiredFields, `team member ${memberId}`);

        // Validate ID matches key
        if (member.id && member.id !== memberId) {
            this.warnings.push(`Team member ID mismatch: key '${memberId}' vs id '${member.id}'`);
        }

        // Validate role
        if (member.role && !VALID_ROLES.includes(member.role)) {
            this.warnings.push(`Unknown role for ${memberId}: ${member.role}`);
        }

        // Validate focus areas
        if (Array.isArray(member.focus_areas)) {
            for (const area of member.focus_areas) {
                if (!VALID_FOCUS_AREAS.includes(area)) {
                    this.warnings.push(`Unknown focus area for ${memberId}: ${area}`);
                }
            }
        }

        // Validate AI model
        if (member.ai_model && !SUPPORTED_AI_MODELS.includes(member.ai_model)) {
            this.warnings.push(`Unsupported AI model for ${memberId}: ${member.ai_model}`);
        }

        // Validate extraction priorities
        if (!Array.isArray(member.extraction_priorities) || member.extraction_priorities.length === 0) {
            this.warnings.push(`${memberId} has no extraction priorities defined`);
        }
    }

    /**
     * Validate executives configuration
     */
    validateExecutives(executives) {
        if (!Array.isArray(executives)) {
            this.errors.push('Executives must be an array');
            return;
        }

        for (const [index, executive] of executives.entries()) {
            const requiredFields = ['id', 'name', 'role', 'summary_style', 'priority_areas', 'ai_model'];
            this.validateRequiredFields(executive, requiredFields, `executive ${index}`);

            if (executive.ai_model && !SUPPORTED_AI_MODELS.includes(executive.ai_model)) {
                this.warnings.push(`Unsupported AI model for executive ${executive.id}: ${executive.ai_model}`);
            }
        }
    }

    /**
     * Validate AI configuration
     */
    validateAIConfiguration(aiConfig) {
        this.validateRequiredFields(aiConfig, ['models', 'processing'], 'AI configuration');

        if (aiConfig.models) {
            for (const [purpose, model] of Object.entries(aiConfig.models)) {
                if (!SUPPORTED_AI_MODELS.includes(model)) {
                    this.warnings.push(`Unsupported AI model for ${purpose}: ${model}`);
                }
            }
        }

        if (aiConfig.processing) {
            const processing = aiConfig.processing;
            
            if (typeof processing.batch_interval !== 'number' || processing.batch_interval < 60) {
                this.warnings.push('Batch interval should be at least 60 seconds');
            }

            if (typeof processing.memory_retention_days !== 'number' || processing.memory_retention_days < 1) {
                this.warnings.push('Memory retention days should be at least 1');
            }

            if (typeof processing.priority_threshold !== 'number' || 
                processing.priority_threshold < 0 || processing.priority_threshold > 1) {
                this.errors.push('Priority threshold must be between 0 and 1');
            }
        }
    }

    /**
     * Validate business rules
     */
    validateBusinessRules(businessRules) {
        if (businessRules.keyword_filtering?.enabled) {
            this.validateKeywordFiltering(businessRules.keyword_filtering);
        }

        if (businessRules.auto_categorization) {
            this.validateAutoCategorization(businessRules.auto_categorization);
        }
    }

    /**
     * Validate keyword filtering configuration
     */
    validateKeywordFiltering(keywordConfig) {
        if (keywordConfig.keywords) {
            for (const [priority, config] of Object.entries(keywordConfig.keywords)) {
                if (!config.priority_boost || typeof config.priority_boost !== 'number') {
                    this.warnings.push(`Priority boost not defined for keyword priority: ${priority}`);
                }

                if (!Array.isArray(config.terms) || config.terms.length === 0) {
                    this.warnings.push(`No terms defined for keyword priority: ${priority}`);
                }
            }
        }

        if (typeof keywordConfig.executive_escalation_threshold !== 'number') {
            this.warnings.push('Executive escalation threshold should be a number');
        }
    }

    /**
     * Validate auto-categorization rules
     */
    validateAutoCategorization(autoCateg) {
        for (const [category, terms] of Object.entries(autoCateg)) {
            if (!Array.isArray(terms) || terms.length === 0) {
                this.warnings.push(`No terms defined for auto-categorization: ${category}`);
            }
        }
    }

    /**
     * Validate feature flags
     */
    async validateFeatureFlags() {
        try {
            const flagsPath = join(process.cwd(), 'config', 'feature-flags.json');
            const flagsData = readFileSync(flagsPath, 'utf8');
            const flags = JSON.parse(flagsData);

            // Validate flag structure
            for (const [flagName, config] of Object.entries(flags)) {
                if (typeof config !== 'object' || config === null) {
                    this.warnings.push(`Feature flag ${flagName} should be an object`);
                    continue;
                }

                if (typeof config.enabled !== 'boolean') {
                    this.warnings.push(`Feature flag ${flagName} should have boolean 'enabled' property`);
                }
            }

        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.warnings.push(`Failed to validate feature flags: ${error.message}`);
            }
        }
    }

    /**
     * Helper to validate required fields
     */
    validateRequiredFields(obj, requiredFields, context) {
        for (const field of requiredFields) {
            if (!(field in obj)) {
                this.errors.push(`Missing required field '${field}' in ${context}`);
            } else if (obj[field] === null || obj[field] === undefined || obj[field] === '') {
                this.errors.push(`Required field '${field}' is empty in ${context}`);
            }
        }
    }

    /**
     * Report validation results
     */
    reportValidationResults() {
        const totalIssues = this.errors.length + this.warnings.length;

        if (totalIssues === 0) {
            this.logger.info('✅ Configuration validation passed - no issues found');
            return;
        }

        // Report errors
        if (this.errors.length > 0) {
            this.logger.error(`Configuration validation found ${this.errors.length} error(s):`);
            this.errors.forEach((error, index) => {
                this.logger.error(`  ${index + 1}. ${error}`);
            });
        }

        // Report warnings
        if (this.warnings.length > 0) {
            this.logger.warn(`Configuration validation found ${this.warnings.length} warning(s):`);
            this.warnings.forEach((warning, index) => {
                this.logger.warn(`  ${index + 1}. ${warning}`);
            });
        }

        // Exit if we have errors and in strict mode
        if (this.errors.length > 0 && this.strict) {
            this.logger.error('Configuration validation failed - exiting due to errors');
            process.exit(1);
        }
    }

    /**
     * Get validation summary
     */
    getValidationSummary() {
        return {
            total_errors: this.errors.length,
            total_warnings: this.warnings.length,
            is_valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

/**
 * Convenience function to validate configuration at startup
 */
export async function validateConfigurationAtStartup(options = {}) {
    const validator = new ConfigValidator(options);
    const result = await validator.validateAll();
    
    if (!result.valid && options.exitOnError !== false) {
        process.exit(1);
    }
    
    return result;
}

// Export default validator instance
export const configValidator = new ConfigValidator();