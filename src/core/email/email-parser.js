/**
 * Email Parser
 * Parses incoming emails to extract structured information
 */

import { simpleParser } from 'mailparser';
import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

export class EmailParser {
    constructor(options = {}) {
        this.logger = logger.child({ component: 'EmailParser' });
        
        this.config = {
            maxAttachmentSize: options.maxAttachmentSize || 10 * 1024 * 1024, // 10MB
            supportedAttachmentTypes: options.supportedAttachmentTypes || [
                'image/jpeg', 'image/png', 'image/gif',
                'application/pdf', 'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain', 'text/csv'
            ],
            extractSignature: options.extractSignature !== false,
            extractQuotedText: options.extractQuotedText !== false,
            extractLinks: options.extractLinks !== false,
            cleanupHtml: options.cleanupHtml !== false
        };
        
        // Common email signature patterns
        this.signaturePatterns = [
            /^--\s*$/m,
            /^Best regards,?$/mi,
            /^Sincerely,?$/mi,
            /^Thanks,?$/mi,
            /^Regards,?$/mi,
            /^Sent from my iPhone/i,
            /^Sent from my Android/i,
            /^Get Outlook for/i
        ];
        
        // Quote patterns for different email clients
        this.quotePatterns = [
            /^On .+ wrote:$/m,
            /^From: .+$/m,
            /^-{2,}\s*Original Message\s*-{2,}$/mi,
            /^>{1,}/gm
        ];
    }
    
    /**
     * Parse raw email data
     */
    async parseEmail(rawEmail) {
        try {
            const startTime = Date.now();
            
            // Parse email using mailparser
            const parsed = await simpleParser(rawEmail, {
                skipImageLinks: true,
                skipTextLinks: !this.config.extractLinks
            });
            
            // Extract and process components
            const result = {
                // Basic metadata
                messageId: parsed.messageId,
                inReplyTo: parsed.inReplyTo,
                references: parsed.references,
                date: parsed.date,
                subject: this.cleanSubject(parsed.subject),
                
                // Participants
                from: this.parseAddress(parsed.from),
                to: this.parseAddresses(parsed.to),
                cc: this.parseAddresses(parsed.cc),
                bcc: this.parseAddresses(parsed.bcc),
                replyTo: this.parseAddress(parsed.replyTo),
                
                // Content
                text: await this.processTextContent(parsed.text),
                html: await this.processHtmlContent(parsed.html),
                
                // Extracted components
                signature: null,
                quotedText: null,
                cleanText: null,
                links: [],
                
                // Attachments
                attachments: await this.processAttachments(parsed.attachments),
                
                // Headers
                headers: this.extractImportantHeaders(parsed.headers),
                
                // Metadata
                priority: this.extractPriority(parsed),
                isAutoReply: this.detectAutoReply(parsed),
                language: this.detectLanguage(parsed.text || ''),
                sentiment: null, // Placeholder for sentiment analysis
                
                // Processing info
                parsingTime: Date.now() - startTime
            };
            
            // Extract signature if enabled
            if (this.config.extractSignature && result.text) {
                const signatureData = this.extractSignature(result.text);
                result.signature = signatureData.signature;
                result.cleanText = signatureData.cleanText;
            } else {
                result.cleanText = result.text;
            }
            
            // Extract quoted text if enabled
            if (this.config.extractQuotedText && result.cleanText) {
                const quotedData = this.extractQuotedText(result.cleanText);
                result.quotedText = quotedData.quoted;
                result.cleanText = quotedData.clean;
            }
            
            // Extract links if enabled
            if (this.config.extractLinks) {
                result.links = this.extractLinks(result.html || result.text);
            }
            
            // Detect email thread
            result.isReply = !!(parsed.inReplyTo || parsed.references);
            result.threadId = this.generateThreadId(parsed);
            
            this.logger.debug('Email parsed successfully', {
                messageId: result.messageId,
                subject: result.subject,
                from: result.from?.address,
                parsingTime: result.parsingTime
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('Failed to parse email', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Parse address object
     */
    parseAddress(address) {
        if (!address) return null;
        
        if (address.value && address.value.length > 0) {
            const addr = address.value[0];
            return {
                name: addr.name || null,
                address: addr.address?.toLowerCase(),
                raw: address.text
            };
        }
        
        return null;
    }
    
    /**
     * Parse multiple addresses
     */
    parseAddresses(addresses) {
        if (!addresses || !addresses.value) return [];
        
        return addresses.value.map(addr => ({
            name: addr.name || null,
            address: addr.address?.toLowerCase(),
            raw: addr.text || `${addr.name} <${addr.address}>`
        }));
    }
    
    /**
     * Clean email subject
     */
    cleanSubject(subject) {
        if (!subject) return '';
        
        // Remove common prefixes while preserving thread indicators
        let cleaned = subject.trim();
        
        // Remove excessive RE: or FW: prefixes (keep only one)
        cleaned = cleaned.replace(/^(RE:\s*|FW:\s*|FWD:\s*){2,}/gi, (match) => {
            const type = match.match(/RE:|FW:|FWD:/i)[0];
            return type + ' ';
        });
        
        // Remove email client artifacts
        cleaned = cleaned.replace(/\[EXTERNAL\]/gi, '').trim();
        cleaned = cleaned.replace(/\[SPAM\]/gi, '').trim();
        
        return cleaned;
    }
    
    /**
     * Process text content
     */
    async processTextContent(text) {
        if (!text) return null;
        
        // Normalize line endings
        let processed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Remove excessive blank lines
        processed = processed.replace(/\n{3,}/g, '\n\n');
        
        // Trim each line
        processed = processed.split('\n').map(line => line.trimEnd()).join('\n');
        
        return processed.trim();
    }
    
    /**
     * Process HTML content
     */
    async processHtmlContent(html) {
        if (!html) return null;
        
        if (!this.config.cleanupHtml) {
            return html;
        }
        
        try {
            // Load HTML with cheerio
            const $ = cheerio.load(html);
            
            // Remove script and style tags
            $('script, style').remove();
            
            // Remove tracking pixels
            $('img[width="1"][height="1"]').remove();
            $('img[src*="track"], img[src*="pixel"]').remove();
            
            // Clean up Microsoft Office artifacts
            $('[class*="MsoNormal"]').each((i, elem) => {
                $(elem).removeAttr('class');
            });
            
            // Remove empty paragraphs
            $('p').each((i, elem) => {
                if ($(elem).text().trim() === '') {
                    $(elem).remove();
                }
            });
            
            // Convert to clean HTML
            return $.html();
            
        } catch (error) {
            this.logger.warn('Failed to clean HTML content', { error: error.message });
            return html;
        }
    }
    
    /**
     * Extract email signature
     */
    extractSignature(text) {
        if (!text) return { signature: null, cleanText: text };
        
        let signatureStart = text.length;
        let signatureFound = false;
        
        // Check each signature pattern
        for (const pattern of this.signaturePatterns) {
            const match = text.match(pattern);
            if (match && match.index < signatureStart) {
                signatureStart = match.index;
                signatureFound = true;
            }
        }
        
        // Also check for common signature indicators
        const lines = text.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            
            // Check for phone numbers, emails, addresses in last 10 lines
            if (i >= lines.length - 10) {
                if (this.looksLikeContactInfo(line)) {
                    signatureStart = Math.min(signatureStart, text.indexOf(lines[i]));
                    signatureFound = true;
                }
            }
            
            // Check for signature separator lines
            if (line === '--' || line.match(/^-{3,}$/) || line.match(/^_{3,}$/)) {
                signatureStart = Math.min(signatureStart, text.indexOf(lines[i]));
                signatureFound = true;
                break;
            }
        }
        
        if (signatureFound) {
            return {
                signature: text.substring(signatureStart).trim(),
                cleanText: text.substring(0, signatureStart).trim()
            };
        }
        
        return {
            signature: null,
            cleanText: text
        };
    }
    
    /**
     * Extract quoted text
     */
    extractQuotedText(text) {
        if (!text) return { quoted: null, clean: text };
        
        let quotedStart = text.length;
        let quotedFound = false;
        
        // Check for quote patterns
        for (const pattern of this.quotePatterns) {
            const match = text.match(pattern);
            if (match && match.index < quotedStart) {
                quotedStart = match.index;
                quotedFound = true;
            }
        }
        
        // Check for quoted lines (starting with >)
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('>')) {
                quotedStart = Math.min(quotedStart, text.indexOf(lines[i]));
                quotedFound = true;
                break;
            }
        }
        
        if (quotedFound) {
            return {
                quoted: text.substring(quotedStart).trim(),
                clean: text.substring(0, quotedStart).trim()
            };
        }
        
        return {
            quoted: null,
            clean: text
        };
    }
    
    /**
     * Extract links from content
     */
    extractLinks(content) {
        if (!content) return [];
        
        const links = [];
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
        
        const matches = content.match(urlRegex);
        if (matches) {
            const uniqueLinks = [...new Set(matches)];
            uniqueLinks.forEach(url => {
                links.push({
                    url,
                    domain: this.extractDomain(url),
                    isTracking: this.isTrackingLink(url)
                });
            });
        }
        
        return links;
    }
    
    /**
     * Process attachments
     */
    async processAttachments(attachments) {
        if (!attachments || attachments.length === 0) return [];
        
        const processed = [];
        
        for (const attachment of attachments) {
            // Check file size
            if (attachment.size > this.config.maxAttachmentSize) {
                this.logger.warn('Attachment too large', {
                    filename: attachment.filename,
                    size: attachment.size
                });
                continue;
            }
            
            // Check content type
            if (this.config.supportedAttachmentTypes.length > 0 &&
                !this.config.supportedAttachmentTypes.includes(attachment.contentType)) {
                this.logger.warn('Unsupported attachment type', {
                    filename: attachment.filename,
                    contentType: attachment.contentType
                });
                continue;
            }
            
            processed.push({
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size,
                contentId: attachment.contentId,
                checksum: attachment.checksum,
                content: attachment.content // Buffer
            });
        }
        
        return processed;
    }
    
    /**
     * Extract important headers
     */
    extractImportantHeaders(headers) {
        const important = {};
        const headersToExtract = [
            'x-mailer',
            'x-originating-ip',
            'x-priority',
            'importance',
            'x-msmail-priority',
            'list-unsubscribe',
            'return-path',
            'x-spam-score',
            'authentication-results'
        ];
        
        if (headers) {
            headersToExtract.forEach(header => {
                const value = headers.get(header);
                if (value) {
                    important[header] = value;
                }
            });
        }
        
        return important;
    }
    
    /**
     * Extract email priority
     */
    extractPriority(parsed) {
        // Check various priority headers
        const priority = parsed.headers?.get('x-priority') || 
                        parsed.headers?.get('importance') ||
                        parsed.headers?.get('x-msmail-priority');
        
        if (priority) {
            const priorityStr = priority.toString().toLowerCase();
            if (priorityStr.includes('high') || priorityStr === '1') return 'high';
            if (priorityStr.includes('low') || priorityStr === '5') return 'low';
        }
        
        // Check subject for priority indicators
        if (parsed.subject) {
            const subject = parsed.subject.toLowerCase();
            if (subject.includes('urgent') || subject.includes('asap')) return 'high';
        }
        
        return 'normal';
    }
    
    /**
     * Detect auto-reply emails
     */
    detectAutoReply(parsed) {
        // Check headers
        const autoReplyHeaders = [
            'auto-submitted',
            'x-autoreply',
            'x-autorespond',
            'precedence'
        ];
        
        for (const header of autoReplyHeaders) {
            const value = parsed.headers?.get(header);
            if (value) {
                const valueStr = value.toString().toLowerCase();
                if (valueStr.includes('auto') || valueStr === 'bulk') {
                    return true;
                }
            }
        }
        
        // Check subject
        if (parsed.subject) {
            const subject = parsed.subject.toLowerCase();
            const autoReplyKeywords = [
                'out of office',
                'automatic reply',
                'autoreply',
                'auto-reply',
                'away from office',
                'on vacation'
            ];
            
            for (const keyword of autoReplyKeywords) {
                if (subject.includes(keyword)) return true;
            }
        }
        
        return false;
    }
    
    /**
     * Helper methods
     */
    
    looksLikeContactInfo(line) {
        // Phone number patterns
        if (line.match(/[\d\s\-\(\)\.]{7,}/)) return true;
        
        // Email pattern
        if (line.match(/\S+@\S+\.\S+/)) return true;
        
        // Address patterns (street, city, state, zip)
        if (line.match(/\d+\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd)/i)) return true;
        if (line.match(/\w+,\s*\w{2}\s+\d{5}/)) return true;
        
        // Social media
        if (line.match(/linkedin|twitter|facebook/i)) return true;
        
        // Job titles
        if (line.match(/\b(CEO|CTO|CFO|President|Director|Manager|Consultant)\b/i)) return true;
        
        return false;
    }
    
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return null;
        }
    }
    
    isTrackingLink(url) {
        const trackingDomains = [
            'click.mailgun',
            'email.mailgun',
            'trk.klclick',
            'click.message',
            'tracking.email',
            'track.customer.io',
            'clicks.aweber.com',
            'mailclick.mailgun'
        ];
        
        const domain = this.extractDomain(url);
        if (!domain) return false;
        
        return trackingDomains.some(tracker => domain.includes(tracker));
    }
    
    detectLanguage(text) {
        // Simple language detection based on common words
        // In production, you'd use a proper language detection library
        
        const languages = {
            en: ['the', 'and', 'for', 'with', 'this', 'that', 'have', 'from'],
            es: ['el', 'la', 'de', 'que', 'para', 'con', 'una', 'por'],
            fr: ['le', 'de', 'et', 'la', 'les', 'des', 'pour', 'dans'],
            de: ['der', 'die', 'das', 'und', 'für', 'mit', 'von', 'ist']
        };
        
        const words = text.toLowerCase().split(/\s+/);
        const scores = {};
        
        for (const [lang, commonWords] of Object.entries(languages)) {
            scores[lang] = words.filter(word => commonWords.includes(word)).length;
        }
        
        const detected = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])[0];
        
        return detected[1] > 5 ? detected[0] : 'unknown';
    }
    
    generateThreadId(parsed) {
        // Generate a thread ID based on subject and references
        if (parsed.references && parsed.references.length > 0) {
            return parsed.references[0];
        }
        
        if (parsed.inReplyTo) {
            return parsed.inReplyTo;
        }
        
        // Generate based on subject (remove Re: Fw: etc)
        if (parsed.subject) {
            const cleanSubject = parsed.subject
                .replace(/^(RE:|FW:|FWD:)\s*/gi, '')
                .trim();
            
            // Simple hash of subject
            let hash = 0;
            for (let i = 0; i < cleanSubject.length; i++) {
                const char = cleanSubject.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            
            return `thread-${Math.abs(hash)}`;
        }
        
        return null;
    }
}

// Export singleton instance
export const emailParser = new EmailParser();