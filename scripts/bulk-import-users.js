#!/usr/bin/env node

/**
 * Bulk User Import for Team CRM
 * 
 * Usage:
 *   node bulk-import-users.js users.csv
 * 
 * CSV Format:
 *   username,name,role,is_executive
 *   john,John Smith,Senior Sales Executive,no
 *   sarah,Sarah Johnson,Sales Manager,yes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'config', 'team-config.json');
const AUTH_PATH = path.join(__dirname, 'src', 'middleware', 'auth.js');

function generatePassword(length = 12) {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
}

async function parseCSV(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
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
    } catch (error) {
        console.error('Error reading CSV:', error.message);
        process.exit(1);
    }
}

async function bulkImport(csvPath) {
    const users = await parseCSV(csvPath);
    const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
    const passwords = {};
    
    console.log(`\nImporting ${users.length} users...\n`);
    
    for (const user of users) {
        const { username, name, role, is_executive } = user;
        
        if (!username || !name || !role) {
            console.error(`Skipping invalid entry: ${JSON.stringify(user)}`);
            continue;
        }
        
        // Generate password
        const password = generatePassword();
        passwords[username] = password;
        
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
        
        console.log(`✓ Added: ${name} (${username})`);
    }
    
    // Save config
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    // Update auth.js
    const authContent = await fs.readFile(AUTH_PATH, 'utf8');
    const usersObj = Object.keys(config.team.members).map(username => {
        return `        '${username}': process.env.${username.toUpperCase()}_PASSWORD || 'changeme${Math.random().toString(36).substr(2, 6)}'`;
    }).join(',\n');
    
    const newAuthContent = authContent.replace(
        /const users = \{[\s\S]*?\};/,
        `const users = {\n${usersObj}\n    };`
    );
    
    await fs.writeFile(AUTH_PATH, newAuthContent);
    
    // Generate credentials file
    const credentialsPath = path.join(__dirname, `credentials-${Date.now()}.txt`);
    let credentialsContent = 'TEAM CRM CREDENTIALS\n';
    credentialsContent += '====================\n\n';
    credentialsContent += 'Add these to your Render environment variables:\n\n';
    
    for (const [username, password] of Object.entries(passwords)) {
        credentialsContent += `${username.toUpperCase()}_PASSWORD=${password}\n`;
    }
    
    credentialsContent += '\n\nUser Credentials:\n';
    credentialsContent += '=================\n\n';
    
    for (const [username, password] of Object.entries(passwords)) {
        const user = config.team.members[username];
        credentialsContent += `${user.name}:\n`;
        credentialsContent += `  Username: ${username}\n`;
        credentialsContent += `  Password: ${password}\n`;
        credentialsContent += `  Role: ${user.role}\n`;
        credentialsContent += `  URL: https://team-crm.onrender.com/chat\n\n`;
    }
    
    await fs.writeFile(credentialsPath, credentialsContent);
    
    console.log(`\n✅ Import complete!`);
    console.log(`📄 Credentials saved to: ${credentialsPath}`);
    console.log(`\n⚠️  Remember to:`);
    console.log(`   1. Add environment variables to Render`);
    console.log(`   2. Securely share credentials with team members`);
    console.log(`   3. Delete the credentials file after use`);
}

// Create sample CSV
async function createSampleCSV() {
    const sample = `username,name,role,is_executive
john,John Smith,Senior Sales Executive,no
sarah,Sarah Johnson,Regional Sales Manager,yes
mike,Mike Davis,Sales Representative,no
lisa,Lisa Chen,VP of Sales,yes
tom,Tom Wilson,Account Executive,no`;
    
    await fs.writeFile('sample-users.csv', sample);
    console.log('✓ Created sample-users.csv');
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Team CRM Bulk User Import\n');
    console.log('Usage:');
    console.log('  node bulk-import-users.js <csv-file>');
    console.log('  node bulk-import-users.js --sample\n');
    console.log('CSV Format:');
    console.log('  username,name,role,is_executive');
    console.log('  john,John Smith,Senior Sales Executive,no');
    process.exit(0);
}

if (args[0] === '--sample') {
    createSampleCSV();
} else {
    bulkImport(args[0]);
}