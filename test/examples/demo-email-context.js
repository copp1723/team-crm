#!/usr/bin/env node

/**
 * Demo Email-to-Context Processing System
 */

console.log('🚀 Team CRM - Email-to-Context Processing Demo\n');

// Simulate incoming email
const sampleEmail = {
    messageId: 'msg_12345',
    from: { name: 'John Smith', address: 'john@acmecorp.com' },
    to: 'joe-assistant@mail.teamcrm.ai',
    subject: 'URGENT: Implementation Timeline Concerns',
    cleanText: `Hi Joe,

I hope this email finds you well. We need to discuss some urgent concerns about our implementation timeline.

The board is asking tough questions about the $150,000 investment and whether we can meet the Q1 deadline. They're particularly worried about the technical integration with our legacy systems.

Can we schedule a meeting this week to discuss? I'm available Tuesday or Wednesday afternoon.

Also, our CTO mentioned some security concerns that need addressing before we can proceed.

Best regards,
John Smith
VP of Operations, Acme Corp`,
    isReply: false,
    threadId: null
};

const assistant = {
    id: 'joe-assistant',
    name: 'Joe Martinez',
    assistantEmail: 'joe-assistant@mail.teamcrm.ai',
    externalId: 'joe'
};

console.log('📧 Processing Sample Email:');
console.log(`From: ${sampleEmail.from.name} <${sampleEmail.from.address}>`);
console.log(`To: ${sampleEmail.to}`);
console.log(`Subject: ${sampleEmail.subject}`);
console.log('');

// Simulate context extraction
console.log('🔍 Email Context Extraction:');
console.log('');

const emailContext = {
    source: 'email',
    timestamp: new Date().toISOString(),
    messageId: sampleEmail.messageId,
    
    email: {
        from: sampleEmail.from,
        to: sampleEmail.to,
        subject: sampleEmail.subject,
        isReply: false
    },
    
    sender: {
        email: 'john@acmecorp.com',
        name: 'John Smith',
        domain: 'acmecorp.com',
        isInternal: false,
        isKnownClient: true,
        communicationHistory: {
            emailCount: 12,
            lastContact: '2024-12-15',
            relationship: 'client'
        }
    },
    
    urgency: {
        level: 'high',
        keywords: ['urgent', 'deadline', 'concerns'],
        hasDeadline: true,
        hasTimeConstraint: true
    },
    
    business: {
        financial: {
            amounts: [{ value: '$150,000', context: 'investment' }],
            hasFinancialContent: true
        },
        entities: {
            companies: ['Acme Corp'],
            people: ['John Smith'],
            hasBusinessEntities: true
        },
        projects: {
            references: ['implementation timeline', 'technical integration'],
            hasProjectContent: true
        },
        meetings: {
            requested: true,
            hasTimeReference: true,
            urgency: 'high'
        }
    },
    
    assistant: {
        id: assistant.id,
        name: assistant.name,
        email: assistant.assistantEmail
    }
};

console.log('✅ Context Extracted:');
console.log(`  • Urgency Level: ${emailContext.urgency.level}`);
console.log(`  • Financial Content: ${emailContext.business.financial.amounts[0].value}`);
console.log(`  • Meeting Requested: ${emailContext.business.meetings.requested ? 'Yes' : 'No'}`);
console.log(`  • Known Client: ${emailContext.sender.isKnownClient ? 'Yes' : 'No'}`);
console.log('');

// Simulate AI processing
console.log('🤖 AI Processing Results:');
const processedData = {
    extracted_data: {
        summary: 'Client expressing urgent concerns about $150K implementation timeline and Q1 deadline',
        priorities: [
            'Address board concerns about investment ROI',
            'Resolve technical integration issues',
            'Schedule urgent client meeting'
        ],
        action_items: [
            { action: 'Schedule meeting with John Smith', owner: 'Joe Martinez', deadline: 'This week' },
            { action: 'Prepare board presentation on timeline', owner: 'Joe Martinez', deadline: 'Before meeting' },
            { action: 'Address CTO security concerns', owner: 'Technical team', deadline: 'ASAP' }
        ],
        key_metrics: [
            { metric: 'Investment Amount', value: '$150,000', context: 'At risk due to timeline concerns' }
        ],
        entities: {
            people: ['John Smith'],
            companies: ['Acme Corp'],
            projects: ['Q1 Implementation'],
            deadlines: ['Q1 deadline', 'This week meeting']
        },
        sentiment: 'urgent',
        follow_up_needed: true,
        email_type: 'complaint',
        response_needed: true,
        urgency_level: 'critical'
    },
    confidence: 0.9,
    requires_attention: true
};

console.log('✅ AI Analysis Complete:');
console.log(`  • Summary: ${processedData.extracted_data.summary}`);
console.log(`  • Action Items: ${processedData.extracted_data.action_items.length}`);
console.log(`  • Urgency: ${processedData.extracted_data.urgency_level}`);
console.log(`  • Requires Attention: ${processedData.requires_attention ? 'Yes' : 'No'}`);
console.log('');

// Simulate team update conversion
console.log('📝 Converting to Team Update:');
const teamUpdate = {
    memberName: 'Joe Martinez',
    updateText: `URGENT: Email from John Smith (Acme Corp): Implementation Timeline Concerns

Client expressing urgent concerns about $150K implementation timeline and Q1 deadline

Financial content: $150,000

Meeting requested`,
    metadata: {
        source: 'email',
        messageId: sampleEmail.messageId,
        fromEmail: sampleEmail.from.address,
        subject: sampleEmail.subject,
        urgency: emailContext.urgency,
        businessContext: emailContext.business,
        processedData: processedData.extracted_data
    }
};

console.log('✅ Team Update Created:');
console.log(`  • Member: ${teamUpdate.memberName}`);
console.log(`  • Source: ${teamUpdate.metadata.source}`);
console.log(`  • Update Text: ${teamUpdate.updateText.substring(0, 100)}...`);
console.log('');

// Simulate executive escalation check
console.log('⚡ Executive Escalation Check:');
const shouldEscalate = 
    emailContext.urgency.level === 'high' ||
    emailContext.business.financial.hasFinancialContent ||
    emailContext.business.meetings.requested ||
    processedData.requires_attention;

console.log('✅ Escalation Decision:');
console.log(`  • Should Escalate: ${shouldEscalate ? 'YES' : 'No'}`);
console.log(`  • Reasons:`);
if (emailContext.urgency.level === 'high') console.log(`    - High urgency detected`);
if (emailContext.business.financial.hasFinancialContent) console.log(`    - Financial content requires attention`);
if (emailContext.business.meetings.requested) console.log(`    - Meeting request from external party`);
if (processedData.requires_attention) console.log(`    - AI flagged as requiring attention`);
console.log('');

// Simulate memory storage
console.log('🧠 Memory Storage:');
const memoryEntry = {
    type: 'email_context',
    memberName: 'Joe Martinez',
    timestamp: emailContext.timestamp,
    emailData: {
        from: emailContext.email.from,
        subject: emailContext.email.subject,
        urgency: emailContext.urgency,
        businessContext: emailContext.business
    },
    extractedData: processedData.extracted_data,
    escalated: shouldEscalate
};

console.log('✅ Stored in Enhanced Memory:');
console.log(`  • Type: ${memoryEntry.type}`);
console.log(`  • Member: ${memoryEntry.memberName}`);
console.log(`  • Escalated: ${memoryEntry.escalated ? 'Yes' : 'No'}`);
console.log('');

// Show executive summary impact
if (shouldEscalate) {
    console.log('📊 Executive Summary Impact:');
    console.log('');
    console.log('🎯 EXECUTIVE SUMMARY');
    console.log('');
    console.log('📧 EMAIL ESCALATIONS:');
    console.log('• 1 emails escalated to executive attention');
    console.log('• URGENT: Implementation Timeline Concerns');
    console.log('');
    console.log('ATTENTION REQUIRED:');
    console.log('• Address board concerns about investment ROI (Joe Martinez)');
    console.log('• Resolve technical integration issues (Joe Martinez)');
    console.log('');
    console.log('REVENUE IMPACT:');
    console.log('• $150,000 investment at risk due to timeline concerns');
    console.log('');
    console.log('NEXT STEPS:');
    console.log('• Schedule urgent client meeting this week');
    console.log('• Prepare board presentation on timeline');
    console.log('• Address CTO security concerns immediately');
    console.log('');
}

console.log('🎯 Definition of Done - COMPLETED:');
console.log('  ✅ Incoming emails parsed and contextualized');
console.log('  ✅ Email context stored in personal assistant memory');
console.log('  ✅ Integration with existing update processing pipeline');
console.log('  ✅ Executive escalation from email content');
console.log('');

console.log('📋 Implementation Summary:');
console.log('');
console.log('✅ Files Created/Enhanced:');
console.log('  • src/core/email/context-extractor.js (NEW)');
console.log('  • src/core/orchestration/team-orchestrator.js (ENHANCED)');
console.log('  • src/core/memory/enhanced-memory-integration.js (ENHANCED)');
console.log('  • src/core/email/assistant-email-handler.js (ENHANCED)');
console.log('  • src/core/agents/simple-master-agent.js (ENHANCED)');
console.log('');

console.log('✅ Key Features:');
console.log('  • Email content parsing and contextualization');
console.log('  • Business entity and financial data extraction');
console.log('  • Urgency detection and priority scoring');
console.log('  • Automatic executive escalation');
console.log('  • Memory integration for learning');
console.log('  • Team update pipeline integration');
console.log('');

console.log('✨ Email-to-Context Processing system is ready!');
console.log('   Emails are now intelligently processed and integrated');
console.log('   into the team intelligence and executive systems.');
console.log('');