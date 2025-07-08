/**
 * EXECUTIVE SITUATIONAL AWARENESS API
 * Supporting executive intervention identification and team intelligence
 */

export class ExecutiveIntelligenceAPI {
    constructor(orchestrator, memorySystem) {
        this.orchestrator = orchestrator;
        this.memory = memorySystem;
        this.interventions = [];
        this.teamActivity = [];
        this.executiveComments = [];
        this.situationMetrics = {};
        
        // Initialize intelligence system
        this.initializeIntelligenceSystem();
    }

    initializeIntelligenceSystem() {
        // Mock current situations requiring executive attention
        this.interventions = [
            {
                id: 'acme-negotiation',
                type: 'deal_intervention',
                title: 'Acme Corp Contract Negotiation Stalled',
                description: 'Client pushing back on pricing structure. Deal value $500K at risk. They want executive-level discussion on terms.',
                urgency: 'critical',
                memberName: 'joe',
                memberDisplayName: 'Joe Martinez',
                dealValue: 500000,
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                context: {
                    clientName: 'Acme Corp',
                    issueType: 'pricing_objection',
                    dealStage: 'contract_negotiation',
                    timelineRisk: 'high',
                    competitorInvolved: false
                },
                recommendedActions: [
                    { action: 'schedule_meeting', label: 'Schedule Executive Meeting', primary: true },
                    { action: 'call_member', label: 'Call Joe Immediately', primary: false },
                    { action: 'brief_me', label: 'Get Full Briefing', primary: false }
                ]
            },
            {
                id: 'techco-blocker',
                type: 'meeting_required',
                title: 'TechCo CEO Wants Executive Presentation',
                description: 'Client CEO specifically requested executive-level presentation next week. Strategic partnership potential.',
                urgency: 'high',
                memberName: 'charlie',
                memberDisplayName: 'Charlie Chen',
                dealValue: 750000,
                timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                context: {
                    clientName: 'TechCo',
                    issueType: 'executive_meeting_request',
                    dealStage: 'strategic_discussion',
                    timelineRisk: 'medium',
                    partnershipPotential: true
                },
                recommendedActions: [
                    { action: 'join_meeting', label: 'Accept Meeting Request', primary: true },
                    { action: 'brief_me', label: 'Preparation Briefing', primary: false },
                    { action: 'call_member', label: 'Discuss with Charlie', primary: false }
                ]
            }
        ];

        // Mock team activity intelligence
        this.teamActivity = [
            {
                id: 'joe-update-1',
                memberName: 'joe',
                memberDisplayName: 'Joe Martinez',
                timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                summary: 'Acme Corp pushing back on implementation timeline. They need 6-month phased approach instead of 3-month. Concerned about internal resource allocation.',
                tags: ['Acme Corp', 'Timeline Adjustment', 'Resource Planning'],
                context: {
                    clientMood: 'cautious',
                    dealRisk: 'medium',
                    actionRequired: 'executive_guidance'
                }
            },
            {
                id: 'charlie-update-1',
                memberName: 'charlie',
                memberDisplayName: 'Charlie Chen',
                timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                summary: 'TechCo CEO very interested in strategic partnership beyond current deal. Mentioned potential for 3-year exclusive arrangement worth estimated $2M annually.',
                tags: ['TechCo', 'Strategic Partnership', 'Opportunity $2M+'],
                context: {
                    clientMood: 'very_positive',
                    dealRisk: 'low',
                    actionRequired: 'executive_meeting'
                }
            },
            {
                id: 'joe-update-2',
                memberName: 'joe',
                memberDisplayName: 'Joe Martinez',
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                summary: 'DataFlow Inc asking about competitive analysis. They want to understand how our solution compares to MegaCorp\'s offering. Need strategic positioning.',
                tags: ['DataFlow Inc', 'Competitive Analysis', 'Positioning'],
                context: {
                    clientMood: 'analytical',
                    dealRisk: 'medium',
                    actionRequired: 'strategic_information'
                }
            }
        ];

        // Mock situation metrics for context
        this.situationMetrics = {
            dealsRequiringAttention: 2,
            executiveMeetingsRequested: 1,
            revenueAtRisk: 500000,
            blockersIdentified: 1,
            teamUpdatesToday: 8,
            strategicOpportunities: 1
        };
    }

    /**
     * Get all current items requiring executive intervention
     */
    getExecutiveActions() {
        return {
            actions: this.interventions,
            summary: {
                total: this.interventions.length,
                critical: this.interventions.filter(i => i.urgency === 'critical').length,
                high: this.interventions.filter(i => i.urgency === 'high').length
            }
        };
    }

    /**
     * Get real-time team activity intelligence
     */
    getTeamActivity(limit = 10) {
        return {
            activities: this.teamActivity.slice(0, limit),
            summary: {
                total: this.teamActivity.length,
                lastUpdate: this.teamActivity.length > 0 ? this.teamActivity[0].timestamp : null
            }
        };
    }

    /**
     * Get current situational metrics
     */
    getSituationMetrics() {
        return this.situationMetrics;
    }

    /**
     * Get team performance for context (simplified for executive view)
     */
    getTeamPerformance() {
        return {
            joe: {
                name: 'Joe Martinez',
                metrics: {
                    updates_submitted: 5,
                    active_situations: 3,
                    client_interactions: 8,
                    escalations_created: 1
                },
                status: 'active',
                currentFocus: 'Acme Corp negotiation, DataFlow competitive analysis'
            },
            charlie: {
                name: 'Charlie Chen',
                metrics: {
                    updates_submitted: 3,
                    active_situations: 2,
                    client_interactions: 6,
                    escalations_created: 1
                },
                status: 'active',
                currentFocus: 'TechCo strategic partnership opportunity'
            }
        };
    }

    /**
     * Post executive comment/question to team
     */
    async postExecutiveComment(commentData) {
        const comment = {
            id: Date.now().toString(),
            message: commentData.message,
            author: 'Executive',
            timestamp: new Date().toISOString(),
            assignee: commentData.assignee,
            priority: commentData.priority || 'normal',
            status: 'sent',
            responses: []
        };

        this.executiveComments.unshift(comment);

        // Simulate team notification
        if (commentData.assignee) {
            console.log(`Executive comment sent to ${commentData.assignee}: ${commentData.message}`);
            
            // Create intervention if high priority
            if (commentData.priority === 'urgent' || commentData.priority === 'high') {
                this.createEscalation({
                    type: 'executive_question',
                    message: commentData.message,
                    assignee: commentData.assignee,
                    priority: commentData.priority
                });
            }
        }

        return comment;
    }

    /**
     * Get executive comments and team responses
     */
    getExecutiveComments(limit = 10) {
        return {
            comments: this.executiveComments.slice(0, limit)
        };
    }

    /**
     * Create escalation for executive attention
     */
    createEscalation(escalationData) {
        const escalation = {
            id: Date.now().toString(),
            type: escalationData.type,
            title: `Executive Question: ${escalationData.message.substring(0, 50)}...`,
            description: escalationData.message,
            urgency: escalationData.priority === 'urgent' ? 'critical' : 'high',
            memberName: escalationData.assignee,
            memberDisplayName: this.getMemberDisplayName(escalationData.assignee),
            timestamp: new Date().toISOString(),
            context: {
                questionType: 'executive_inquiry',
                responseRequired: true,
                priority: escalationData.priority
            },
            recommendedActions: [
                { action: 'call_member', label: 'Call Team Member', primary: true },
                { action: 'wait_response', label: 'Wait for Response', primary: false }
            ]
        };

        this.interventions.unshift(escalation);
        return escalation;
    }

    /**
     * Helper to get member display name
     */
    getMemberDisplayName(memberName) {
        const names = {
            'joe': 'Joe Martinez',
            'charlie': 'Charlie Chen'
        };
        return names[memberName] || memberName;
    }

    /**
     * Register API endpoints with Express app
     */
    registerEndpoints(app) {
        // Executive intervention alerts
        app.get('/api/executive-actions', (req, res) => {
            res.json(this.getExecutiveActions());
        });

        // Team activity intelligence
        app.get('/api/team-activity', (req, res) => {
            const limit = parseInt(req.query.limit) || 10;
            res.json(this.getTeamActivity(limit));
        });

        // Situational metrics
        app.get('/api/intelligence/metrics', (req, res) => {
            res.json(this.getSituationMetrics());
        });

        // Team performance context
        app.get('/api/dashboard/team-performance', (req, res) => {
            res.json(this.getTeamPerformance());
        });

        // Executive comments
        app.get('/api/comments', (req, res) => {
            const limit = parseInt(req.query.limit) || 10;
            res.json(this.getExecutiveComments(limit));
        });

        app.post('/api/comments', async (req, res) => {
            try {
                const comment = await this.postExecutiveComment(req.body);
                res.json({ success: true, comment });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Add new update from team (for real-time updates)
        app.post('/api/team-activity', (req, res) => {
            const activity = {
                id: Date.now().toString(),
                memberName: req.body.memberName,
                memberDisplayName: this.getMemberDisplayName(req.body.memberName),
                timestamp: new Date().toISOString(),
                summary: req.body.summary,
                tags: req.body.tags || [],
                context: req.body.context || {}
            };

            this.teamActivity.unshift(activity);
            
            // Keep only last 50 activities
            if (this.teamActivity.length > 50) {
                this.teamActivity = this.teamActivity.slice(0, 50);
            }

            res.json({ success: true, activity });
        });
    }
}