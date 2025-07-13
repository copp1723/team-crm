/**
 * File Processor
 * Unified interface for processing multiple file formats
 * Supports: PDF, Word, Excel, CSV, Text files
 */

import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '../../utils/logger.js';
import { PDFParser } from './pdf-parser.js';

// For production, you'd install these packages:
// npm install mammoth xlsx csv-parser
// import mammoth from 'mammoth';
// import xlsx from 'xlsx';
// import csv from 'csv-parser';

export class FileProcessor {
    constructor(options = {}) {
        this.logger = logger.child({ component: 'FileProcessor' });
        
        this.config = {
            maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
            tempDir: options.tempDir || '/tmp/file-processing',
            cleanupTemp: options.cleanupTemp !== false,
            extractImages: options.extractImages || false,
            preserveFormatting: options.preserveFormatting !== false,
            ocrEnabled: options.ocrEnabled || false
        };
        
        // Initialize processors
        this.processors = {
            pdf: new PDFParser({
                ...this.config,
                maxFileSize: 50 * 1024 * 1024 // 50MB for PDFs
            }),
            word: this.createWordProcessor(),
            excel: this.createExcelProcessor(),
            csv: this.createCSVProcessor(),
            text: this.createTextProcessor()
        };
        
        // Supported file extensions
        this.supportedFormats = {
            pdf: ['.pdf'],
            word: ['.doc', '.docx', '.odt'],
            excel: ['.xls', '.xlsx', '.ods'],
            csv: ['.csv', '.tsv'],
            text: ['.txt', '.md', '.rtf', '.log']
        };
        
        // Statistics
        this.stats = {
            totalProcessed: 0,
            byFormat: {},
            totalErrors: 0,
            averageProcessTime: 0
        };
    }
    
    /**
     * Process a file based on its type
     */
    async processFile(filePath, options = {}) {
        const startTime = Date.now();
        const processId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.logger.info('Starting file processing', {
                processId,
                filePath,
                fileSize: await this.getFileSize(filePath)
            });
            
            // Validate file
            await this.validateFile(filePath);
            
            // Detect file type
            const fileType = this.detectFileType(filePath);
            
            // Process based on type
            let result;
            switch (fileType) {
                case 'pdf':
                    result = await this.processors.pdf.parse(filePath, options);
                    break;
                    
                case 'word':
                    result = await this.processWordDocument(filePath, options);
                    break;
                    
                case 'excel':
                    result = await this.processExcelFile(filePath, options);
                    break;
                    
                case 'csv':
                    result = await this.processCSVFile(filePath, options);
                    break;
                    
                case 'text':
                    result = await this.processTextFile(filePath, options);
                    break;
                    
                default:
                    throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
            }
            
            // Add metadata
            result.fileInfo = {
                processId,
                filePath,
                fileName: path.basename(filePath),
                fileType,
                fileSize: await this.getFileSize(filePath),
                processTime: Date.now() - startTime
            };
            
            // Update statistics
            this.updateStats(fileType, result.fileInfo.processTime);
            
            this.logger.info('File processing completed', {
                processId,
                fileType,
                processTime: result.fileInfo.processTime
            });
            
            return result;
            
        } catch (error) {
            this.stats.totalErrors++;
            this.logger.error('File processing failed', {
                processId,
                error: error.message,
                filePath
            });
            
            return {
                success: false,
                processId,
                error: error.message,
                fileInfo: {
                    filePath,
                    fileName: path.basename(filePath)
                }
            };
        }
    }
    
    /**
     * Process Word documents
     */
    async processWordDocument(filePath, options) {
        try {
            // In production, use mammoth library
            // const result = await mammoth.extractRawText({ path: filePath });
            // const textResult = await mammoth.convertToHtml({ path: filePath });
            
            // Simulated Word processing
            const fileBuffer = await fs.readFile(filePath);
            
            // Simulated extraction
            const result = {
                success: true,
                content: {
                    text: this.generateSampleWordText(),
                    html: null,
                    messages: []
                },
                metadata: {
                    title: 'Sample Word Document',
                    author: 'Team Member',
                    created: new Date(),
                    modified: new Date(),
                    wordCount: 450
                },
                structuredData: {
                    sections: [],
                    tables: [],
                    lists: [],
                    images: []
                }
            };
            
            // Extract structured data
            result.structuredData = await this.extractWordStructure(result.content.text);
            
            // Analyze content
            result.analysis = await this.analyzeDocumentContent(result.content.text, result.structuredData);
            
            return result;
            
        } catch (error) {
            throw new Error(`Failed to process Word document: ${error.message}`);
        }
    }
    
    /**
     * Process Excel files
     */
    async processExcelFile(filePath, options) {
        try {
            // In production, use xlsx library
            // const workbook = xlsx.readFile(filePath);
            // const sheets = {};
            // workbook.SheetNames.forEach(sheetName => {
            //     sheets[sheetName] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            // });
            
            // Simulated Excel processing
            const result = {
                success: true,
                content: {
                    sheets: {
                        'Sheet1': [
                            { 'Dealer': 'Acme Motors', 'Revenue': 125000, 'Units': 25, 'Status': 'Active' },
                            { 'Dealer': 'City Auto', 'Revenue': 98000, 'Units': 18, 'Status': 'Pilot' },
                            { 'Dealer': 'Metro Cars', 'Revenue': 156000, 'Units': 31, 'Status': 'Active' }
                        ],
                        'Metrics': [
                            { 'Month': 'January', 'Total Revenue': 379000, 'New Dealers': 3 },
                            { 'Month': 'February', 'Total Revenue': 425000, 'New Dealers': 5 }
                        ]
                    },
                    summary: null
                },
                metadata: {
                    sheetCount: 2,
                    totalRows: 5,
                    totalColumns: 7,
                    created: new Date(),
                    modified: new Date()
                },
                analysis: null
            };
            
            // Analyze data
            result.analysis = await this.analyzeSpreadsheetData(result.content.sheets);
            
            // Generate summary
            result.content.summary = this.generateSpreadsheetSummary(result.content.sheets, result.analysis);
            
            return result;
            
        } catch (error) {
            throw new Error(`Failed to process Excel file: ${error.message}`);
        }
    }
    
    /**
     * Process CSV files
     */
    async processCSVFile(filePath, options) {
        try {
            const rows = [];
            const headers = [];
            let isFirstRow = true;
            
            // In production, use csv-parser
            // await pipeline(
            //     createReadStream(filePath),
            //     csv(),
            //     async function* (source) {
            //         for await (const row of source) {
            //             rows.push(row);
            //         }
            //     }
            // );
            
            // Simulated CSV processing
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim());
            
            // Parse headers
            if (lines.length > 0) {
                headers.push(...lines[0].split(',').map(h => h.trim()));
            }
            
            // Parse rows
            for (let i = 1; i < Math.min(lines.length, 100); i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                rows.push(row);
            }
            
            const result = {
                success: true,
                content: {
                    headers,
                    rows,
                    rowCount: rows.length,
                    columnCount: headers.length
                },
                metadata: {
                    encoding: 'utf-8',
                    delimiter: ',',
                    hasHeaders: true
                },
                analysis: null
            };
            
            // Analyze CSV data
            result.analysis = await this.analyzeCSVData(headers, rows);
            
            return result;
            
        } catch (error) {
            throw new Error(`Failed to process CSV file: ${error.message}`);
        }
    }
    
    /**
     * Process text files
     */
    async processTextFile(filePath, options) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            
            const result = {
                success: true,
                content: {
                    text: content,
                    lines: content.split('\n').length,
                    words: content.split(/\s+/).filter(w => w).length,
                    characters: content.length
                },
                metadata: {
                    encoding: 'utf-8',
                    format: path.extname(filePath)
                },
                structuredData: null,
                analysis: null
            };
            
            // Extract structure for markdown files
            if (path.extname(filePath) === '.md') {
                result.structuredData = this.extractMarkdownStructure(content);
            }
            
            // Analyze content
            result.analysis = await this.analyzeTextContent(content);
            
            return result;
            
        } catch (error) {
            throw new Error(`Failed to process text file: ${error.message}`);
        }
    }
    
    /**
     * Helper processors
     */
    
    createWordProcessor() {
        return {
            name: 'word',
            extensions: ['.doc', '.docx', '.odt'],
            process: async (filePath, options) => {
                return await this.processWordDocument(filePath, options);
            }
        };
    }
    
    createExcelProcessor() {
        return {
            name: 'excel',
            extensions: ['.xls', '.xlsx', '.ods'],
            process: async (filePath, options) => {
                return await this.processExcelFile(filePath, options);
            }
        };
    }
    
    createCSVProcessor() {
        return {
            name: 'csv',
            extensions: ['.csv', '.tsv'],
            process: async (filePath, options) => {
                return await this.processCSVFile(filePath, options);
            }
        };
    }
    
    createTextProcessor() {
        return {
            name: 'text',
            extensions: ['.txt', '.md', '.rtf', '.log'],
            process: async (filePath, options) => {
                return await this.processTextFile(filePath, options);
            }
        };
    }
    
    /**
     * Analysis methods
     */
    
    async extractWordStructure(text) {
        const structure = {
            sections: [],
            paragraphs: [],
            lists: [],
            tables: []
        };
        
        // Split into paragraphs
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
        structure.paragraphs = paragraphs.map((p, i) => ({
            index: i,
            text: p.trim(),
            wordCount: p.split(/\s+/).length
        }));
        
        // Extract headings
        const headingPattern = /^(Chapter|Section|Part)\s+\d+[:\.]?\s*(.*)$/mi;
        text.split('\n').forEach((line, index) => {
            const match = line.match(headingPattern);
            if (match) {
                structure.sections.push({
                    level: match[1],
                    title: match[2] || line,
                    lineNumber: index + 1
                });
            }
        });
        
        return structure;
    }
    
    async analyzeDocumentContent(text, structuredData) {
        const analysis = {
            documentType: 'document',
            summary: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
            keyPhrases: [],
            sentiment: 'neutral',
            readability: 0,
            entities: []
        };
        
        // Document type detection
        const lowerText = text.toLowerCase();
        if (lowerText.includes('proposal')) {
            analysis.documentType = 'proposal';
        } else if (lowerText.includes('contract') || lowerText.includes('agreement')) {
            analysis.documentType = 'contract';
        } else if (lowerText.includes('report')) {
            analysis.documentType = 'report';
        }
        
        // Extract key phrases (simple frequency analysis)
        const words = text.toLowerCase().split(/\s+/);
        const wordFreq = {};
        words.forEach(word => {
            if (word.length > 5 && !this.isCommonWord(word)) {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });
        
        analysis.keyPhrases = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ phrase: word, count }));
        
        return analysis;
    }
    
    async analyzeSpreadsheetData(sheets) {
        const analysis = {
            dataTypes: {},
            summary: {},
            totals: {},
            trends: []
        };
        
        for (const [sheetName, rows] of Object.entries(sheets)) {
            if (!Array.isArray(rows) || rows.length === 0) continue;
            
            // Analyze column types
            const columns = Object.keys(rows[0]);
            analysis.dataTypes[sheetName] = {};
            
            columns.forEach(col => {
                const values = rows.map(row => row[col]).filter(v => v !== null && v !== undefined);
                const types = values.map(v => {
                    if (typeof v === 'number') return 'number';
                    if (typeof v === 'boolean') return 'boolean';
                    if (typeof v === 'string') {
                        if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'date';
                        if (/^\$?[\d,]+\.?\d*$/.test(v)) return 'currency';
                        if (/^\d+%$/.test(v)) return 'percentage';
                    }
                    return 'text';
                });
                
                // Most common type
                const typeCounts = types.reduce((acc, type) => {
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {});
                
                analysis.dataTypes[sheetName][col] = Object.entries(typeCounts)
                    .sort((a, b) => b[1] - a[1])[0][0];
            });
            
            // Calculate totals for numeric columns
            analysis.totals[sheetName] = {};
            columns.forEach(col => {
                if (analysis.dataTypes[sheetName][col] === 'number' || 
                    analysis.dataTypes[sheetName][col] === 'currency') {
                    const values = rows.map(row => {
                        const val = row[col];
                        if (typeof val === 'number') return val;
                        if (typeof val === 'string') {
                            const num = parseFloat(val.replace(/[$,]/g, ''));
                            return isNaN(num) ? 0 : num;
                        }
                        return 0;
                    });
                    
                    analysis.totals[sheetName][col] = {
                        sum: values.reduce((a, b) => a + b, 0),
                        avg: values.reduce((a, b) => a + b, 0) / values.length,
                        min: Math.min(...values),
                        max: Math.max(...values),
                        count: values.length
                    };
                }
            });
        }
        
        return analysis;
    }
    
    generateSpreadsheetSummary(sheets, analysis) {
        const summary = [];
        
        for (const [sheetName, totals] of Object.entries(analysis.totals)) {
            const sheetSummary = [`Sheet: ${sheetName}`];
            
            for (const [column, stats] of Object.entries(totals)) {
                if (stats.sum > 0) {
                    sheetSummary.push(
                        `${column}: Total=${stats.sum.toLocaleString()}, ` +
                        `Avg=${stats.avg.toFixed(2)}, ` +
                        `Range=${stats.min}-${stats.max}`
                    );
                }
            }
            
            summary.push(sheetSummary.join('\n'));
        }
        
        return summary.join('\n\n');
    }
    
    async analyzeCSVData(headers, rows) {
        const analysis = {
            structure: {
                totalRows: rows.length,
                totalColumns: headers.length,
                headers: headers
            },
            dataQuality: {
                completeness: 0,
                duplicates: 0,
                emptyValues: 0
            },
            columnStats: {}
        };
        
        // Calculate data quality metrics
        let totalCells = rows.length * headers.length;
        let emptyCells = 0;
        
        rows.forEach(row => {
            headers.forEach(header => {
                if (!row[header] || row[header].toString().trim() === '') {
                    emptyCells++;
                }
            });
        });
        
        analysis.dataQuality.completeness = ((totalCells - emptyCells) / totalCells * 100).toFixed(2);
        analysis.dataQuality.emptyValues = emptyCells;
        
        // Check for duplicates (based on all columns)
        const rowStrings = rows.map(row => JSON.stringify(row));
        const uniqueRows = new Set(rowStrings);
        analysis.dataQuality.duplicates = rows.length - uniqueRows.size;
        
        // Analyze each column
        headers.forEach(header => {
            const values = rows.map(row => row[header]).filter(v => v);
            const uniqueValues = new Set(values);
            
            analysis.columnStats[header] = {
                uniqueCount: uniqueValues.size,
                emptyCount: rows.length - values.length,
                sampleValues: Array.from(uniqueValues).slice(0, 5)
            };
        });
        
        return analysis;
    }
    
    extractMarkdownStructure(content) {
        const structure = {
            headings: [],
            codeBlocks: [],
            lists: [],
            links: [],
            images: []
        };
        
        const lines = content.split('\n');
        
        // Extract headings
        lines.forEach((line, index) => {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                structure.headings.push({
                    level: headingMatch[1].length,
                    text: headingMatch[2],
                    lineNumber: index + 1
                });
            }
        });
        
        // Extract code blocks
        const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(content)) !== null) {
            structure.codeBlocks.push({
                language: match[1] || 'plain',
                code: match[2],
                position: match.index
            });
        }
        
        // Extract links
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        while ((match = linkRegex.exec(content)) !== null) {
            structure.links.push({
                text: match[1],
                url: match[2]
            });
        }
        
        // Extract images
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        while ((match = imageRegex.exec(content)) !== null) {
            structure.images.push({
                alt: match[1],
                url: match[2]
            });
        }
        
        return structure;
    }
    
    async analyzeTextContent(text) {
        const analysis = {
            language: 'en',
            sentiment: 'neutral',
            readability: 0,
            summary: '',
            topics: [],
            statistics: {
                sentences: 0,
                avgWordsPerSentence: 0,
                avgCharsPerWord: 0
            }
        };
        
        // Basic text statistics
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const words = text.split(/\s+/).filter(w => w);
        const totalChars = text.replace(/\s/g, '').length;
        
        analysis.statistics.sentences = sentences.length;
        analysis.statistics.avgWordsPerSentence = sentences.length > 0 ? 
            (words.length / sentences.length).toFixed(1) : 0;
        analysis.statistics.avgCharsPerWord = words.length > 0 ? 
            (totalChars / words.length).toFixed(1) : 0;
        
        // Generate summary (first 300 chars)
        analysis.summary = text.substring(0, 300).trim();
        if (text.length > 300) {
            const lastSpace = analysis.summary.lastIndexOf(' ');
            if (lastSpace > 200) {
                analysis.summary = analysis.summary.substring(0, lastSpace) + '...';
            }
        }
        
        // Simple readability score (Flesch Reading Ease approximation)
        const syllableCount = words.reduce((count, word) => 
            count + this.countSyllables(word), 0);
        
        if (sentences.length > 0 && words.length > 0) {
            analysis.readability = Math.max(0, Math.min(100,
                206.835 - 1.015 * (words.length / sentences.length) - 
                84.6 * (syllableCount / words.length)
            )).toFixed(1);
        }
        
        return analysis;
    }
    
    /**
     * Utility methods
     */
    
    detectFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        for (const [type, extensions] of Object.entries(this.supportedFormats)) {
            if (extensions.includes(ext)) {
                return type;
            }
        }
        
        return 'unknown';
    }
    
    async validateFile(filePath) {
        // Check file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            throw new Error('File not found');
        }
        
        // Check file size
        const stats = await fs.stat(filePath);
        if (stats.size > this.config.maxFileSize) {
            throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
        }
        
        // Check file type
        const fileType = this.detectFileType(filePath);
        if (fileType === 'unknown') {
            throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
        }
    }
    
    async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return stats.size;
        } catch {
            return 0;
        }
    }
    
    countSyllables(word) {
        word = word.toLowerCase();
        let count = 0;
        let previousWasVowel = false;
        
        for (let i = 0; i < word.length; i++) {
            const isVowel = 'aeiou'.includes(word[i]);
            if (isVowel && !previousWasVowel) {
                count++;
            }
            previousWasVowel = isVowel;
        }
        
        // Adjust for silent e
        if (word.endsWith('e')) {
            count--;
        }
        
        // Ensure at least one syllable
        return Math.max(1, count);
    }
    
    isCommonWord(word) {
        const commonWords = ['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 
            'as', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 
            'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 
            'must', 'can', 'this', 'that', 'these', 'those'];
        return commonWords.includes(word.toLowerCase());
    }
    
    generateSampleWordText() {
        return `Team CRM Integration Proposal

Executive Summary
This document outlines the proposal for implementing an AI-augmented Team CRM system designed to enhance team collaboration and provide executive intelligence.

Section 1: Project Overview
The Team CRM system will integrate advanced AI capabilities to process team updates, extract actionable insights, and provide real-time executive summaries. Key features include:

• Automated information extraction from team communications
• Real-time priority detection and escalation
• Intelligent client relationship tracking
• Executive dashboard with situational awareness

Section 2: Implementation Timeline
Phase 1 (Weeks 1-4): Core infrastructure and AI integration
Phase 2 (Weeks 5-8): User interfaces and real-time processing
Phase 3 (Weeks 9-12): Advanced analytics and reporting

Section 3: Expected Outcomes
The system is expected to:
- Reduce information processing time by 75%
- Improve executive decision-making speed
- Enhance team collaboration efficiency
- Provide predictive insights for business opportunities

Conclusion
The AI-augmented Team CRM represents a significant advancement in organizational intelligence, enabling faster, more informed decision-making at all levels.`;
    }
    
    updateStats(fileType, processTime) {
        this.stats.totalProcessed++;
        this.stats.byFormat[fileType] = (this.stats.byFormat[fileType] || 0) + 1;
        this.stats.averageProcessTime = 
            (this.stats.averageProcessTime * (this.stats.totalProcessed - 1) + processTime) / 
            this.stats.totalProcessed;
    }
    
    /**
     * Get processor statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalProcessed > 0 
                ? ((this.stats.totalProcessed - this.stats.totalErrors) / this.stats.totalProcessed * 100).toFixed(2) 
                : 0,
            supportedFormats: Object.keys(this.supportedFormats)
        };
    }
    
    /**
     * Batch processing
     */
    async processFiles(filePaths, options = {}) {
        const results = [];
        const errors = [];
        
        for (const filePath of filePaths) {
            try {
                const result = await this.processFile(filePath, options);
                results.push(result);
            } catch (error) {
                errors.push({
                    filePath,
                    error: error.message
                });
            }
        }
        
        return {
            processed: results.length,
            failed: errors.length,
            results,
            errors
        };
    }
}

// Export singleton instance
export const fileProcessor = new FileProcessor();