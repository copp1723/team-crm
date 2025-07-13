#!/usr/bin/env node

/**
 * MANAGE PERSONAL ASSISTANTS
 * Script to manage personal assistants for team members
 * - Create new assistants with Supermemory spaces
 * - Update assistant configurations
 * - View assistant status
 */

import { program } from 'commander';
import { db } from '../src/core/database/connection.js';
import { personalAssistantFactory } from '../src/core/agents/personal-assistant-factory.js';
import { config } from 'dotenv';
import chalk from 'chalk';

// Load environment variables
config();

program
    .name('manage-personal-assistants')
    .description('Manage personal assistants for team members')
    .version('1.0.0');

// Create assistant for a user
program
    .command('create <userId>')
    .description('Create a personal assistant for a team member')
    .option('-n, --name <name>', 'Assistant name')
    .action(async (userId, options) => {
        try {
            console.log(chalk.blue('Creating personal assistant...'));
            
            // Get member data
            const result = await db.query(
                'SELECT * FROM team_members WHERE id = $1 OR external_id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                console.error(chalk.red('Error: Team member not found'));
                process.exit(1);
            }
            
            const member = result.rows[0];
            console.log(chalk.gray(`Member: ${member.name} (${member.role})`));
            
            // Create assistant
            const assistant = await personalAssistantFactory.createAssistantForMember(
                member.id,
                member
            );
            
            console.log(chalk.green('✅ Personal assistant created successfully!'));
            console.log(chalk.gray(`Assistant ID: ${assistant.id}`));
            console.log(chalk.gray(`Supermemory Space: ${assistant.supermemoryConfig?.spaceId || 'None'}`));
            
            process.exit(0);
        } catch (error) {
            console.error(chalk.red('Error creating assistant:'), error.message);
            process.exit(1);
        }
    });

// List all assistants
program
    .command('list')
    .description('List all personal assistants')
    .action(async () => {
        try {
            const result = await db.query(`
                SELECT 
                    tm.id,
                    tm.external_id,
                    tm.name,
                    tm.role,
                    tm.active,
                    tm.supermemory_space_id,
                    pa.assistant_name,
                    pa.supermemory_collection_id,
                    pa.created_at as assistant_created
                FROM team_members tm
                LEFT JOIN personal_assistants pa ON tm.id = pa.member_id
                ORDER BY tm.name
            `);
            
            console.log(chalk.blue('\nPersonal Assistants Status:\n'));
            
            for (const row of result.rows) {
                const status = row.assistant_name ? chalk.green('✅') : chalk.yellow('⚠️');
                const supermemory = row.supermemory_collection_id ? chalk.green('Yes') : chalk.gray('No');
                
                console.log(`${status} ${chalk.bold(row.name)} (${row.external_id})`);
                console.log(`   Role: ${row.role}`);
                console.log(`   Active: ${row.active ? 'Yes' : 'No'}`);
                console.log(`   Assistant: ${row.assistant_name || chalk.gray('Not created')}`);
                console.log(`   Supermemory: ${supermemory}`);
                if (row.assistant_created) {
                    console.log(`   Created: ${new Date(row.assistant_created).toLocaleDateString()}`);
                }
                console.log();
            }
            
            process.exit(0);
        } catch (error) {
            console.error(chalk.red('Error listing assistants:'), error.message);
            process.exit(1);
        }
    });

// Update assistant configuration
program
    .command('update <userId>')
    .description('Update assistant configuration')
    .option('-l, --learning <preferences>', 'Update learning preferences (JSON)')
    .action(async (userId, options) => {
        try {
            console.log(chalk.blue('Updating assistant configuration...'));
            
            // Get member data
            const result = await db.query(
                'SELECT * FROM team_members WHERE id = $1 OR external_id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                console.error(chalk.red('Error: Team member not found'));
                process.exit(1);
            }
            
            const member = result.rows[0];
            const updates = {};
            
            if (options.learning) {
                try {
                    updates.learningPreferences = JSON.parse(options.learning);
                } catch (e) {
                    console.error(chalk.red('Error: Invalid JSON for learning preferences'));
                    process.exit(1);
                }
            }
            
            await personalAssistantFactory.updateAssistantConfig(member.id, updates);
            
            console.log(chalk.green('✅ Assistant configuration updated!'));
            process.exit(0);
        } catch (error) {
            console.error(chalk.red('Error updating assistant:'), error.message);
            process.exit(1);
        }
    });

// Test assistant
program
    .command('test <userId>')
    .description('Test a personal assistant with a sample update')
    .option('-u, --update <text>', 'Update text to process', 'Just closed a deal with Acme Corp for $50k/month!')
    .action(async (userId, options) => {
        try {
            console.log(chalk.blue('Testing personal assistant...'));
            
            // Get member data
            const result = await db.query(
                'SELECT * FROM team_members WHERE id = $1 OR external_id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                console.error(chalk.red('Error: Team member not found'));
                process.exit(1);
            }
            
            const member = result.rows[0];
            console.log(chalk.gray(`Testing assistant for: ${member.name}`));
            console.log(chalk.gray(`Update: "${options.update}"`));
            
            // Get or create assistant
            const assistant = await personalAssistantFactory.getAssistant(member.id);
            
            console.log(chalk.yellow('\nProcessing update...'));
            const startTime = Date.now();
            
            const result = await assistant.processUpdate(options.update);
            
            const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(chalk.green(`\n✅ Processed in ${processingTime}s\n`));
            
            console.log(chalk.bold('Extraction Results:'));
            console.log(JSON.stringify(result.extracted_data, null, 2));
            
            if (result.extracted_data.context?.has_supermemory) {
                console.log(chalk.green('\n✅ Supermemory is active for this assistant'));
            }
            
            process.exit(0);
        } catch (error) {
            console.error(chalk.red('Error testing assistant:'), error.message);
            process.exit(1);
        }
    });

// Active assistants
program
    .command('active')
    .description('Show currently active assistants in memory')
    .action(async () => {
        try {
            const activeAssistants = personalAssistantFactory.getActiveAssistants();
            
            console.log(chalk.blue('\nActive Assistants in Memory:\n'));
            
            if (activeAssistants.length === 0) {
                console.log(chalk.gray('No assistants currently active'));
            } else {
                for (const assistant of activeAssistants) {
                    console.log(`${chalk.green('●')} ${assistant.assistantName}`);
                    console.log(`   Member ID: ${assistant.memberId}`);
                    console.log(`   Last Activity: ${assistant.lastActivity?.toLocaleString() || 'Never'}`);
                    console.log();
                }
            }
            
            process.exit(0);
        } catch (error) {
            console.error(chalk.red('Error getting active assistants:'), error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}