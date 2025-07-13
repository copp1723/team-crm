#!/usr/bin/env node

/**
 * Team CRM Cleanup Script
 * Safely removes duplicate files and archives
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// Files and directories to remove
const CLEANUP_TARGETS = {
    directories: [
        'archive',
        'docs-archive',
        'web-interface/archive'
    ],
    files: [
        'src/core/agents/personal-assistant.js',
        'src/core/agents/simple-personal-assistant.js',
        'src/core/agents/simple-master-agent.js',
        'web-interface/enhanced-chat.html',
        'web-interface/executive-dashboard-complex.html'
    ],
    moveToTest: [
        'test-api.js',
        'test-ux.js',
        'tone-test.js'
    ]
};

async function cleanup() {
    console.log('🧹 Starting Team CRM Cleanup...\n');
    
    let removedCount = 0;
    let movedCount = 0;
    
    // Remove directories
    console.log('📁 Removing archive directories...');
    for (const dir of CLEANUP_TARGETS.directories) {
        const fullPath = path.join(rootDir, dir);
        try {
            await fs.rm(fullPath, { recursive: true, force: true });
            console.log(`  ✓ Removed ${dir}`);
            removedCount++;
        } catch (error) {
            console.log(`  ✗ Could not remove ${dir}: ${error.message}`);
        }
    }
    
    // Remove duplicate files
    console.log('\n📄 Removing duplicate files...');
    for (const file of CLEANUP_TARGETS.files) {
        const fullPath = path.join(rootDir, file);
        try {
            await fs.unlink(fullPath);
            console.log(`  ✓ Removed ${file}`);
            removedCount++;
        } catch (error) {
            console.log(`  ✗ Could not remove ${file}: ${error.message}`);
        }
    }
    
    // Move test files
    console.log('\n🚚 Moving test files...');
    const testDir = path.join(rootDir, 'test');
    
    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true });
    
    for (const file of CLEANUP_TARGETS.moveToTest) {
        const sourcePath = path.join(rootDir, file);
        const destPath = path.join(testDir, file);
        try {
            await fs.rename(sourcePath, destPath);
            console.log(`  ✓ Moved ${file} to test/`);
            movedCount++;
        } catch (error) {
            console.log(`  ✗ Could not move ${file}: ${error.message}`);
        }
    }
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Removed: ${removedCount} items`);
    console.log(`   Moved: ${movedCount} files`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Run tests to ensure nothing broke`);
    console.log(`   2. Commit changes: git add -A && git commit -m "chore: Clean up duplicate files and archives"`);
    console.log(`   3. Push to remote: git push origin main\n`);
}

// Prompt for confirmation
async function confirmCleanup() {
    console.log('⚠️  This will permanently delete files and directories.');
    console.log('Make sure you have committed any important changes!\n');
    console.log('Files to be removed:');
    console.log('- All archive directories');
    console.log('- Duplicate agent implementations');
    console.log('- Duplicate UI files\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question('Continue with cleanup? (yes/no): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

// Run cleanup with confirmation
async function main() {
    const confirmed = await confirmCleanup();
    
    if (confirmed) {
        await cleanup();
    } else {
        console.log('\n❌ Cleanup cancelled.');
    }
}

main().catch(console.error);