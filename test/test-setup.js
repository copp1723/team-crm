#!/usr/bin/env node

/**
 * Test setup for email addresses
 */

import { db } from './src/core/database/connection.js';
import { EmailAddressSetup } from './scripts/setup-email-addresses.js';

async function testSetup() {
    try {
        console.log('🧪 Testing email address setup...\n');
        
        // First, let's add some test team members if they don't exist
        console.log('Adding test team members...');
        
        const testMembers = [
            { external_id: 'joe', name: 'Joe Martinez', role: 'Sales Director', email: 'joe@company.com' },
            { external_id: 'charlie', name: 'Charlie Chen', role: 'Business Development', email: 'charlie@company.com' }
        ];
        
        for (const member of testMembers) {
            try {
                await db.query(`
                    INSERT INTO team_members (external_id, name, role, email, active)
                    VALUES ($1, $2, $3, $4, true)
                    ON CONFLICT (external_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        role = EXCLUDED.role,
                        email = EXCLUDED.email,
                        updated_at = CURRENT_TIMESTAMP
                `, [member.external_id, member.name, member.role, member.email]);
                
                console.log(`  ✅ Added/updated ${member.name}`);
            } catch (error) {
                console.log(`  ⚠️ Error with ${member.name}: ${error.message}`);
            }
        }
        
        console.log('\n📧 Setting up email addresses...\n');
        
        // Now run the email setup
        const setup = new EmailAddressSetup();
        await setup.run();
        
    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
        process.exit(1);
    }
}

testSetup();