/**
 * Memory Statistics API
 * Provides memory usage stats for UI display
 */

import express from 'express';
import { logger } from '../utils/logger.js';

export function registerMemoryStatsAPI(app, orchestrator) {
    const router = express.Router();
    
    /**
     * Get memory statistics for a team member
     */
    router.get('/members/:memberId/memory-stats', async (req, res) => {
        try {
            const { memberId } = req.params;
            
            // Get the personal assistant for this member
            const assistant = orchestrator?.personalAssistants?.get(memberId);
            
            if (!assistant || !assistant.memory) {
                // Return mock data if no memory system
                return res.json({
                    memberId,
                    count: 0,
                    enabled: false,
                    message: 'Memory system not configured'
                });
            }
            
            // Get memory stats
            try {
                // Search for all memories for this user
                const memories = await assistant.memory.searchMemories({
                    userId: memberId,
                    limit: 1000 // Get count
                });
                
                // Get additional stats if available
                const stats = {
                    memberId,
                    count: memories.length,
                    enabled: true,
                    oldestMemory: memories.length > 0 ? memories[memories.length - 1].content.date : null,
                    newestMemory: memories.length > 0 ? memories[0].content.date : null,
                    categories: {}
                };
                
                // Count by type
                memories.forEach(memory => {
                    const type = memory.type || 'other';
                    stats.categories[type] = (stats.categories[type] || 0) + 1;
                });
                
                res.json(stats);
                
            } catch (memoryError) {
                logger.error('Failed to fetch memory stats', { error: memoryError, memberId });
                res.json({
                    memberId,
                    count: 0,
                    enabled: true,
                    error: 'Failed to fetch memory statistics'
                });
            }
            
        } catch (error) {
            logger.error('Memory stats API error', { error });
            res.status(500).json({ error: 'Failed to get memory statistics' });
        }
    });
    
    /**
     * Get overall memory system status
     */
    router.get('/memory/status', async (req, res) => {
        try {
            const status = {
                enabled: false,
                totalMemories: 0,
                memberStats: {}
            };
            
            // Check if any assistants have memory enabled
            if (orchestrator?.personalAssistants) {
                for (const [memberId, assistant] of orchestrator.personalAssistants) {
                    if (assistant.memory) {
                        status.enabled = true;
                        try {
                            const memories = await assistant.memory.searchMemories({
                                userId: memberId,
                                limit: 100
                            });
                            status.memberStats[memberId] = memories.length;
                            status.totalMemories += memories.length;
                        } catch (error) {
                            status.memberStats[memberId] = 0;
                        }
                    } else {
                        status.memberStats[memberId] = 0;
                    }
                }
            }
            
            res.json(status);
            
        } catch (error) {
            logger.error('Memory status API error', { error });
            res.status(500).json({ error: 'Failed to get memory status' });
        }
    });
    
    app.use('/api', router);
    
    logger.info('Memory Stats API registered');
}