/**
 * PERSONAL ASSISTANT FACTORY
 * Creates and manages individual personal assistants for each team member
 * Each assistant has its own Supermemory space for contextual learning
 */

import { v4 as uuidv4 } from 'uuid';
import { EnhancedPersonalAssistant } from './enhanced-personal-assistant.js';
import { logger } from '../../utils/logger.js';
import { db, dbHelpers } from '../database/connection.js';
import fetch from 'node-fetch';

export class PersonalAssistantFactory {
    constructor(config = {}) {
        this.config = {
            supermemoryApiKey: process.env.SUPERMEMORY_API_KEY,
            supermemoryBaseUrl: 'https://api.supermemory.ai/v1',
            defaultAiModel: 'claude-3-sonnet',
            ...config
        };
        
        this.assistants = new Map(); // Cache of active assistants
        this.logger = logger.child({ component: 'PersonalAssistantFactory' });
    }

    /**
     * Create a personal assistant for a team member
     */
    async createAssistantForMember(memberId, memberData) {
        try {
            this.logger.info('Creating personal assistant for member', { memberId, memberName: memberData.name });

            // Check if assistant already exists in cache
            if (this.assistants.has(memberId)) {
                return this.assistants.get(memberId);
            }

            // Check database for existing assistant configuration
            let assistantConfig = await this.getAssistantConfig(memberId);
            
            if (!assistantConfig) {
                // Create new Supermemory space for this user
                const supermemorySpace = await this.createSupermemorySpace(memberData);
                
                // Save assistant configuration to database
                assistantConfig = await this.saveAssistantConfig(memberId, memberData, supermemorySpace);
            }

            // Create the assistant instance
            const assistant = new EnhancedPersonalAssistant({
                ...memberData,
                memberId,
                supermemoryConfig: {
                    apiKey: this.config.supermemoryApiKey,
                    spaceId: assistantConfig.supermemory_collection_id,
                    baseUrl: this.config.supermemoryBaseUrl
                },
                aiModel: memberData.ai_model || this.config.defaultAiModel,
                learningPreferences: assistantConfig.learning_preferences || this.getDefaultLearningPreferences(memberData)
            });

            // Initialize the assistant
            await assistant.initialize();

            // Cache the assistant
            this.assistants.set(memberId, assistant);

            this.logger.info('Personal assistant created successfully', { 
                memberId, 
                assistantName: assistantConfig.assistant_name,
                supermemorySpace: assistantConfig.supermemory_collection_id 
            });

            return assistant;

        } catch (error) {
            this.logger.error('Failed to create personal assistant', { error, memberId });
            throw new Error(`Failed to create personal assistant: ${error.message}`);
        }
    }

    /**
     * Get assistant configuration from database
     */
    async getAssistantConfig(memberId) {
        try {
            const query = `
                SELECT pa.*, tm.supermemory_space_id 
                FROM personal_assistants pa
                JOIN team_members tm ON tm.id = pa.member_id
                WHERE pa.member_id = $1
            `;
            const result = await db.query(query, [memberId]);
            return result.rows[0];
        } catch (error) {
            this.logger.error('Failed to get assistant config', { error, memberId });
            return null;
        }
    }

    /**
     * Save assistant configuration to database
     */
    async saveAssistantConfig(memberId, memberData, supermemorySpace) {
        try {
            const assistantName = `${memberData.name}'s Personal Assistant`;
            const configuration = {
                created: new Date().toISOString(),
                version: '2.0',
                capabilities: ['extraction', 'learning', 'context-aware', 'proactive-suggestions']
            };
            const learningPreferences = this.getDefaultLearningPreferences(memberData);

            const query = `
                INSERT INTO personal_assistants 
                (id, member_id, assistant_name, supermemory_collection_id, configuration, learning_preferences)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const values = [
                uuidv4(),
                memberId,
                assistantName,
                supermemorySpace.id,
                JSON.stringify(configuration),
                JSON.stringify(learningPreferences)
            ];

            const result = await db.query(query, values);

            // Also update the team member's supermemory_space_id
            await db.query(
                'UPDATE team_members SET supermemory_space_id = $1 WHERE id = $2',
                [supermemorySpace.id, memberId]
            );

            return result.rows[0];
        } catch (error) {
            this.logger.error('Failed to save assistant config', { error, memberId });
            throw error;
        }
    }

    /**
     * Create a Supermemory space for the user
     */
    async createSupermemorySpace(memberData) {
        try {
            const response = await fetch(`${this.config.supermemoryBaseUrl}/spaces`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.supermemoryApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `${memberData.name}_crm_space`,
                    description: `Personal knowledge space for ${memberData.name} - ${memberData.role}`,
                    metadata: {
                        userId: memberData.external_id,
                        role: memberData.role,
                        createdFor: 'team-crm-personal-assistant'
                    }
                })
            });

            if (!response.ok) {
                // If Supermemory API fails, create a mock space
                this.logger.warn('Supermemory API not available, using mock space');
                return {
                    id: `mock_space_${memberData.external_id}_${Date.now()}`,
                    name: `${memberData.name}_crm_space`,
                    mock: true
                };
            }

            const space = await response.json();
            this.logger.info('Supermemory space created', { 
                spaceId: space.id, 
                memberName: memberData.name 
            });
            
            return space;

        } catch (error) {
            this.logger.error('Failed to create Supermemory space', { error });
            // Return mock space on error
            return {
                id: `mock_space_${memberData.external_id}_${Date.now()}`,
                name: `${memberData.name}_crm_space`,
                mock: true
            };
        }
    }

    /**
     * Get default learning preferences based on role
     */
    getDefaultLearningPreferences(memberData) {
        const basePreferences = {
            rememberClientPreferences: true,
            trackDealPatterns: true,
            learnCommunicationStyle: true,
            adaptToFeedback: true
        };

        // Customize based on role
        if (memberData.role?.toLowerCase().includes('sales')) {
            return {
                ...basePreferences,
                focusAreas: ['deal_progression', 'client_relationships', 'competitive_intelligence'],
                extractionPriorities: ['opportunities', 'risks', 'action_items', 'client_sentiment']
            };
        } else if (memberData.role?.toLowerCase().includes('admin')) {
            return {
                ...basePreferences,
                focusAreas: ['system_health', 'team_performance', 'process_optimization'],
                extractionPriorities: ['issues', 'improvements', 'metrics', 'team_feedback']
            };
        } else {
            return {
                ...basePreferences,
                focusAreas: ['general_updates', 'action_items', 'important_information'],
                extractionPriorities: ['tasks', 'deadlines', 'key_points', 'follow_ups']
            };
        }
    }

    /**
     * Get or create assistant for a member
     */
    async getAssistant(memberId) {
        // Check cache first
        if (this.assistants.has(memberId)) {
            return this.assistants.get(memberId);
        }

        // Load member data and create assistant
        const memberData = await this.getMemberData(memberId);
        if (!memberData) {
            throw new Error(`Member not found: ${memberId}`);
        }

        return this.createAssistantForMember(memberId, memberData);
    }

    /**
     * Get member data from database
     */
    async getMemberData(memberId) {
        try {
            const result = await db.query(
                'SELECT * FROM team_members WHERE id = $1 OR external_id = $1',
                [memberId]
            );
            return result.rows[0];
        } catch (error) {
            this.logger.error('Failed to get member data', { error, memberId });
            return null;
        }
    }

    /**
     * Update assistant configuration
     */
    async updateAssistantConfig(memberId, updates) {
        try {
            const assistant = await this.getAssistant(memberId);
            
            // Update database
            const query = `
                UPDATE personal_assistants 
                SET configuration = configuration || $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE member_id = $2
                RETURNING *
            `;
            
            const result = await db.query(query, [JSON.stringify(updates), memberId]);
            
            // Update cached assistant if needed
            if (assistant) {
                assistant.updateConfiguration(updates);
            }

            return result.rows[0];

        } catch (error) {
            this.logger.error('Failed to update assistant config', { error, memberId });
            throw error;
        }
    }

    /**
     * Remove assistant from cache
     */
    removeAssistant(memberId) {
        if (this.assistants.has(memberId)) {
            const assistant = this.assistants.get(memberId);
            // Clean up any resources
            if (assistant.cleanup) {
                assistant.cleanup();
            }
            this.assistants.delete(memberId);
        }
    }

    /**
     * Get all active assistants
     */
    getActiveAssistants() {
        return Array.from(this.assistants.entries()).map(([memberId, assistant]) => ({
            memberId,
            assistantName: assistant.name,
            isActive: true,
            lastActivity: assistant.getLastActivityTime()
        }));
    }
}

// Export singleton instance
export const personalAssistantFactory = new PersonalAssistantFactory();