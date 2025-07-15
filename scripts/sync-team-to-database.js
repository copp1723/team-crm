#!/usr/bin/env node

/**
 * Sync team members from config to database
 * Usage: node scripts/sync-team-to-database.js
 */

import { AdminAPI } from '../src/api/admin-api.js';
import { createConnection } from '../src/utils/database-pool.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function syncTeamToDatabase() {
    console.log('🔄 Syncing team members from config to database...');
    
    let db;
    
    try {
        // Load config
        const admin = new AdminAPI(path.join(__dirname, '../config/team-config.json'));
        const config = await admin.loadConfig();
        
        console.log(`📋 Found ${Object.keys(config.team.members).length} team members in config`);
        
        // Connect to database
        db = createConnection();
        await db.query('SELECT 1'); // Test connection
        console.log('✅ Database connected');
        
        let syncedCount = 0;
        let errorCount = 0;
        
        for (const [username, memberConfig] of Object.entries(config.team.members)) {
            try {
                console.log(`  Syncing ${memberConfig.name} (${username})...`);
                
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
                    memberConfig.name,
                    memberConfig.role,
                    memberConfig.focus_areas || ["dealer_relationships", "sales_activities"],
                    memberConfig.extraction_priorities || ["dealer_feedback", "meeting_notes", "action_items"],
                    memberConfig.ai_model || "claude-3-sonnet"
                ]);
                
                syncedCount++;
                console.log(`    ✅ ${memberConfig.name} synced`);
                
            } catch (error) {
                errorCount++;
                console.error(`    ❌ Error syncing ${memberConfig.name}:`, error.message);
            }
        }
        
        // Verify sync
        const result = await db.query('SELECT external_id, name, role FROM team_members WHERE active = true ORDER BY name');
        
        console.log('\n📊 Sync Results:');
        console.log(`  ✅ Successfully synced: ${syncedCount}`);
        console.log(`  ❌ Errors: ${errorCount}`);
        console.log(`  📋 Total in database: ${result.rows.length}`);
        
        console.log('\n👥 Team members in database:');
        result.rows.forEach(member => {
            console.log(`  - ${member.name} (${member.external_id}) - ${member.role}`);
        });
        
        console.log('\n✅ Team sync completed!');
        
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        process.exit(1);
    } finally {
        if (db) {
            await db.end();
        }
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    syncTeamToDatabase().catch(console.error);
}

export { syncTeamToDatabase };