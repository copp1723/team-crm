#!/usr/bin/env node

/**
 * Cleanup Maintenance Script
 * Ensures file organization standards are maintained
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

class CleanupMaintenance {
    constructor() {
        this.issues = [];
        this.cleaned = [];
    }

    async run() {
        logger.info('Starting cleanup maintenance...');
        
        try {
            await this.checkTemporaryFiles();
            await this.checkFileOrganization();
            await this.checkDuplicateFiles();
            await this.generateReport();
            
            logger.info('Cleanup maintenance completed', {
                issuesFound: this.issues.length,
                itemsCleaned: this.cleaned.length
            });
            
        } catch (error) {
            logger.error('Cleanup maintenance failed', { error });
            throw error;
        }
    }

    async checkTemporaryFiles() {
        logger.info('Checking for temporary files...');
        
        const tempPatterns = [
            '*.tmp',
            '*.temp',
            '*~',
            '*.bak',
            '*.log',
            '.DS_Store'
        ];
        
        for (const pattern of tempPatterns) {
            const files = await this.findFiles(projectRoot, pattern);
            for (const file of files) {
                // Skip node_modules and other excluded directories
                if (file.includes('node_modules') || file.includes('.git')) {
                    continue;
                }
                
                this.issues.push({
                    type: 'temporary_file',
                    file,
                    action: 'remove'
                });
                
                try {
                    await fs.unlink(file);
                    this.cleaned.push(file);
                    logger.info('Removed temporary file', { file });
                } catch (error) {
                    logger.warn('Failed to remove temporary file', { file, error: error.message });
                }
            }
        }
    }

    async checkFileOrganization() {
        logger.info('Checking file organization...');
        
        // Check for test files in root
        const rootFiles = await fs.readdir(projectRoot);
        for (const file of rootFiles) {
            if (file.startsWith('test-') && file.endsWith('.js')) {
                const fullPath = path.join(projectRoot, file);
                const targetPath = path.join(projectRoot, 'test', file);
                
                this.issues.push({
                    type: 'misplaced_test',
                    file: fullPath,
                    target: targetPath,
                    action: 'move'
                });
                
                try {
                    await fs.rename(fullPath, targetPath);
                    this.cleaned.push(`${fullPath} → ${targetPath}`);
                    logger.info('Moved test file to proper location', { from: fullPath, to: targetPath });
                } catch (error) {
                    logger.warn('Failed to move test file', { file: fullPath, error: error.message });
                }
            }
        }
        
        // Check for demo files in root
        for (const file of rootFiles) {
            if (file.startsWith('demo-') && file.endsWith('.js')) {
                const fullPath = path.join(projectRoot, file);
                const targetPath = path.join(projectRoot, 'test', 'examples', file);
                
                this.issues.push({
                    type: 'misplaced_demo',
                    file: fullPath,
                    target: targetPath,
                    action: 'move'
                });
                
                try {
                    await fs.rename(fullPath, targetPath);
                    this.cleaned.push(`${fullPath} → ${targetPath}`);
                    logger.info('Moved demo file to proper location', { from: fullPath, to: targetPath });
                } catch (error) {
                    logger.warn('Failed to move demo file', { file: fullPath, error: error.message });
                }
            }
        }
    }

    async checkDuplicateFiles() {
        logger.info('Checking for duplicate files...');
        
        // Check web-interface directory for duplicates
        const webInterfaceDir = path.join(projectRoot, 'web-interface');
        try {
            const files = await fs.readdir(webInterfaceDir);
            const duplicatePatterns = [
                { pattern: /-complex\.html$/, original: file => file.replace('-complex.html', '.html') },
                { pattern: /-old\.html$/, original: file => file.replace('-old.html', '.html') },
                { pattern: /-backup\.html$/, original: file => file.replace('-backup.html', '.html') }
            ];
            
            for (const file of files) {
                for (const { pattern, original } of duplicatePatterns) {
                    if (pattern.test(file)) {
                        const originalFile = original(file);
                        const originalPath = path.join(webInterfaceDir, originalFile);
                        const duplicatePath = path.join(webInterfaceDir, file);
                        
                        try {
                            await fs.access(originalPath);
                            // Original exists, remove duplicate
                            this.issues.push({
                                type: 'duplicate_file',
                                file: duplicatePath,
                                original: originalPath,
                                action: 'remove'
                            });
                            
                            await fs.unlink(duplicatePath);
                            this.cleaned.push(duplicatePath);
                            logger.info('Removed duplicate file', { duplicate: duplicatePath, original: originalPath });
                        } catch (error) {
                            // Original doesn't exist, keep the duplicate
                            logger.debug('Original file not found, keeping duplicate', { file: duplicatePath });
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn('Failed to check web-interface directory', { error: error.message });
        }
    }

    async findFiles(dir, pattern) {
        const files = [];
        
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip certain directories
                    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                        continue;
                    }
                    files.push(...await this.findFiles(fullPath, pattern));
                } else if (entry.isFile()) {
                    if (this.matchesPattern(entry.name, pattern)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            logger.warn('Failed to read directory', { dir, error: error.message });
        }
        
        return files;
    }

    matchesPattern(filename, pattern) {
        // Convert glob pattern to regex
        const regex = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        return new RegExp(`^${regex}$`).test(filename);
    }

    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalIssues: this.issues.length,
                itemsCleaned: this.cleaned.length,
                issueTypes: this.getIssueTypeCounts()
            },
            issues: this.issues,
            cleaned: this.cleaned
        };
        
        const reportPath = path.join(projectRoot, 'cleanup-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        logger.info('Cleanup report generated', { 
            reportPath,
            totalIssues: report.summary.totalIssues,
            itemsCleaned: report.summary.itemsCleaned
        });
        
        // Clean up the report file after a short delay (it's temporary)
        setTimeout(async () => {
            try {
                await fs.unlink(reportPath);
            } catch (error) {
                // Ignore errors when cleaning up report
            }
        }, 5000);
    }

    getIssueTypeCounts() {
        const counts = {};
        for (const issue of this.issues) {
            counts[issue.type] = (counts[issue.type] || 0) + 1;
        }
        return counts;
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const cleanup = new CleanupMaintenance();
    cleanup.run().catch(error => {
        console.error('Cleanup failed:', error);
        process.exit(1);
    });
}

export { CleanupMaintenance };