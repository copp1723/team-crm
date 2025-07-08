#!/usr/bin/env node

/**
 * Team CRM - User Management Script
 * 
 * Usage:
 *   node manage-users.js add <username> <name> <role>
 *   node manage-users.js list
 *   node manage-users.js remove <username>
 *   node manage-users.js set-executive <username>
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'team-config.json');
const AUTH_PATH = path.join(__dirname, '..', 'src', 'middleware', 'auth.js');
const ENV_PATH = path.join(__dirname, '..', '.env');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function generatePassword(length = 12) {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
}

async function loadConfig() {
    try {
        const configData = await fs.readFile(CONFIG_PATH, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error(`${colors.red}Error loading config:${colors.reset}`, error.message);
        process.exit(1);
    }
}

async function saveConfig(config) {
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log(`${colors.green}✓ Config updated${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}Error saving config:${colors.reset}`, error.message);
        process.exit(1);
    }
}

async function updateAuthFile(users) {
    try {
        const authContent = await fs.readFile(AUTH_PATH, 'utf8');
        
        // Build new users object
        const usersObj = Object.keys(users).map(username => {
            return `        '${username}': process.env.${username.toUpperCase()}_PASSWORD || 'changeme${Math.random().toString(36).substr(2, 6)}'`;
        }).join(',\n');
        
        // Replace the users object in auth.js
        const newAuthContent = authContent.replace(
            /const users = \{[\s\S]*?\};/,
            `const users = {\n${usersObj}\n    };`
        );
        
        await fs.writeFile(AUTH_PATH, newAuthContent);
        console.log(`${colors.green}✓ Auth file updated${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}Error updating auth file:${colors.reset}`, error.message);
    }
}

async function updateEnvFile(username, password) {
    try {
        let envContent = '';
        try {
            envContent = await fs.readFile(ENV_PATH, 'utf8');
        } catch (e) {
            // .env might not exist
        }
        
        const envKey = `${username.toUpperCase()}_PASSWORD`;
        
        if (envContent.includes(envKey)) {
            // Update existing
            envContent = envContent.replace(
                new RegExp(`^${envKey}=.*$`, 'm'),
                `${envKey}=${password}`
            );
        } else {
            // Add new
            envContent += `\n${envKey}=${password}`;
        }
        
        await fs.writeFile(ENV_PATH, envContent.trim() + '\n');
        console.log(`${colors.green}✓ Environment variable added${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}Error updating .env:${colors.reset}`, error.message);
    }
}

async function addUser(username, name, role) {
    const config = await loadConfig();
    
    // Check if user already exists
    if (config.team.members[username]) {
        console.error(`${colors.red}User '${username}' already exists!${colors.reset}`);
        return;
    }
    
    // Generate a secure password
    const password = generatePassword();
    
    // Add to team members
    config.team.members[username] = {
        id: username,
        name: name,
        role: role,
        focus_areas: ["dealer_relationships", "sales_activities"],
        extraction_priorities: ["dealer_feedback", "meeting_notes", "action_items"],
        ai_model: "claude-3-sonnet"
    };
    
    // Save config
    await saveConfig(config);
    
    // Update auth.js
    await updateAuthFile(config.team.members);
    
    // Update .env
    await updateEnvFile(username, password);
    
    console.log(`\n${colors.bright}${colors.green}User added successfully!${colors.reset}`);
    console.log(`${colors.cyan}Username:${colors.reset} ${username}`);
    console.log(`${colors.cyan}Name:${colors.reset} ${name}`);
    console.log(`${colors.cyan}Role:${colors.reset} ${role}`);
    console.log(`${colors.cyan}Password:${colors.reset} ${password}`);
    console.log(`\n${colors.yellow}⚠️  Save this password securely and share with ${name}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Update the password in Render environment variables${colors.reset}`);
}

async function listUsers() {
    const config = await loadConfig();
    
    console.log(`\n${colors.bright}Team Members:${colors.reset}`);
    console.log('─'.repeat(60));
    
    Object.entries(config.team.members).forEach(([username, member]) => {
        console.log(`${colors.cyan}${username}${colors.reset} - ${member.name} (${member.role})`);
    });
    
    console.log(`\n${colors.bright}Executives:${colors.reset}`);
    console.log('─'.repeat(60));
    
    config.team.executives.forEach(exec => {
        console.log(`${colors.cyan}${exec.id}${colors.reset} - ${exec.name} (${exec.role})`);
    });
}

async function removeUser(username) {
    const config = await loadConfig();
    
    if (!config.team.members[username]) {
        console.error(`${colors.red}User '${username}' not found!${colors.reset}`);
        return;
    }
    
    // Confirm deletion
    console.log(`${colors.yellow}Are you sure you want to remove user '${username}'? (yes/no)${colors.reset}`);
    
    process.stdin.once('data', async (data) => {
        if (data.toString().trim().toLowerCase() === 'yes') {
            delete config.team.members[username];
            await saveConfig(config);
            await updateAuthFile(config.team.members);
            console.log(`${colors.green}✓ User '${username}' removed${colors.reset}`);
        } else {
            console.log('Cancelled');
        }
        process.exit(0);
    });
}

async function setExecutive(username) {
    const config = await loadConfig();
    
    // Check if user exists in members
    const member = config.team.members[username];
    if (!member) {
        console.error(`${colors.red}User '${username}' not found!${colors.reset}`);
        return;
    }
    
    // Check if already an executive
    const isExec = config.team.executives.some(e => e.id === username);
    if (isExec) {
        console.log(`${colors.yellow}${member.name} is already an executive${colors.reset}`);
        return;
    }
    
    // Add to executives
    config.team.executives.push({
        id: username,
        name: member.name,
        role: member.role,
        summary_style: "strategic_focus",
        priority_areas: ["team_performance", "deal_pipeline", "strategic_decisions"],
        ai_model: "claude-3-opus"
    });
    
    await saveConfig(config);
    
    console.log(`${colors.green}✓ ${member.name} now has executive access${colors.reset}`);
}

// Interactive mode
async function interactiveMode() {
    console.log(`${colors.bright}Team CRM User Management${colors.reset}`);
    console.log('─'.repeat(30));
    console.log('1. Add new user');
    console.log('2. List all users');
    console.log('3. Remove user');
    console.log('4. Grant executive access');
    console.log('5. Exit');
    console.log('\nSelect an option (1-5): ');
    
    process.stdin.once('data', async (data) => {
        const choice = data.toString().trim();
        
        switch(choice) {
            case '1':
                console.log('\nEnter username: ');
                const username = await getInput();
                console.log('Enter full name: ');
                const name = await getInput();
                console.log('Enter role: ');
                const role = await getInput();
                await addUser(username, name, role);
                break;
                
            case '2':
                await listUsers();
                break;
                
            case '3':
                console.log('\nEnter username to remove: ');
                const userToRemove = await getInput();
                await removeUser(userToRemove);
                break;
                
            case '4':
                console.log('\nEnter username to grant executive access: ');
                const userToPromote = await getInput();
                await setExecutive(userToPromote);
                break;
                
            case '5':
                process.exit(0);
                
            default:
                console.log(`${colors.red}Invalid option${colors.reset}`);
                process.exit(1);
        }
    });
}

function getInput() {
    return new Promise((resolve) => {
        process.stdin.once('data', (data) => {
            resolve(data.toString().trim());
        });
    });
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    interactiveMode();
} else {
    const command = args[0];
    
    switch(command) {
        case 'add':
            if (args.length < 4) {
                console.error(`${colors.red}Usage: node manage-users.js add <username> <name> <role>${colors.reset}`);
                process.exit(1);
            }
            addUser(args[1], args[2], args.slice(3).join(' '));
            break;
            
        case 'list':
            listUsers();
            break;
            
        case 'remove':
            if (args.length < 2) {
                console.error(`${colors.red}Usage: node manage-users.js remove <username>${colors.reset}`);
                process.exit(1);
            }
            removeUser(args[1]);
            break;
            
        case 'set-executive':
            if (args.length < 2) {
                console.error(`${colors.red}Usage: node manage-users.js set-executive <username>${colors.reset}`);
                process.exit(1);
            }
            setExecutive(args[1]);
            break;
            
        default:
            console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
            console.log('\nAvailable commands:');
            console.log('  add <username> <name> <role>');
            console.log('  list');
            console.log('  remove <username>');
            console.log('  set-executive <username>');
            process.exit(1);
    }
}