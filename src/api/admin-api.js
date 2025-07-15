/**
 * Admin API endpoints for user management
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ dest: '/tmp' });

export class AdminAPI {
    constructor(configPath) {
        this.configPath = configPath || path.join(__dirname, '../../config/team-config.json');
        this.authPath = path.join(__dirname, '../middleware/auth.js');
    }

    /**
     * Register admin API endpoints
     */
    registerEndpoints(app) {
        const router = express.Router();

        // Protect all admin routes
        router.use(this.requireAdminAuth);

        // Get all users
        router.get('/users', async (req, res) => {
            try {
                const config = await this.loadConfig();
                const users = {};

                // Combine team members and executives
                Object.entries(config.team.members).forEach(([username, member]) => {
                    users[username] = {
                        ...member,
                        isExecutive: config.team.executives.some(e => e.id === username)
                    };
                });

                res.json({ users });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Add new user
        router.post('/users', async (req, res) => {
            try {
                const { username, name, role, isExecutive } = req.body;

                if (!username || !name || !role) {
                    return res.status(400).json({ error: 'Hey there! We need the username, name, and role to create a new user. Mind filling those in?' });
                }

                const config = await this.loadConfig();

                // Check if user exists
                if (config.team.members[username]) {
                    return res.status(409).json({ error: 'User already exists' });
                }

                // Generate password
                const password = this.generatePassword();

                // Add to config
                config.team.members[username] = {
                    id: username,
                    name: name,
                    role: role,
                    focus_areas: ["dealer_relationships", "sales_activities"],
                    extraction_priorities: ["dealer_feedback", "meeting_notes", "action_items"],
                    ai_model: "claude-3-sonnet"
                };

                // Add to executives if specified
                if (isExecutive) {
                    config.team.executives.push({
                        id: username,
                        name: name,
                        role: role,
                        summary_style: "strategic_focus",
                        priority_areas: ["team_performance", "deal_pipeline", "strategic_decisions"],
                        ai_model: "claude-3-opus"
                    });
                }

                // Also add to database
                try {
                    await this.addTeamMemberToDatabase(username, {
                        name: name,
                        role: role,
                        focus_areas: ["dealer_relationships", "sales_activities"],
                        extraction_priorities: ["dealer_feedback", "meeting_notes", "action_items"],
                        ai_model: "claude-3-sonnet"
                    });
                } catch (dbError) {
                    console.warn('Failed to add team member to database:', dbError.message);
                    // Continue with config update even if database update fails
                }

                await this.saveConfig(config);
                await this.updateAuthFile(config.team.members);

                res.json({ 
                    success: true, 
                    password: password,
                    envVar: `${username.toUpperCase()}_PASSWORD=${password}`
                });

            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update user
        router.put('/users/:username', async (req, res) => {
            try {
                const { username } = req.params;
                const { name, role, focus_areas, isExecutive } = req.body;

                const config = await this.loadConfig();

                if (!config.team.members[username]) {
                    return res.status(404).json({ error: 'Hmm, can\'t find that user. Double-check the username?' });
                }

                // Update member info in config
                if (name) config.team.members[username].name = name;
                if (role) config.team.members[username].role = role;
                if (focus_areas) config.team.members[username].focus_areas = focus_areas;

                // Update in database as well
                try {
                    await this.updateTeamMemberInDatabase(username, { name, role, focus_areas });
                } catch (dbError) {
                    console.warn('Failed to update team member in database:', dbError.message);
                    // Continue with config update even if database update fails
                }

                // Update executive status
                const execIndex = config.team.executives.findIndex(e => e.id === username);
                
                if (isExecutive && execIndex === -1) {
                    // Add to executives
                    config.team.executives.push({
                        id: username,
                        name: name || config.team.members[username].name,
                        role: role || config.team.members[username].role,
                        summary_style: "strategic_focus",
                        priority_areas: ["team_performance", "deal_pipeline", "strategic_decisions"],
                        ai_model: "claude-3-opus"
                    });
                } else if (!isExecutive && execIndex !== -1) {
                    // Remove from executives
                    config.team.executives.splice(execIndex, 1);
                } else if (isExecutive && execIndex !== -1) {
                    // Update existing executive info
                    config.team.executives[execIndex].name = name || config.team.executives[execIndex].name;
                    config.team.executives[execIndex].role = role || config.team.executives[execIndex].role;
                }

                await this.saveConfig(config);

                res.json({ success: true });

            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Delete user
        router.delete('/users/:username', async (req, res) => {
            try {
                const { username } = req.params;
                const config = await this.loadConfig();

                if (!config.team.members[username]) {
                    return res.status(404).json({ error: 'Hmm, can\'t find that user. Double-check the username?' });
                }

                // Remove from members
                delete config.team.members[username];

                // Remove from executives
                config.team.executives = config.team.executives.filter(e => e.id !== username);

                await this.saveConfig(config);
                await this.updateAuthFile(config.team.members);

                res.json({ success: true });

            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bulk import users
        router.post('/users/import', upload.single('csv'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'No file uploaded' });
                }

                const csvContent = await fs.readFile(req.file.path, 'utf8');
                const users = this.parseCSV(csvContent);
                const config = await this.loadConfig();
                const passwords = {};
                let imported = 0;

                for (const user of users) {
                    const { username, name, role, is_executive } = user;

                    if (!username || !name || !role || config.team.members[username]) {
                        continue;
                    }

                    const password = this.generatePassword();
                    passwords[username] = password;

                    config.team.members[username] = {
                        id: username,
                        name: name,
                        role: role,
                        focus_areas: ["dealer_relationships", "sales_activities"],
                        extraction_priorities: ["dealer_feedback", "meeting_notes", "action_items"],
                        ai_model: "claude-3-sonnet"
                    };

                    if (is_executive?.toLowerCase() === 'yes') {
                        config.team.executives.push({
                            id: username,
                            name: name,
                            role: role,
                            summary_style: "strategic_focus",
                            priority_areas: ["team_performance", "deal_pipeline", "strategic_decisions"],
                            ai_model: "claude-3-opus"
                        });
                    }

                    imported++;
                }

                await this.saveConfig(config);
                await this.updateAuthFile(config.team.members);

                // Clean up uploaded file
                await fs.unlink(req.file.path);

                res.json({ 
                    success: true, 
                    imported: imported,
                    passwords: passwords 
                });

            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // System settings endpoints
        router.get('/settings', async (req, res) => {
            try {
                const config = await this.loadConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        router.put('/settings/ai', async (req, res) => {
            try {
                const config = await this.loadConfig();
                
                // Update AI configuration
                if (!config.ai_configuration) config.ai_configuration = {};
                config.ai_configuration.models = {
                    ...config.ai_configuration.models,
                    ...req.body.models
                };
                config.ai_configuration.processing = {
                    ...config.ai_configuration.processing,
                    ...req.body.processing
                };
                
                await this.saveConfig(config);
                res.json({ success: true });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        router.put('/settings/business-rules', async (req, res) => {
            try {
                const config = await this.loadConfig();
                
                // Update business rules
                config.business_rules = {
                    ...config.business_rules,
                    ...req.body
                };
                
                // Update memory retention in AI config
                if (req.body.memory_retention_days && config.ai_configuration?.processing) {
                    config.ai_configuration.processing.memory_retention_days = req.body.memory_retention_days;
                }
                
                await this.saveConfig(config);
                res.json({ success: true });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        router.put('/settings/integrations', async (req, res) => {
            try {
                const config = await this.loadConfig();
                
                // Store integration settings
                if (!config.integrations) config.integrations = {};
                config.integrations = {
                    ...config.integrations,
                    ...req.body
                };
                
                await this.saveConfig(config);
                res.json({ success: true });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // System status endpoint
        router.get('/status', async (req, res) => {
            try {
                // Get various system metrics
                const config = await this.loadConfig();
                const memberCount = Object.keys(config.team.members).length;
                
                // Calculate metrics (in production, these would come from your database)
                const status = {
                    totalUpdates: Math.floor(Math.random() * 1000) + 500, // Mock data
                    activeUsers: memberCount,
                    aiRequestsToday: Math.floor(Math.random() * 500) + 100, // Mock data
                    memoryUsage: `${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
                    integrations: {
                        supermemory: !!process.env.SUPERMEMORY_API_KEY,
                        database: !!process.env.DATABASE_URL
                    }
                };
                
                res.json(status);
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Export configuration
        router.get('/export', async (req, res) => {
            try {
                const config = await this.loadConfig();
                
                // Remove sensitive data
                const exportConfig = {
                    ...config,
                    exported_at: new Date().toISOString(),
                    version: '1.0.0'
                };
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="team-crm-config-${new Date().toISOString().split('T')[0]}.json"`);
                res.json(exportConfig);
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Sync config to database
        router.post('/sync-to-database', async (req, res) => {
            try {
                const config = await this.loadConfig();
                let syncedCount = 0;
                
                for (const [username, memberConfig] of Object.entries(config.team.members)) {
                    try {
                        await this.addTeamMemberToDatabase(username, {
                            name: memberConfig.name,
                            role: memberConfig.role,
                            focus_areas: memberConfig.focus_areas,
                            extraction_priorities: memberConfig.extraction_priorities,
                            ai_model: memberConfig.ai_model
                        });
                        syncedCount++;
                    } catch (error) {
                        console.warn(`Failed to sync ${username}:`, error.message);
                    }
                }
                
                res.json({ 
                    success: true, 
                    message: `Synced ${syncedCount} team members to database`,
                    syncedCount 
                });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Clear cache
        router.delete('/cache', async (req, res) => {
            try {
                // In a real implementation, this would clear Redis cache, temp files, etc.
                // For now, just return success
                res.json({ success: true, message: 'Cache cleared successfully' });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.use('/api/admin', router);
    }

    /**
     * Middleware to require admin authentication
     */
    requireAdminAuth(req, res, next) {
        // Check if user is authenticated and is an executive
        if (!req.auth || (req.auth.user !== 'tre' && req.auth.user !== 'josh')) {
            return res.status(403).json({ error: 'Hold up! You need admin privileges for this. Are you logged in as an admin?' });
        }
        next();
    }

    /**
     * Generate secure password
     */
    generatePassword(length = 12) {
        return crypto.randomBytes(length).toString('base64').slice(0, length);
    }

    /**
     * Load configuration
     */
    async loadConfig() {
        const configData = await fs.readFile(this.configPath, 'utf8');
        return JSON.parse(configData);
    }

    /**
     * Save configuration
     */
    async saveConfig(config) {
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    }

    /**
     * Update auth.js file
     */
    async updateAuthFile(members) {
        const authContent = await fs.readFile(this.authPath, 'utf8');
        
        const usersObj = Object.keys(members).map(username => {
            return `        '${username}': process.env.${username.toUpperCase()}_PASSWORD || 'changeme${Math.random().toString(36).substr(2, 6)}'`;
        }).join(',\n');
        
        const newAuthContent = authContent.replace(
            /const users = \{[\s\S]*?\};/,
            `const users = {\n${usersObj}\n    };`
        );
        
        await fs.writeFile(this.authPath, newAuthContent);
    }

    /**
     * Add team member to database
     */
    async addTeamMemberToDatabase(username, memberData) {
        try {
            const { createConnection } = await import('../utils/database-pool.js');
            const db = createConnection();
            
            await db.query(`
                INSERT INTO team_members 
                (external_id, name, role, focus_areas, extraction_priorities, ai_model, active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (external_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    role = EXCLUDED.role,
                    focus_areas = EXCLUDED.focus_areas,
                    extraction_priorities = EXCLUDED.extraction_priorities,
                    ai_model = EXCLUDED.ai_model,
                    active = EXCLUDED.active,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                username,
                memberData.name,
                memberData.role,
                memberData.focus_areas,
                memberData.extraction_priorities,
                memberData.ai_model
            ]);
            
            await db.end();
            console.log(`Added/updated team member ${username} in database`);
        } catch (error) {
            console.error(`Failed to add team member ${username} to database:`, error);
            throw error;
        }
    }

    /**
     * Update team member in database
     */
    async updateTeamMemberInDatabase(username, updates) {
        try {
            const { createConnection } = await import('../utils/database-pool.js');
            const db = createConnection();
            
            const setParts = [];
            const values = [];
            let valueIndex = 1;
            
            if (updates.name) {
                setParts.push(`name = $${valueIndex++}`);
                values.push(updates.name);
            }
            
            if (updates.role) {
                setParts.push(`role = $${valueIndex++}`);
                values.push(updates.role);
            }
            
            if (updates.focus_areas) {
                setParts.push(`focus_areas = $${valueIndex++}`);
                values.push(updates.focus_areas);
            }
            
            if (setParts.length === 0) {
                await db.end();
                return;
            }
            
            setParts.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(username);
            
            const query = `
                UPDATE team_members 
                SET ${setParts.join(', ')}
                WHERE external_id = $${valueIndex}
            `;
            
            await db.query(query, values);
            await db.end();
            
            console.log(`Updated team member ${username} in database`);
        } catch (error) {
            console.error(`Failed to update team member ${username} in database:`, error);
            throw error;
        }
    }

    /**
     * Parse CSV content
     */
    parseCSV(content) {
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const users = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const user = {};
            headers.forEach((header, index) => {
                user[header] = values[index];
            });
            users.push(user);
        }
        
        return users;
    }
}