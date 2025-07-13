#!/usr/bin/env node

/**
 * Initialize database and setup email addresses
 */

import { db } from './src/core/database/connection.js';

async function initializeAndSetup() {
    try {
        console.log('🚀 Initializing database and setting up email addresses...\n');
        
        // Initialize database connection
        console.log('📊 Initializing database...');
        await db.initialize();
        
        // Add test team members
        console.log('\n👥 Adding team members...');
        
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
        
        // Setup assistant email addresses
        console.log('\n📧 Setting up assistant email addresses...');
        
        const teamMembers = await db.query(`
            SELECT id, external_id, name, email, role, active
            FROM team_members 
            WHERE active = true
            ORDER BY name
        `);
        
        console.log(`Found ${teamMembers.rows.length} team members\n`);
        
        const domain = 'mail.teamcrm.ai';
        const results = [];
        
        for (const member of teamMembers.rows) {
            const assistantEmail = `${member.external_id}-assistant@${domain}`;
            
            console.log(`Setting up email for ${member.name} (${member.external_id})...`);
            console.log(`  Assistant email: ${assistantEmail}`);
            
            try {
                // Update or create personal assistant record
                const result = await db.query(`
                    INSERT INTO personal_assistants (
                        member_id, 
                        assistant_name,
                        assistant_email,
                        configuration,
                        created_at,
                        updated_at
                    ) VALUES ($1, $2, $3, $4, NOW(), NOW())
                    ON CONFLICT (member_id) 
                    DO UPDATE SET 
                        assistant_name = COALESCE(personal_assistants.assistant_name, $2),
                        assistant_email = $3,
                        configuration = COALESCE(personal_assistants.configuration, '{}') || $4,
                        updated_at = NOW()
                    RETURNING id
                `, [
                    member.id,
                    `${member.name}'s Assistant`,
                    assistantEmail,
                    JSON.stringify({
                        emailAddress: assistantEmail,
                        emailEnabled: true,
                        autoResponseEnabled: true,
                        forwardUrgentEmails: true,
                        setupDate: new Date().toISOString()
                    })
                ]);
                
                console.log(`  ✅ Setup completed for ${member.name}\n`);
                
                results.push({
                    member: member.name,
                    externalId: member.external_id,
                    assistantEmail,
                    success: true
                });
                
            } catch (error) {
                console.log(`  ❌ Failed to setup ${member.name}: ${error.message}\n`);
                
                results.push({
                    member: member.name,
                    externalId: member.external_id,
                    assistantEmail,
                    error: error.message,
                    success: false
                });
            }
        }
        
        // Display results
        console.log('\n📊 Setup Results Summary:');
        console.log('=' .repeat(50));
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        console.log(`✅ Successful: ${successful.length}`);
        console.log(`❌ Failed: ${failed.length}`);
        console.log(`📧 Total: ${results.length}\n`);
        
        if (successful.length > 0) {
            console.log('✅ Successfully created assistant emails:');
            successful.forEach(result => {
                console.log(`  • ${result.member} → ${result.assistantEmail}`);
            });
            console.log('');
        }
        
        if (failed.length > 0) {
            console.log('❌ Failed setups:');
            failed.forEach(result => {
                console.log(`  • ${result.member}: ${result.error}`);
            });
            console.log('');
        }
        
        console.log('📋 Next Steps:');
        console.log('  1. Configure your email service to route *-assistant@domain emails');
        console.log('  2. Set up the webhook endpoint: /api/email/assistant-webhook');
        console.log('  3. Test email delivery to the assistant addresses');
        console.log('  4. Configure bounce handling and spam filtering');
        
        console.log('\n✅ Email address setup completed successfully!');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

initializeAndSetup();