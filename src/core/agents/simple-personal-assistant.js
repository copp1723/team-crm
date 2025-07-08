import { v4 as uuidv4 } from 'uuid';

export class PersonalAssistant {
    constructor(memberConfig, globalConfig) {
        this.memberConfig = memberConfig;
        this.memberName = memberConfig.name;
        this.memberRole = memberConfig.role;
        this.memberKey = memberConfig.id;
        this.globalConfig = globalConfig;
        this.processingHistory = [];
        this.totalUpdatesProcessed = 0;
    }

    async processUpdate(updateText, metadata = {}) {
        try {
            const updateId = uuidv4();
            const timestamp = new Date().toISOString();

            // Simple extraction for now - in a real system this would use AI
            const extracted = {
                priorities: this.extractPriorities(updateText),
                actionItems: this.extractActionItems(updateText),
                clientInfo: this.extractClientInfo(updateText),
                technicalInfo: this.extractTechnicalInfo(updateText),
                revenueInfo: this.extractRevenueInfo(updateText),
                keyInsights: this.extractKeyInsights(updateText),
                totalItems: 0
            };

            // Count total items
            extracted.totalItems = (extracted.priorities?.length || 0) + 
                                 (extracted.actionItems?.length || 0) + 
                                 (extracted.clientInfo?.length || 0) + 
                                 (extracted.technicalInfo?.length || 0) + 
                                 (extracted.revenueInfo?.length || 0);

            // Store in processing history
            const processedUpdate = {
                id: updateId,
                timestamp,
                memberName: this.memberName,
                rawInput: updateText,
                extracted,
                metadata
            };

            this.processingHistory.push(processedUpdate);
            this.totalUpdatesProcessed++;

            // Keep only last 100 updates
            if (this.processingHistory.length > 100) {
                this.processingHistory = this.processingHistory.slice(-50);
            }

            console.log(`${this.memberName} update processed: ${extracted.totalItems} items extracted`);

            return processedUpdate;

        } catch (error) {
            console.error(`Error processing update for ${this.memberName}:`, error);
            throw error;
        }
    }

    extractPriorities(text) {
        const priorities = [];
        const lowText = text.toLowerCase();
        
        if (lowText.includes('urgent') || lowText.includes('critical') || lowText.includes('asap')) {
            priorities.push({
                item: "High priority item detected",
                urgency: "high",
                deadline: this.extractDeadline(text)
            });
        }
        
        if (lowText.includes('deadline') || lowText.includes('due')) {
            priorities.push({
                item: "Deadline mentioned",
                urgency: "medium",
                deadline: this.extractDeadline(text)
            });
        }

        return priorities;
    }

    extractActionItems(text) {
        const actions = [];
        const lowText = text.toLowerCase();
        
        if (lowText.includes('need to') || lowText.includes('should') || lowText.includes('must')) {
            actions.push({
                task: "Action item identified in update",
                assignee: this.detectAssignee(text),
                dueDate: this.extractDeadline(text)
            });
        }

        return actions;
    }

    extractClientInfo(text) {
        const clients = [];
        const clientKeywords = ['client', 'customer', 'meeting', 'call', 'corp', 'company'];
        const lowText = text.toLowerCase();
        
        for (const keyword of clientKeywords) {
            if (lowText.includes(keyword)) {
                clients.push({
                    client: this.extractClientName(text),
                    status: this.detectSentiment(text),
                    details: text.substring(0, 100) + "..."
                });
                break;
            }
        }

        return clients;
    }

    extractTechnicalInfo(text) {
        const technical = [];
        const techKeywords = ['bug', 'error', 'performance', 'issue', 'problem', 'outage'];
        const lowText = text.toLowerCase();
        
        for (const keyword of techKeywords) {
            if (lowText.includes(keyword)) {
                technical.push({
                    issue: `Technical issue detected: ${keyword}`,
                    severity: lowText.includes('critical') || lowText.includes('urgent') ? 'high' : 'medium',
                    impact: "Needs assessment"
                });
                break;
            }
        }

        return technical;
    }

    extractRevenueInfo(text) {
        const revenue = [];
        const revenueKeywords = ['contract', 'expansion', 'upsell', 'renewal', 'revenue', 'money', '$'];
        const lowText = text.toLowerCase();
        
        for (const keyword of revenueKeywords) {
            if (lowText.includes(keyword)) {
                revenue.push({
                    opportunity: "Revenue opportunity identified",
                    value: this.extractValue(text),
                    probability: "medium"
                });
                break;
            }
        }

        return revenue;
    }

    extractKeyInsights(text) {
        const insights = [];
        
        if (text.length > 50) {
            insights.push(`Update from ${this.memberName} (${this.memberRole})`);
        }
        
        if (text.toLowerCase().includes('client')) {
            insights.push("Client-related activity");
        }
        
        if (text.toLowerCase().includes('urgent') || text.toLowerCase().includes('critical')) {
            insights.push("High priority matter");
        }

        return insights;
    }

    extractDeadline(text) {
        const dateKeywords = ['today', 'tomorrow', 'next week', 'friday', 'monday'];
        const lowText = text.toLowerCase();
        
        for (const keyword of dateKeywords) {
            if (lowText.includes(keyword)) {
                return keyword;
            }
        }
        return null;
    }

    detectAssignee(text) {
        const names = ['joe', 'charlie', 'josh', 'tre'];
        const lowText = text.toLowerCase();
        
        for (const name of names) {
            if (lowText.includes(name)) {
                return name;
            }
        }
        return null;
    }

    extractClientName(text) {
        if (text.toLowerCase().includes('corp')) {
            return "ClientCorp";
        }
        return "Client";
    }

    detectSentiment(text) {
        const lowText = text.toLowerCase();
        if (lowText.includes('great') || lowText.includes('good') || lowText.includes('positive')) {
            return 'positive';
        }
        if (lowText.includes('issue') || lowText.includes('problem') || lowText.includes('concern')) {
            return 'negative';
        }
        return 'neutral';
    }

    extractValue(text) {
        const match = text.match(/\$[\d,]+/);
        return match ? match[0] : "TBD";
    }

    getProcessingStats() {
        return {
            memberName: this.memberName,
            memberRole: this.memberRole,
            totalUpdatesProcessed: this.totalUpdatesProcessed,
            recentUpdates: this.processingHistory.slice(-5).length,
            lastUpdate: this.processingHistory.length > 0 ? 
                       this.processingHistory[this.processingHistory.length - 1].timestamp : null
        };
    }
}