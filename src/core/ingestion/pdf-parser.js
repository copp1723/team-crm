/**
 * PDF Parser
 * Extracts text, metadata, and structured data from PDF documents
 */

import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { logger } from '../../utils/logger.js';

// We'll use pdf-parse for PDF text extraction
// For production, you'd install: npm install pdf-parse
// import pdf from 'pdf-parse';

export class PDFParser {
    constructor(options = {}) {
        this.logger = logger.child({ component: 'PDFParser' });
        
        this.config = {
            maxPages: options.maxPages || 1000,
            maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
            extractImages: options.extractImages || false,
            extractTables: options.extractTables !== false,
            extractMetadata: options.extractMetadata !== false,
            ocrEnabled: options.ocrEnabled || false, // For scanned PDFs
            tempDir: options.tempDir || '/tmp/pdf-processing',
            cleanupTemp: options.cleanupTemp !== false
        };
        
        // Statistics
        this.stats = {
            totalParsed: 0,
            totalPages: 0,
            totalErrors: 0,
            averageParseTime: 0
        };
    }
    
    /**
     * Parse a PDF file
     */
    async parse(filePath, options = {}) {
        const startTime = Date.now();
        const parseId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.logger.info('Starting PDF parse', {
                parseId,
                filePath,
                fileSize: await this.getFileSize(filePath)
            });
            
            // Validate file
            await this.validateFile(filePath);
            
            // Parse PDF content
            const result = await this.parsePDFContent(filePath, {
                ...this.config,
                ...options
            });
            
            // Extract structured data
            const structuredData = await this.extractStructuredData(result);
            
            // Analyze content
            const analysis = await this.analyzeContent(result.text, structuredData);
            
            // Update statistics
            const parseTime = Date.now() - startTime;
            this.updateStats(result.numPages, parseTime);
            
            this.logger.info('PDF parse completed', {
                parseId,
                pages: result.numPages,
                parseTime,
                textLength: result.text.length
            });
            
            return {
                success: true,
                parseId,
                metadata: result.metadata,
                content: {
                    text: result.text,
                    pages: result.pages,
                    numPages: result.numPages
                },
                structuredData,
                analysis,
                parseTime
            };
            
        } catch (error) {
            this.stats.totalErrors++;
            this.logger.error('PDF parse failed', {
                parseId,
                error: error.message,
                filePath
            });
            
            return {
                success: false,
                parseId,
                error: error.message
            };
        }
    }
    
    /**
     * Parse PDF content using pdf-parse library
     */
    async parsePDFContent(filePath, options) {
        // In production, this would use pdf-parse library
        // For now, simulate PDF parsing
        
        try {
            // Simulated PDF parsing
            const fileBuffer = await fs.readFile(filePath);
            
            // In production:
            // const data = await pdf(fileBuffer, {
            //     max: options.maxPages,
            //     version: 'v2.0.550'
            // });
            
            // Simulated response structure
            const data = {
                numpages: 5,
                numrender: 5,
                info: {
                    Title: 'Sample PDF Document',
                    Author: 'Team CRM',
                    Subject: 'Document Processing',
                    Creator: 'PDF Creator',
                    Producer: 'PDF Producer',
                    CreationDate: new Date(),
                    ModDate: new Date()
                },
                metadata: null,
                text: this.generateSampleText(),
                version: '1.10.100'
            };
            
            // Process pages
            const pages = await this.processPages(data, options);
            
            return {
                text: data.text,
                numPages: data.numpages,
                metadata: this.extractMetadata(data.info),
                pages,
                version: data.version
            };
            
        } catch (error) {
            throw new Error(`Failed to parse PDF content: ${error.message}`);
        }
    }
    
    /**
     * Process individual pages
     */
    async processPages(pdfData, options) {
        const pages = [];
        const pageTexts = this.splitIntoPages(pdfData.text, pdfData.numpages);
        
        for (let i = 0; i < pageTexts.length; i++) {
            const pageNumber = i + 1;
            const pageText = pageTexts[i];
            
            const page = {
                pageNumber,
                text: pageText,
                wordCount: this.countWords(pageText),
                tables: [],
                images: [],
                links: []
            };
            
            // Extract tables if enabled
            if (options.extractTables) {
                page.tables = this.extractTables(pageText);
            }
            
            // Extract links
            page.links = this.extractLinks(pageText);
            
            pages.push(page);
        }
        
        return pages;
    }
    
    /**
     * Extract structured data from PDF
     */
    async extractStructuredData(parseResult) {
        const structured = {
            documentType: null,
            sections: [],
            tables: [],
            lists: [],
            keyValuePairs: {},
            dates: [],
            numbers: [],
            emails: [],
            urls: [],
            phoneNumbers: []
        };
        
        // Determine document type
        structured.documentType = this.detectDocumentType(parseResult.text, parseResult.metadata);
        
        // Extract sections/headings
        structured.sections = this.extractSections(parseResult.text);
        
        // Aggregate tables from all pages
        parseResult.pages.forEach(page => {
            structured.tables.push(...page.tables);
        });
        
        // Extract lists
        structured.lists = this.extractLists(parseResult.text);
        
        // Extract key-value pairs
        structured.keyValuePairs = this.extractKeyValuePairs(parseResult.text);
        
        // Extract entities
        structured.dates = this.extractDates(parseResult.text);
        structured.numbers = this.extractNumbers(parseResult.text);
        structured.emails = this.extractEmails(parseResult.text);
        structured.urls = this.extractURLs(parseResult.text);
        structured.phoneNumbers = this.extractPhoneNumbers(parseResult.text);
        
        return structured;
    }
    
    /**
     * Analyze content for insights
     */
    async analyzeContent(text, structuredData) {
        const analysis = {
            summary: null,
            category: null,
            sentiment: null,
            keyPhrases: [],
            entities: [],
            language: 'en',
            readabilityScore: 0,
            topics: []
        };
        
        // Generate summary (first 500 chars for now)
        analysis.summary = this.generateSummary(text);
        
        // Categorize document
        analysis.category = this.categorizeDocument(text, structuredData);
        
        // Extract key phrases
        analysis.keyPhrases = this.extractKeyPhrases(text);
        
        // Extract named entities
        analysis.entities = this.extractNamedEntities(text);
        
        // Calculate readability
        analysis.readabilityScore = this.calculateReadability(text);
        
        // Identify topics
        analysis.topics = this.identifyTopics(text, structuredData);
        
        return analysis;
    }
    
    /**
     * Helper methods
     */
    
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
        
        // Check file extension
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.pdf') {
            throw new Error(`Invalid file type: ${ext}`);
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
    
    extractMetadata(info) {
        return {
            title: info.Title || null,
            author: info.Author || null,
            subject: info.Subject || null,
            keywords: info.Keywords || null,
            creator: info.Creator || null,
            producer: info.Producer || null,
            creationDate: info.CreationDate || null,
            modificationDate: info.ModDate || null,
            pageCount: info.PageCount || null
        };
    }
    
    splitIntoPages(text, numPages) {
        // Simple page splitting - in reality would use actual page boundaries
        const avgCharsPerPage = Math.ceil(text.length / numPages);
        const pages = [];
        
        for (let i = 0; i < numPages; i++) {
            const start = i * avgCharsPerPage;
            const end = Math.min((i + 1) * avgCharsPerPage, text.length);
            pages.push(text.substring(start, end));
        }
        
        return pages;
    }
    
    extractTables(text) {
        const tables = [];
        // Simple table detection - look for patterns of tabs/pipes
        const lines = text.split('\n');
        let inTable = false;
        let currentTable = [];
        
        for (const line of lines) {
            const hasTabs = line.includes('\t');
            const hasPipes = line.includes('|');
            const hasMultipleSpaces = /\s{2,}/.test(line);
            
            if (hasTabs || hasPipes || hasMultipleSpaces) {
                if (!inTable) {
                    inTable = true;
                    currentTable = [];
                }
                currentTable.push(line);
            } else if (inTable && line.trim() === '') {
                // End of table
                if (currentTable.length > 1) {
                    tables.push({
                        rows: currentTable.map(row => this.parseTableRow(row)),
                        rawText: currentTable.join('\n')
                    });
                }
                inTable = false;
                currentTable = [];
            }
        }
        
        return tables;
    }
    
    parseTableRow(row) {
        // Parse row by common delimiters
        if (row.includes('|')) {
            return row.split('|').map(cell => cell.trim());
        } else if (row.includes('\t')) {
            return row.split('\t').map(cell => cell.trim());
        } else {
            // Split by multiple spaces
            return row.split(/\s{2,}/).map(cell => cell.trim());
        }
    }
    
    extractLinks(text) {
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
        const matches = text.match(urlRegex) || [];
        return [...new Set(matches)];
    }
    
    extractSections(text) {
        const sections = [];
        const lines = text.split('\n');
        
        // Look for heading patterns
        const headingPatterns = [
            /^#+\s+(.+)$/,                    // Markdown headings
            /^[A-Z][A-Z\s]+$/,               // ALL CAPS HEADINGS
            /^\d+\.?\s+[A-Z].+$/,            // Numbered headings
            /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*:?\s*$/ // Title Case Headings
        ];
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.length > 0 && trimmed.length < 100) {
                for (const pattern of headingPatterns) {
                    if (pattern.test(trimmed)) {
                        sections.push({
                            title: trimmed,
                            lineNumber: index + 1,
                            level: this.detectHeadingLevel(trimmed)
                        });
                        break;
                    }
                }
            }
        });
        
        return sections;
    }
    
    detectHeadingLevel(heading) {
        if (heading.match(/^#+/)) {
            return heading.match(/^#+/)[0].length;
        } else if (heading.match(/^\d+\./)) {
            return 2;
        } else if (heading === heading.toUpperCase()) {
            return 1;
        }
        return 3;
    }
    
    extractLists(text) {
        const lists = [];
        const lines = text.split('\n');
        let currentList = null;
        
        lines.forEach(line => {
            const trimmed = line.trim();
            
            // Bullet points
            if (trimmed.match(/^[•·▪▫◦‣⁃]\s+/)) {
                if (!currentList || currentList.type !== 'bullet') {
                    if (currentList) lists.push(currentList);
                    currentList = { type: 'bullet', items: [] };
                }
                currentList.items.push(trimmed.replace(/^[•·▪▫◦‣⁃]\s+/, ''));
            }
            // Numbered lists
            else if (trimmed.match(/^\d+\.?\s+/)) {
                if (!currentList || currentList.type !== 'numbered') {
                    if (currentList) lists.push(currentList);
                    currentList = { type: 'numbered', items: [] };
                }
                currentList.items.push(trimmed.replace(/^\d+\.?\s+/, ''));
            }
            // Letter lists
            else if (trimmed.match(/^[a-z]\.\s+/i)) {
                if (!currentList || currentList.type !== 'letter') {
                    if (currentList) lists.push(currentList);
                    currentList = { type: 'letter', items: [] };
                }
                currentList.items.push(trimmed.replace(/^[a-z]\.\s+/i, ''));
            }
            // End of list
            else if (currentList && trimmed === '') {
                lists.push(currentList);
                currentList = null;
            }
        });
        
        if (currentList) lists.push(currentList);
        
        return lists;
    }
    
    extractKeyValuePairs(text) {
        const pairs = {};
        const patterns = [
            /^([A-Za-z\s]+):\s*(.+)$/,       // Key: Value
            /^([A-Za-z\s]+)\s*=\s*(.+)$/,    // Key = Value
            /^([A-Za-z\s]+)\s*-\s*(.+)$/     // Key - Value
        ];
        
        const lines = text.split('\n');
        lines.forEach(line => {
            const trimmed = line.trim();
            for (const pattern of patterns) {
                const match = trimmed.match(pattern);
                if (match && match[1].length < 50) {
                    const key = match[1].trim();
                    const value = match[2].trim();
                    pairs[key] = value;
                    break;
                }
            }
        });
        
        return pairs;
    }
    
    extractDates(text) {
        const dates = [];
        const datePatterns = [
            /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,        // MM/DD/YYYY
            /\b\d{1,2}-\d{1,2}-\d{2,4}\b/g,          // MM-DD-YYYY
            /\b\d{4}-\d{1,2}-\d{1,2}\b/g,            // YYYY-MM-DD
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi,
            /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/gi
        ];
        
        datePatterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            dates.push(...matches);
        });
        
        return [...new Set(dates)];
    }
    
    extractNumbers(text) {
        const numbers = [];
        const numberPatterns = [
            /\$[\d,]+\.?\d*/g,                       // Currency
            /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g,    // Formatted numbers
            /\b\d+\.?\d*%\b/g                        // Percentages
        ];
        
        numberPatterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            numbers.push(...matches);
        });
        
        return [...new Set(numbers)];
    }
    
    extractEmails(text) {
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const matches = text.match(emailRegex) || [];
        return [...new Set(matches)];
    }
    
    extractURLs(text) {
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
        const matches = text.match(urlRegex) || [];
        return [...new Set(matches)];
    }
    
    extractPhoneNumbers(text) {
        const phonePatterns = [
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                    // XXX-XXX-XXXX
            /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g,                  // (XXX) XXX-XXXX
            /\b\+?1?\s*\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g        // Various formats
        ];
        
        const phones = [];
        phonePatterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            phones.push(...matches);
        });
        
        return [...new Set(phones)];
    }
    
    detectDocumentType(text, metadata) {
        const lowerText = text.toLowerCase();
        
        // Check metadata first
        if (metadata.title) {
            const title = metadata.title.toLowerCase();
            if (title.includes('invoice')) return 'invoice';
            if (title.includes('contract')) return 'contract';
            if (title.includes('agreement')) return 'agreement';
            if (title.includes('report')) return 'report';
            if (title.includes('proposal')) return 'proposal';
        }
        
        // Check content patterns
        if (lowerText.includes('invoice number') || lowerText.includes('bill to')) {
            return 'invoice';
        } else if (lowerText.includes('whereas') && lowerText.includes('agreement')) {
            return 'contract';
        } else if (lowerText.includes('executive summary')) {
            return 'report';
        } else if (lowerText.includes('proposal') && lowerText.includes('scope')) {
            return 'proposal';
        } else if (lowerText.includes('meeting') && lowerText.includes('minutes')) {
            return 'meeting_minutes';
        }
        
        return 'document';
    }
    
    generateSummary(text) {
        // Simple summary - first 500 chars
        // In production, would use AI for proper summarization
        const cleanText = text.replace(/\s+/g, ' ').trim();
        if (cleanText.length <= 500) {
            return cleanText;
        }
        
        // Try to find a sentence boundary
        const truncated = cleanText.substring(0, 500);
        const lastPeriod = truncated.lastIndexOf('.');
        
        if (lastPeriod > 300) {
            return truncated.substring(0, lastPeriod + 1);
        }
        
        return truncated + '...';
    }
    
    categorizeDocument(text, structuredData) {
        const categories = {
            financial: ['invoice', 'payment', 'balance', 'amount', 'total', 'tax'],
            legal: ['agreement', 'contract', 'terms', 'conditions', 'party', 'whereas'],
            technical: ['specification', 'requirement', 'implementation', 'architecture', 'api'],
            sales: ['proposal', 'quote', 'pricing', 'offer', 'discount'],
            administrative: ['policy', 'procedure', 'guideline', 'memo', 'announcement']
        };
        
        const lowerText = text.toLowerCase();
        const scores = {};
        
        for (const [category, keywords] of Object.entries(categories)) {
            scores[category] = keywords.filter(keyword => 
                lowerText.includes(keyword)
            ).length;
        }
        
        // Return category with highest score
        const topCategory = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])[0];
        
        return topCategory[1] > 0 ? topCategory[0] : 'general';
    }
    
    extractKeyPhrases(text) {
        // Simple key phrase extraction
        // In production, would use NLP libraries
        const words = text.toLowerCase().split(/\s+/);
        const wordFreq = {};
        
        // Count word frequency
        words.forEach(word => {
            if (word.length > 4 && !this.isStopWord(word)) {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });
        
        // Get top phrases
        return Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ phrase: word, count }));
    }
    
    extractNamedEntities(text) {
        const entities = [];
        
        // Simple pattern-based entity extraction
        // In production, would use NLP NER
        
        // Company names (capitalized words)
        const companyPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Company))?\b/g;
        const companies = text.match(companyPattern) || [];
        companies.forEach(company => {
            if (company.split(' ').length <= 4) {
                entities.push({ type: 'organization', value: company });
            }
        });
        
        // Person names (basic pattern)
        const namePattern = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
        const names = text.match(namePattern) || [];
        names.forEach(name => {
            if (!this.isCommonPhrase(name)) {
                entities.push({ type: 'person', value: name });
            }
        });
        
        // Locations
        const locationKeywords = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'City', 'State'];
        const locationPattern = new RegExp(`\\b\\w+\\s+(${locationKeywords.join('|')})\\b`, 'gi');
        const locations = text.match(locationPattern) || [];
        locations.forEach(location => {
            entities.push({ type: 'location', value: location });
        });
        
        return entities;
    }
    
    calculateReadability(text) {
        // Flesch Reading Ease Score
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);
        
        if (sentences.length === 0 || words.length === 0) return 0;
        
        const avgWordsPerSentence = words.length / sentences.length;
        const avgSyllablesPerWord = syllables / words.length;
        
        // Flesch Reading Ease formula
        const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
        
        // Normalize to 0-100
        return Math.max(0, Math.min(100, score));
    }
    
    countSyllables(word) {
        // Simple syllable counting
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
    
    identifyTopics(text, structuredData) {
        const topics = [];
        
        // Use document type as primary topic
        if (structuredData.documentType !== 'document') {
            topics.push(structuredData.documentType);
        }
        
        // Add category as topic
        const category = this.categorizeDocument(text, structuredData);
        if (category !== 'general') {
            topics.push(category);
        }
        
        // Industry-specific topics
        const industryKeywords = {
            'automotive': ['dealer', 'dealership', 'vehicle', 'car', 'automotive'],
            'technology': ['software', 'api', 'integration', 'platform', 'digital'],
            'sales': ['revenue', 'pipeline', 'lead', 'opportunity', 'close']
        };
        
        const lowerText = text.toLowerCase();
        for (const [industry, keywords] of Object.entries(industryKeywords)) {
            if (keywords.some(keyword => lowerText.includes(keyword))) {
                topics.push(industry);
            }
        }
        
        return [...new Set(topics)];
    }
    
    isStopWord(word) {
        const stopWords = ['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'some', 'any', 'few', 'many', 'much', 'most', 'other', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once'];
        return stopWords.includes(word.toLowerCase());
    }
    
    isCommonPhrase(phrase) {
        const common = ['United States', 'New York', 'North America', 'South America'];
        return common.includes(phrase);
    }
    
    countWords(text) {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }
    
    generateSampleText() {
        return `Sample PDF Document

This is a sample PDF document for testing purposes. It contains multiple pages with various types of content.

Section 1: Introduction
This document demonstrates the PDF parsing capabilities of the system. It includes text extraction, metadata parsing, and structured data identification.

Key Features:
• Text extraction from PDF files
• Metadata extraction
• Table detection and parsing
• List identification
• Entity extraction

Contact Information:
Email: info@example.com
Phone: (555) 123-4567
Website: https://www.example.com

Invoice Details:
Invoice Number: INV-2024-001
Date: January 15, 2024
Amount: $1,234.56

This is page 1 of 5.`;
    }
    
    updateStats(numPages, parseTime) {
        this.stats.totalParsed++;
        this.stats.totalPages += numPages;
        this.stats.averageParseTime = 
            (this.stats.averageParseTime * (this.stats.totalParsed - 1) + parseTime) / 
            this.stats.totalParsed;
    }
    
    /**
     * Get parser statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalParsed > 0 
                ? ((this.stats.totalParsed - this.stats.totalErrors) / this.stats.totalParsed * 100).toFixed(2) 
                : 0
        };
    }
    
    /**
     * Cleanup temporary files
     */
    async cleanup(parseId) {
        if (!this.config.cleanupTemp) return;
        
        try {
            const tempPath = path.join(this.config.tempDir, parseId);
            await fs.rm(tempPath, { recursive: true, force: true });
            this.logger.debug('Cleaned up temporary files', { parseId });
        } catch (error) {
            this.logger.warn('Failed to cleanup temporary files', { 
                parseId, 
                error: error.message 
            });
        }
    }
}

// Export singleton instance
export const pdfParser = new PDFParser();