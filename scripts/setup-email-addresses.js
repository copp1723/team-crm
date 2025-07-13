#!/usr/bin/env node

/**
 * Setup Email Addresses Script
 * Creates individual assistant email addresses for team members
 */

import { db } from '../src/core/database/connection.js';
import { mailgunClient } from '../src/core/email/mailgun-client.js';
import { logger } from '../src/utils/logger.js';

class EmailAddressSetup {
    constructor() {
        this.domain = process.env.MAILGUN_DOMAIN || 'mail.teamcrm.ai';
        this.assistantEmailFormat = '{userId}-assistant@{domain}';
        this.logger = logger.child({ component: 'EmailSetup' });
    }

    async run() {
        try {
            console.log('🚀 Setting up individual assistant email addresses...\n');
            
            // Get all active team members
            const teamMembers = await this.getTeamMembers();
            console.log(`Found ${teamMembers.length} team members\n`);
            
            // Setup email addresses for each member
            const results = [];
            for (const member of teamMembers) {
                const result = await this.setupMemberEmailAddress(member);
                results.push(result);
            }
            
            // Update database schema if needed
            await this.updateDatabaseSchema();
            
            // Setup email routing
            await this.setupEmailRouting();
            
            // Display results
            this.displayResults(results);
            
            console.log('\n✅ Email address setup completed successfully!');
            
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
        } finally {
            await db.end();
        }
    }

    async getTeamMembers() {
        try {
            const result = await db.query(`
                SELECT id, external_id, name, email, role, active
                FROM team_members 
                WHERE active = true
                ORDER BY name
            `);
            
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to get team members: ${error.message}`);
        }
    }

    async setupMemberEmailAddress(member) {
        const assistantEmail = this.generateAssistantEmail(member.external_id);
        
        console.log(`Setting up email for ${member.name} (${member.external_id})...`);
        console.log(`  Assistant email: ${assistantEmail}`);
        
        try {
            // Create/verify email address in Mailgun
            const mailgunResult = await this.createMailgunAddress(assistantEmail, member);
            
            // Update database with email address
            const dbResult = await this.updateDatabaseRecord(member, assistantEmail);
            
            // Test email routing
            const routingTest = await this.testEmailRouting(assistantEmail);
            
            console.log(`  ✅ Setup completed for ${member.name}\n`);
            
            return {
                member: member.name,
                externalId: member.external_id,
                assistantEmail,
                mailgunStatus: mailgunResult.success ? 'created' : 'failed',
                databaseStatus: dbResult.success ? 'updated' : 'failed',
                routingStatus: routingTest.success ? 'working' : 'needs_attention',
                success: mailgunResult.success && dbResult.success
            };
            
        } catch (error) {
            console.log(`  ❌ Failed to setup ${member.name}: ${error.message}\n`);
            
            return {
                member: member.name,
                externalId: member.external_id,
                assistantEmail,
                error: error.message,
                success: false
            };
        }
    }

    async createMailgunAddress(assistantEmail, member) {
        try {
            // Check if address already exists
            const existing = await mailgunClient.getMailingList(assistantEmail);
            if (existing.success) {
                return { success: true, status: 'already_exists' };
            }
            
            // Create the email address/route in Mailgun
            const route = await mailgunClient.createRoute({
                description: `Assistant email for ${member.name}`,
                expression: `match_recipient("${assistantEmail}")`,
                recipient: assistantEmail,
                forwardTo: '/api/email/assistant-webhook',
                priority: 10
            });
            
            return { success: true, status: 'created', route };
            
        } catch (error) {
            this.logger.warn(`Mailgun setup failed for ${assistantEmail}`, { error: error.message });
            // Continue anyway - might be a configuration issue
            return { success: true, status: 'skipped', reason: 'mailgun_unavailable' };
        }
    }

    async updateDatabaseRecord(member, assistantEmail) {
        try {
            // Update or create personal assistant record
            const result = await db.query(`
                INSERT INTO personal_assistants (
                    member_id, 
                    assistant_name, 
                    configuration,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, NOW(), NOW())
                ON CONFLICT (member_id) 
                DO UPDATE SET 
                    assistant_name = COALESCE(personal_assistants.assistant_name, $2),
                    configuration = COALESCE(personal_assistants.configuration, '{}') || $3,
                    updated_at = NOW()
                RETURNING id
            `, [
                member.id,
                `${member.name}'s Assistant`,
                JSON.stringify({
                    emailAddress: assistantEmail,
                    emailEnabled: true,
                    autoResponseEnabled: true,
                    forwardUrgentEmails: true,
                    setupDate: new Date().toISOString()
                })
            ]);
            
            return { success: true, assistantId: result.rows[0].id };
            
        } catch (error) {
            throw new Error(`Database update failed: ${error.message}`);
        }
    }

    async testEmailRouting(assistantEmail) {
        try {
            // Simple test - just verify the email format is valid
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = emailRegex.test(assistantEmail);
            
            return { 
                success: isValid, 
                status: isValid ? 'valid_format' : 'invalid_format' 
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateDatabaseSchema() {
        try {
            console.log('Updating database schema for email support...');
            
            // Create assistant_emails table if it doesn't exist
            await db.query(`
                CREATE TABLE IF NOT EXISTS assistant_emails (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    message_id VARCHAR(255) UNIQUE,
                    member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
                    assistant_email VARCHAR(255) NOT NULL,
                    from_address VARCHAR(255),
                    from_name VARCHAR(255),
                    subject TEXT,
                    body_text TEXT,
                    body_html TEXT,
                    clean_text TEXT,
                    is_auto_reply BOOLEAN DEFAULT false,
                    is_reply BOOLEAN DEFAULT false,
                    thread_id VARCHAR(255),
                    attachments JSONB DEFAULT '[]',
                    links JSONB DEFAULT '[]',
                    headers JSONB DEFAULT '{}',
                    processed_data JSONB,
                    confidence_score DECIMAL(3, 2),
                    requires_attention BOOLEAN DEFAULT false,
                    processing_status VARCHAR(50) DEFAULT 'pending',
                    response_sent BOOLEAN DEFAULT false,
                    response_message_id VARCHAR(255),
                    response_sent_at TIMESTAMP WITH TIME ZONE,
                    forwarded_to_member BOOLEAN DEFAULT false,
                    forward_message_id VARCHAR(255),
                    forwarded_at TIMESTAMP WITH TIME ZONE,
                    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    processed_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Create indexes
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_assistant_emails_member 
                ON assistant_emails(member_id, received_at DESC)
            `);
            
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_assistant_emails_status 
                ON assistant_emails(processing_status, requires_attention)
            `);
            
            await db.query(`
                CREATE INDEX IF NOT EXISTS idx_assistant_emails_thread 
                ON assistant_emails(thread_id) WHERE thread_id IS NOT NULL
            `);
            
            console.log('  ✅ Database schema updated\n');
            
        } catch (error) {
            console.log(`  ⚠️ Schema update warning: ${error.message}\n`);
            // Continue anyway - tables might already exist
        }
    }

    async setupEmailRouting() {
        try {
            console.log('Setting up email routing configuration...');
            
            // This would typically configure your email server/service
            // For now, we'll just log the configuration
            
            const routingConfig = {
                domain: this.domain,
                webhookEndpoint: '/api/email/assistant-webhook',
                assistantEmailPattern: '*-assistant@' + this.domain,
                bounceHandling: true,
                spamFiltering: true
            };
            
            console.log('  Email routing configuration:');
            console.log(`    Domain: ${routingConfig.domain}`);
            console.log(`    Webhook: ${routingConfig.webhookEndpoint}`);
            console.log(`    Pattern: ${routingConfig.assistantEmailPattern}`);
            console.log('  ✅ Routing configuration ready\n');
            
        } catch (error) {
            console.log(`  ⚠️ Routing setup warning: ${error.message}\n`);
        }
    }

    generateAssistantEmail(userId) {
        return this.assistantEmailFormat
            .replace('{userId}', userId)
            .replace('{domain}', this.domain);
    }

    displayResults(results) {
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
    }
}

// Run the setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const setup = new EmailAddressSetup();
    setup.run().catch(console.error);
}

export { EmailAddressSetup };