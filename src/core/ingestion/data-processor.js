/**
 * Data Processor
 * Extracts, contextualizes, and structures data from processed files
 * Integrates with personal assistant memory system
 */

import { logger } from '../../utils/logger.js';
import { fileProcessor } from './file-processor.js';
import { pdfParser } from './pdf-parser.js';

export class DataProcessor {
    constructor(options = {}) {
        this.logger = logger.child({ component: 'DataProcessor' });
        
        this.config = {
            enableAIExtraction: options.enableAIExtraction !== false,
            contextWindow: options.contextWindow || 2000,
            maxEntities: options.maxEntities || 100,
            confidence: {
                high: 0.8,
                medium: 0.6,
                low: 0.4
            },
            extraction: {
                dealers: true,
                people: true,
                organizations: true,
                locations: true,
                dates: true,
                money: true,
                metrics: true,
                actionItems: true,
                decisions: true
            }
        };
        
        // Data extraction patterns
        this.patterns = {
            dealers: [
                /\b([A-Z][\w\s]+(?:Motors|Auto|Cars|Automotive|Dealership|Sales))\b/g,
                /\b([A-Z][\w\s]+(?:Ford|Chevy|Toyota|Honda|Nissan))\b/g
            ],
            money: [
                /\$[\d,]+\.?\d*/g,
                /\b(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars?|USD)\b/gi
            ],
            percentages: /\b\d+(?:\.\d+)?%\b/g,
            emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phones: /\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
            dates: [
                /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
                /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
                /\b(?:today|tomorrow|yesterday|next\s+(?:week|month)|last\s+(?:week|month))\b/gi
            ],
            actionItems: [
                /(?:need\s+to|must|should|will|action\s*item[s]?:|todo:|task[s]?:)\s*([^.!?\n]+)/gi,
                /(?:follow\s*up|next\s*step[s]?|action\s*required):\s*([^.!?\n]+)/gi
            ],
            priorities: /\b(?:urgent|high\s*priority|critical|asap|immediately|blocker)\b/gi
        };
        
        // Context understanding
        this.contextCache = new Map();
        this.entityCache = new Map();
        
        // Statistics
        this.stats = {
            totalProcessed: 0,
            entitiesExtracted: 0,
            relationsFound: 0,
            memoryIntegrations: 0
        };
    }
    
    /**
     * Process data from a file
     */
    async processData(fileResult, options = {}) {
        const startTime = Date.now();
        const processId = `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.logger.info('Starting data processing', {
                processId,
                fileType: fileResult.fileInfo?.fileType,
                hasContent: !!fileResult.content
            });
            
            // Extract raw text content
            const textContent = this.extractTextContent(fileResult);
            
            // Extract entities and relationships
            const extraction = await this.extractEntitiesAndRelations(textContent, fileResult);
            
            // Build context
            const context = await this.buildContext(extraction, fileResult);
            
            // Generate structured data
            const structuredData = await this.generateStructuredData(extraction, context, fileResult);
            
            // Prepare for memory integration
            const memoryData = await this.prepareMemoryData(structuredData, context, options);
            
            // Update statistics
            this.updateStats(extraction, structuredData);
            
            const processTime = Date.now() - startTime;
            this.logger.info('Data processing completed', {
                processId,
                entitiesFound: extraction.entities.length,
                processTime
            });
            
            return {
                success: true,
                processId,
                extraction,
                context,
                structuredData,
                memoryData,
                metadata: {
                    processTime,
                    confidence: this.calculateConfidence(extraction, structuredData),
                    source: fileResult.fileInfo
                }
            };
            
        } catch (error) {
            this.logger.error('Data processing failed', {
                processId,
                error: error.message
            });
            
            return {
                success: false,
                processId,
                error: error.message
            };
        }
    }
    
    /**
     * Extract text content from file result
     */
    extractTextContent(fileResult) {
        let text = '';
        
        if (fileResult.content) {
            if (typeof fileResult.content.text === 'string') {
                text = fileResult.content.text;
            } else if (fileResult.content.sheets) {
                // Excel/CSV - convert to text
                text = this.sheetsToText(fileResult.content.sheets);
            } else if (fileResult.content.pages) {
                // PDF - combine pages
                text = fileResult.content.pages.map(p => p.text).join('\n\n');
            }
        }
        
        return text;
    }
    
    /**
     * Convert sheets data to text
     */
    sheetsToText(sheets) {
        const texts = [];
        
        for (const [sheetName, rows] of Object.entries(sheets)) {
            texts.push(`Sheet: ${sheetName}`);
            
            if (Array.isArray(rows) && rows.length > 0) {
                // Headers
                const headers = Object.keys(rows[0]);
                texts.push(headers.join(' | '));
                
                // Rows
                rows.forEach(row => {
                    const values = headers.map(h => row[h] || '');
                    texts.push(values.join(' | '));
                });
            }
            
            texts.push(''); // Empty line between sheets
        }
        
        return texts.join('\n');
    }
    
    /**
     * Extract entities and relationships
     */
    async extractEntitiesAndRelations(text, fileResult) {
        const extraction = {
            entities: [],
            relations: [],
            mentions: [],
            topics: [],
            summary: null
        };
        
        // Extract dealers
        if (this.config.extraction.dealers) {
            const dealers = this.extractDealers(text);
            extraction.entities.push(...dealers.map(d => ({
                type: 'dealer',
                value: d.name,
                confidence: d.confidence,
                context: d.context
            })));
        }
        
        // Extract people
        if (this.config.extraction.people) {
            const people = this.extractPeople(text);
            extraction.entities.push(...people.map(p => ({
                type: 'person',
                value: p.name,
                role: p.role,
                confidence: p.confidence
            })));
        }
        
        // Extract organizations
        if (this.config.extraction.organizations) {
            const orgs = this.extractOrganizations(text);
            extraction.entities.push(...orgs.map(o => ({
                type: 'organization',
                value: o.name,
                industry: o.industry,
                confidence: o.confidence
            })));
        }
        
        // Extract money amounts
        if (this.config.extraction.money) {
            const amounts = this.extractMoneyAmounts(text);
            extraction.entities.push(...amounts.map(a => ({
                type: 'money',
                value: a.amount,
                formatted: a.formatted,
                context: a.context,
                confidence: a.confidence
            })));
        }
        
        // Extract dates
        if (this.config.extraction.dates) {
            const dates = this.extractDates(text);
            extraction.entities.push(...dates.map(d => ({
                type: 'date',
                value: d.date,
                formatted: d.formatted,
                relative: d.relative,
                confidence: d.confidence
            })));
        }
        
        // Extract action items
        if (this.config.extraction.actionItems) {
            const actions = this.extractActionItems(text);
            extraction.entities.push(...actions.map(a => ({
                type: 'action_item',
                value: a.text,
                priority: a.priority,
                assignee: a.assignee,
                deadline: a.deadline,
                confidence: a.confidence
            })));
        }
        
        // Extract metrics
        if (this.config.extraction.metrics) {
            const metrics = this.extractMetrics(text);
            extraction.entities.push(...metrics.map(m => ({
                type: 'metric',
                value: m.value,
                metric: m.metric,
                unit: m.unit,
                trend: m.trend,
                confidence: m.confidence
            })));
        }
        
        // Find relationships between entities
        extraction.relations = this.findRelationships(extraction.entities, text);
        
        // Extract topics
        extraction.topics = this.extractTopics(text, extraction.entities);
        
        // Generate summary if available from file result
        if (fileResult.analysis?.summary) {
            extraction.summary = fileResult.analysis.summary;
        } else {
            extraction.summary = this.generateSummary(text, extraction);
        }
        
        return extraction;
    }
    
    /**
     * Entity extraction methods
     */
    
    extractDealers(text) {
        const dealers = [];
        const found = new Set();
        
        this.patterns.dealers.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const name = match[1].trim();
                if (!found.has(name.toLowerCase()) && this.isDealerName(name)) {
                    found.add(name.toLowerCase());
                    
                    // Get context around mention
                    const start = Math.max(0, match.index - 100);
                    const end = Math.min(text.length, match.index + match[0].length + 100);
                    const context = text.substring(start, end);
                    
                    dealers.push({
                        name,
                        confidence: this.calculateDealerConfidence(name, context),
                        context
                    });
                }
            }
        });
        
        return dealers;
    }
    
    extractPeople(text) {
        const people = [];
        const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
        const found = new Set();
        
        let match;
        while ((match = namePattern.exec(text)) !== null) {
            const name = match[1];
            if (!found.has(name) && this.isPersonName(name)) {
                found.add(name);
                
                // Try to find role
                const rolePattern = new RegExp(
                    `${name}[,\s]+(?:the\s+)?(\w+(?:\s+\w+)?)|` +
                    `(\w+(?:\s+\w+)?)[,\s]+${name}`,
                    'i'
                );
                const roleMatch = text.match(rolePattern);
                const role = roleMatch ? (roleMatch[1] || roleMatch[2]) : null;
                
                people.push({
                    name,
                    role: this.normalizeRole(role),
                    confidence: this.calculatePersonConfidence(name, role)
                });
            }
        }
        
        return people;
    }
    
    extractOrganizations(text) {
        const orgs = [];
        const orgPattern = /\b([A-Z][\w\s]+(?:Inc|LLC|Ltd|Corp|Company|Group|Partners))\b/g;
        const found = new Set();
        
        let match;
        while ((match = orgPattern.exec(text)) !== null) {
            const name = match[1].trim();
            if (!found.has(name.toLowerCase())) {
                found.add(name.toLowerCase());
                
                orgs.push({
                    name,
                    industry: this.detectIndustry(name, text),
                    confidence: 0.7
                });
            }
        }
        
        return orgs;
    }
    
    extractMoneyAmounts(text) {
        const amounts = [];
        const found = new Set();
        
        this.patterns.money.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const value = match[0];
                if (!found.has(value)) {
                    found.add(value);
                    
                    // Parse amount
                    const numericValue = parseFloat(
                        value.replace(/[$,]/g, '').replace(/\s*(?:dollars?|USD)/gi, '')
                    );
                    
                    // Get context
                    const start = Math.max(0, match.index - 50);
                    const end = Math.min(text.length, match.index + value.length + 50);
                    const context = text.substring(start, end);
                    
                    amounts.push({
                        amount: numericValue,
                        formatted: value,
                        context,
                        confidence: 0.9
                    });
                }
            }
        });
        
        return amounts.sort((a, b) => b.amount - a.amount);
    }
    
    extractDates(text) {
        const dates = [];
        const found = new Set();
        
        this.patterns.dates.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const dateStr = match[0];
                if (!found.has(dateStr.toLowerCase())) {
                    found.add(dateStr.toLowerCase());
                    
                    const parsed = this.parseDate(dateStr);
                    if (parsed) {
                        dates.push({
                            date: parsed.date,
                            formatted: parsed.formatted,
                            relative: parsed.relative,
                            confidence: parsed.confidence
                        });
                    }
                }
            }
        });
        
        return dates;
    }
    
    extractActionItems(text) {
        const actions = [];
        const found = new Set();
        
        this.patterns.actionItems.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const actionText = match[1].trim();
                if (!found.has(actionText.toLowerCase()) && actionText.length > 10) {
                    found.add(actionText.toLowerCase());
                    
                    // Check for priority
                    const priority = this.patterns.priorities.test(actionText) ? 'high' : 'normal';
                    
                    // Look for assignee
                    const assigneeMatch = actionText.match(/\b(?:for|to|assigned to)\s+([A-Z][a-z]+)/i);
                    const assignee = assigneeMatch ? assigneeMatch[1] : null;
                    
                    // Look for deadline
                    const deadlineMatch = actionText.match(/\b(?:by|before|until)\s+(.+?)(?:\.|,|$)/i);
                    const deadline = deadlineMatch ? this.parseDate(deadlineMatch[1]) : null;
                    
                    actions.push({
                        text: actionText,
                        priority,
                        assignee,
                        deadline: deadline?.formatted,
                        confidence: 0.7
                    });
                }
            }
        });
        
        return actions;
    }
    
    extractMetrics(text) {
        const metrics = [];
        const metricPattern = /(\d+(?:\.\d+)?%?)\s*(?:increase|decrease|growth|decline|improvement|reduction)\s*(?:in\s+)?([\w\s]+?)(?:\.|,|;|$)/gi;
        
        let match;
        while ((match = metricPattern.exec(text)) !== null) {
            const value = match[1];
            const metric = match[2].trim();
            const trend = match[0].toLowerCase().includes('increase') || 
                         match[0].toLowerCase().includes('growth') || 
                         match[0].toLowerCase().includes('improvement') ? 'up' : 'down';
            
            metrics.push({
                value,
                metric,
                unit: value.includes('%') ? 'percentage' : 'absolute',
                trend,
                confidence: 0.8
            });
        }
        
        return metrics;
    }
    
    /**
     * Relationship finding
     */
    findRelationships(entities, text) {
        const relations = [];
        
        // Find dealer-person relationships
        entities.filter(e => e.type === 'dealer').forEach(dealer => {
            entities.filter(e => e.type === 'person').forEach(person => {
                // Check if mentioned near each other
                const pattern = new RegExp(
                    `${dealer.value}.{0,100}${person.value}|${person.value}.{0,100}${dealer.value}`,
                    'i'
                );
                
                if (pattern.test(text)) {
                    relations.push({
                        type: 'works_with',
                        from: { type: 'person', value: person.value },
                        to: { type: 'dealer', value: dealer.value },
                        confidence: 0.7
                    });
                }
            });
        });
        
        // Find dealer-money relationships
        entities.filter(e => e.type === 'dealer').forEach(dealer => {
            entities.filter(e => e.type === 'money').forEach(money => {
                if (money.context && money.context.includes(dealer.value)) {
                    relations.push({
                        type: 'deal_value',
                        from: { type: 'dealer', value: dealer.value },
                        to: { type: 'money', value: money.formatted },
                        confidence: 0.8
                    });
                }
            });
        });
        
        // Find action-person relationships
        entities.filter(e => e.type === 'action_item').forEach(action => {
            if (action.assignee) {
                const person = entities.find(e => 
                    e.type === 'person' && e.value.includes(action.assignee)
                );
                
                if (person) {
                    relations.push({
                        type: 'assigned_to',
                        from: { type: 'action_item', value: action.value },
                        to: { type: 'person', value: person.value },
                        confidence: 0.9
                    });
                }
            }
        });
        
        return relations;
    }
    
    /**
     * Topic extraction
     */
    extractTopics(text, entities) {
        const topics = [];
        const topicKeywords = {
            'sales': ['deal', 'sale', 'sold', 'revenue', 'contract', 'purchase'],
            'pilot': ['pilot', 'trial', 'test', 'evaluation', 'proof of concept'],
            'integration': ['integrate', 'integration', 'api', 'connect', 'sync'],
            'support': ['support', 'issue', 'problem', 'ticket', 'help', 'troubleshoot'],
            'expansion': ['expand', 'expansion', 'growth', 'scale', 'additional'],
            'negotiation': ['negotiate', 'negotiation', 'pricing', 'discount', 'terms'],
            'competition': ['competitor', 'compete', 'competitive', 'versus', 'alternative']
        };
        
        const lowerText = text.toLowerCase();
        
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            const count = keywords.filter(keyword => lowerText.includes(keyword)).length;
            if (count > 0) {
                topics.push({
                    topic,
                    relevance: count / keywords.length,
                    mentions: count
                });
            }
        }
        
        // Add entity-based topics
        if (entities.filter(e => e.type === 'dealer').length > 2) {
            topics.push({ topic: 'multi-dealer', relevance: 0.8, mentions: 1 });
        }
        
        if (entities.filter(e => e.type === 'action_item' && e.priority === 'high').length > 0) {
            topics.push({ topic: 'urgent', relevance: 1.0, mentions: 1 });
        }
        
        return topics.sort((a, b) => b.relevance - a.relevance);
    }
    
    /**
     * Build context from extraction
     */
    async buildContext(extraction, fileResult) {
        const context = {
            domain: 'automotive_sales',
            documentType: fileResult.fileInfo?.fileType || 'unknown',
            primaryEntities: [],
            timeline: null,
            sentiment: 'neutral',
            urgency: 'normal',
            businessImpact: 'medium'
        };
        
        // Identify primary entities (most mentioned)
        const entityCounts = {};
        extraction.entities.forEach(e => {
            const key = `${e.type}:${e.value}`;
            entityCounts[key] = (entityCounts[key] || 0) + 1;
        });
        
        context.primaryEntities = Object.entries(entityCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key, count]) => {
                const [type, ...valueParts] = key.split(':');
                return { type, value: valueParts.join(':'), mentions: count };
            });
        
        // Build timeline from dates
        const dates = extraction.entities.filter(e => e.type === 'date');
        if (dates.length > 0) {
            context.timeline = {
                earliest: dates[0].formatted,
                latest: dates[dates.length - 1].formatted,
                span: this.calculateDateSpan(dates[0].date, dates[dates.length - 1].date)
            };
        }
        
        // Determine urgency
        const hasUrgentTopic = extraction.topics.some(t => t.topic === 'urgent');
        const hasHighPriorityActions = extraction.entities.some(e => 
            e.type === 'action_item' && e.priority === 'high'
        );
        
        if (hasUrgentTopic || hasHighPriorityActions) {
            context.urgency = 'high';
        }
        
        // Assess business impact
        const moneyEntities = extraction.entities.filter(e => e.type === 'money');
        if (moneyEntities.length > 0) {
            const totalValue = moneyEntities.reduce((sum, e) => sum + e.amount, 0);
            if (totalValue > 100000) {
                context.businessImpact = 'high';
            } else if (totalValue > 50000) {
                context.businessImpact = 'medium';
            } else {
                context.businessImpact = 'low';
            }
        }
        
        return context;
    }
    
    /**
     * Generate structured data
     */
    async generateStructuredData(extraction, context, fileResult) {
        const structured = {
            summary: {
                text: extraction.summary,
                confidence: 0.8
            },
            keyPoints: [],
            entities: {},
            actionItems: [],
            metrics: {},
            timeline: [],
            relationships: []
        };
        
        // Organize entities by type
        extraction.entities.forEach(entity => {
            if (!structured.entities[entity.type]) {
                structured.entities[entity.type] = [];
            }
            structured.entities[entity.type].push(entity);
        });
        
        // Extract key points
        structured.keyPoints = this.extractKeyPoints(extraction, context);
        
        // Format action items
        structured.actionItems = extraction.entities
            .filter(e => e.type === 'action_item')
            .map(action => ({
                text: action.value,
                priority: action.priority,
                assignee: action.assignee,
                deadline: action.deadline,
                status: 'pending'
            }));
        
        // Aggregate metrics
        extraction.entities
            .filter(e => e.type === 'metric')
            .forEach(metric => {
                if (!structured.metrics[metric.metric]) {
                    structured.metrics[metric.metric] = [];
                }
                structured.metrics[metric.metric].push({
                    value: metric.value,
                    trend: metric.trend,
                    unit: metric.unit
                });
            });
        
        // Build timeline
        extraction.entities
            .filter(e => e.type === 'date')
            .forEach(date => {
                structured.timeline.push({
                    date: date.formatted,
                    events: this.findEventsForDate(date, extraction, fileResult)
                });
            });
        
        // Add relationships
        structured.relationships = extraction.relations;
        
        return structured;
    }
    
    /**
     * Prepare data for memory integration
     */
    async prepareMemoryData(structuredData, context, options) {
        const memoryData = {
            entries: [],
            metadata: {
                source: options.source || 'file_ingestion',
                timestamp: new Date().toISOString(),
                confidence: context.confidence || 0.7
            }
        };
        
        // Create memory entry for summary
        if (structuredData.summary.text) {
            memoryData.entries.push({
                type: 'summary',
                content: structuredData.summary.text,
                tags: context.primaryEntities.map(e => e.value),
                importance: context.urgency === 'high' ? 1.0 : 0.5
            });
        }
        
        // Create entries for key dealers
        Object.entries(structuredData.entities.dealer || {}).forEach(([_, dealer]) => {
            memoryData.entries.push({
                type: 'entity',
                entityType: 'dealer',
                content: `Dealer: ${dealer.value}`,
                metadata: {
                    dealerName: dealer.value,
                    context: dealer.context
                },
                importance: 0.7
            });
        });
        
        // Create entries for high-priority action items
        structuredData.actionItems
            .filter(action => action.priority === 'high')
            .forEach(action => {
                memoryData.entries.push({
                    type: 'action_item',
                    content: action.text,
                    metadata: {
                        priority: action.priority,
                        assignee: action.assignee,
                        deadline: action.deadline
                    },
                    importance: 0.9
                });
            });
        
        // Create entries for significant money amounts
        Object.entries(structuredData.entities.money || {})
            .filter(([_, money]) => money.amount > 10000)
            .forEach(([_, money]) => {
                memoryData.entries.push({
                    type: 'financial',
                    content: `Amount: ${money.formatted}`,
                    metadata: {
                        amount: money.amount,
                        context: money.context
                    },
                    importance: money.amount > 100000 ? 0.9 : 0.6
                });
            });
        
        // Add user/member context if provided
        if (options.userId || options.memberName) {
            memoryData.metadata.userId = options.userId;
            memoryData.metadata.memberName = options.memberName;
            
            // Tag entries with member
            memoryData.entries.forEach(entry => {
                entry.memberContext = options.memberName || options.userId;
            });
        }
        
        return memoryData;
    }
    
    /**
     * Helper methods
     */
    
    isDealerName(name) {
        const dealerKeywords = ['Motors', 'Auto', 'Cars', 'Automotive', 'Dealership', 
                               'Sales', 'Ford', 'Chevy', 'Toyota', 'Honda', 'Nissan'];
        return dealerKeywords.some(keyword => name.includes(keyword));
    }
    
    isPersonName(name) {
        const parts = name.split(' ');
        // Basic check: 2-4 parts, each starting with capital
        return parts.length >= 2 && 
               parts.length <= 4 && 
               parts.every(part => /^[A-Z]/.test(part)) &&
               !this.isDealerName(name);
    }
    
    normalizeRole(role) {
        if (!role) return null;
        
        const roleMap = {
            'gm': 'General Manager',
            'mgr': 'Manager',
            'vp': 'Vice President',
            'ceo': 'CEO',
            'cto': 'CTO',
            'cfo': 'CFO'
        };
        
        const normalized = role.toLowerCase();
        return roleMap[normalized] || role;
    }
    
    detectIndustry(name, text) {
        const industries = {
            'automotive': ['auto', 'car', 'vehicle', 'motor', 'dealer'],
            'technology': ['tech', 'software', 'digital', 'it', 'cyber'],
            'finance': ['bank', 'financial', 'investment', 'capital', 'fund'],
            'retail': ['store', 'shop', 'retail', 'commerce'],
            'manufacturing': ['manufacturing', 'factory', 'production', 'industrial']
        };
        
        const lowerName = name.toLowerCase();
        const lowerText = text.toLowerCase();
        
        for (const [industry, keywords] of Object.entries(industries)) {
            if (keywords.some(keyword => lowerName.includes(keyword) || 
                (lowerText.includes(name) && lowerText.includes(keyword)))) {
                return industry;
            }
        }
        
        return 'general';
    }
    
    parseDate(dateStr) {
        const now = new Date();
        let date = null;
        let relative = false;
        let confidence = 0.9;
        
        // Handle relative dates
        const lowerDate = dateStr.toLowerCase();
        if (lowerDate === 'today') {
            date = now;
            relative = true;
        } else if (lowerDate === 'tomorrow') {
            date = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            relative = true;
        } else if (lowerDate === 'yesterday') {
            date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            relative = true;
        } else if (lowerDate.includes('next week')) {
            date = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            relative = true;
            confidence = 0.7;
        } else if (lowerDate.includes('last week')) {
            date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            relative = true;
            confidence = 0.7;
        } else {
            // Try to parse absolute date
            date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                return null;
            }
        }
        
        return {
            date,
            formatted: date.toLocaleDateString(),
            relative,
            confidence
        };
    }
    
    calculateDateSpan(date1, date2) {
        const diff = Math.abs(date2.getTime() - date1.getTime());
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'same day';
        if (days === 1) return '1 day';
        if (days < 7) return `${days} days`;
        if (days < 30) return `${Math.floor(days / 7)} weeks`;
        if (days < 365) return `${Math.floor(days / 30)} months`;
        return `${Math.floor(days / 365)} years`;
    }
    
    calculateDealerConfidence(name, context) {
        let confidence = 0.5;
        
        // Boost confidence based on context clues
        if (context.toLowerCase().includes('dealership')) confidence += 0.2;
        if (context.toLowerCase().includes('sales')) confidence += 0.1;
        if (context.toLowerCase().includes('dealer')) confidence += 0.2;
        if (/\b(?:sold|purchased|bought)\b/i.test(context)) confidence += 0.1;
        
        return Math.min(0.95, confidence);
    }
    
    calculatePersonConfidence(name, role) {
        let confidence = 0.6;
        
        // Names with roles are more confident
        if (role) confidence += 0.2;
        
        // Common name patterns boost confidence
        if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name)) confidence += 0.1;
        
        return Math.min(0.9, confidence);
    }
    
    extractKeyPoints(extraction, context) {
        const keyPoints = [];
        
        // High-value deals
        const highValueDeals = extraction.entities
            .filter(e => e.type === 'money' && e.amount > 50000);
        
        if (highValueDeals.length > 0) {
            keyPoints.push({
                type: 'financial',
                text: `High-value amounts: ${highValueDeals.map(d => d.formatted).join(', ')}`,
                importance: 'high'
            });
        }
        
        // Multiple dealers
        const dealers = extraction.entities.filter(e => e.type === 'dealer');
        if (dealers.length > 1) {
            keyPoints.push({
                type: 'relationship',
                text: `Multiple dealers involved: ${dealers.map(d => d.value).join(', ')}`,
                importance: 'medium'
            });
        }
        
        // Urgent items
        const urgentActions = extraction.entities
            .filter(e => e.type === 'action_item' && e.priority === 'high');
        
        if (urgentActions.length > 0) {
            keyPoints.push({
                type: 'action',
                text: `${urgentActions.length} high-priority action items require attention`,
                importance: 'high'
            });
        }
        
        return keyPoints;
    }
    
    findEventsForDate(date, extraction, fileResult) {
        const events = [];
        const dateContext = date.context || '';
        
        // Look for dealers mentioned near this date
        extraction.entities
            .filter(e => e.type === 'dealer')
            .forEach(dealer => {
                if (dateContext.includes(dealer.value) || 
                    (dealer.context && dealer.context.includes(date.formatted))) {
                    events.push({
                        type: 'dealer_interaction',
                        description: `Interaction with ${dealer.value}`
                    });
                }
            });
        
        // Look for action items with this deadline
        extraction.entities
            .filter(e => e.type === 'action_item' && e.deadline === date.formatted)
            .forEach(action => {
                events.push({
                    type: 'deadline',
                    description: `Deadline: ${action.value.substring(0, 50)}...`
                });
            });
        
        return events;
    }
    
    generateSummary(text, extraction) {
        // Simple summary generation
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        if (sentences.length === 0) {
            return 'No summary available';
        }
        
        // Take first sentence and add key entity mentions
        let summary = sentences[0].trim();
        
        const topEntities = extraction.entities
            .slice(0, 3)
            .map(e => e.value);
        
        if (topEntities.length > 0) {
            summary += ` Key entities: ${topEntities.join(', ')}.`;
        }
        
        return summary.substring(0, 300);
    }
    
    calculateConfidence(extraction, structuredData) {
        let totalConfidence = 0;
        let count = 0;
        
        // Average entity confidence
        extraction.entities.forEach(entity => {
            if (entity.confidence) {
                totalConfidence += entity.confidence;
                count++;
            }
        });
        
        // Factor in completeness
        if (structuredData.summary.text) count++;
        if (structuredData.keyPoints.length > 0) count++;
        if (Object.keys(structuredData.entities).length > 0) count++;
        
        return count > 0 ? totalConfidence / count : 0.5;
    }
    
    updateStats(extraction, structuredData) {
        this.stats.totalProcessed++;
        this.stats.entitiesExtracted += extraction.entities.length;
        this.stats.relationsFound += extraction.relations.length;
        
        if (structuredData.actionItems.length > 0 || 
            Object.keys(structuredData.entities).length > 0) {
            this.stats.memoryIntegrations++;
        }
    }
    
    /**
     * Get processor statistics
     */
    getStats() {
        return {
            ...this.stats,
            avgEntitiesPerDoc: this.stats.totalProcessed > 0 
                ? (this.stats.entitiesExtracted / this.stats.totalProcessed).toFixed(1)
                : 0,
            avgRelationsPerDoc: this.stats.totalProcessed > 0
                ? (this.stats.relationsFound / this.stats.totalProcessed).toFixed(1)
                : 0
        };
    }
    
    /**
     * Clear caches
     */
    clearCaches() {
        this.contextCache.clear();
        this.entityCache.clear();
    }
}

// Export singleton instance
export const dataProcessor = new DataProcessor();