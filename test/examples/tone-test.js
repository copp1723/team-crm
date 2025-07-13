#!/usr/bin/env node

/**
 * TONE COMPARISON TEST
 * Shows the difference between old robotic tone and new natural tone
 */

console.log('🎭 TEAM CRM TONE TRANSFORMATION');
console.log('================================\n');

const comparisons = [
    {
        category: 'UI Buttons & Headers',
        before: {
            button: 'Submit Team Update',
            header: 'Team Intelligence Input',
            subtitle: 'AI will extract actionable insights for executive awareness',
            placeholder: 'Include client information, deadlines, priorities, and any concerns. The AI will automatically extract key insights...'
        },
        after: {
            button: 'Share Update',
            header: 'Team Updates',
            subtitle: "What's happening on your end? Share updates about clients, deals, meetings...",
            placeholder: "What's going on? Share client meetings, deal updates, concerns, deadlines, or anything else worth mentioning. Write naturally - no need to format anything special."
        }
    },
    {
        category: 'Processing Messages',
        before: {
            processing: 'Processing your update with AI...',
            analyzing: 'AI is analyzing your content...',
            complete: 'AI processing complete. Results below.'
        },
        after: {
            processing: 'Reading through your update...',
            analyzing: 'Taking a look at this...',
            complete: "Thanks for sharing! Here's what I picked up on..."
        }
    },
    {
        category: 'Error Messages',
        before: {
            empty: 'Invalid updateText: must be a non-empty string',
            tooShort: 'Update text too short. Minimum 10 characters required.',
            network: 'Network error: Failed to connect to server',
            ai: 'AI processing temporarily unavailable'
        },
        after: {
            empty: 'Hey, looks like your update was empty. Mind adding some content?',
            tooShort: 'Could you share a bit more detail? That\'ll help us understand better',
            network: 'Hmm, looks like there\'s a connection hiccup. Mind trying again?',
            ai: 'AI service is temporarily busy. We did some basic analysis instead.'
        }
    },
    {
        category: 'Results Headers',
        before: {
            results: 'Analysis Results',
            actions: 'Extracted Action Items',
            clients: 'Client Information',
            insights: 'Key Insights Identified'
        },
        after: {
            results: "Here's What I Noticed",
            actions: 'Action Items',
            clients: 'Client Activity',
            insights: 'Key Takeaways'
        }
    },
    {
        category: 'AI System Prompts',
        before: {
            prompt: 'You are an AI assistant analyzing team updates for a sales organization. Extract actionable insights, identify priorities, and provide executive-level summaries.',
            instruction: 'Analyze the following text and extract structured data in JSON format.'
        },
        after: {
            prompt: "Hey, I need your help with something. You're helping analyze team updates for a sales organization. Think of yourself as a smart colleague who's good at spotting important details.",
            instruction: "Can you work your magic on this team update? I need you to pull out the important stuff and organize it."
        }
    },
    {
        category: 'Troubleshooting Steps',
        before: {
            step1: 'Ensure update text is between 10-10,000 characters',
            step2: 'Verify network connectivity',
            step3: 'Check API key configuration',
            step4: 'Validate JSON response format'
        },
        after: {
            step1: 'Make sure your update is between 10-10,000 characters',
            step2: 'Give your internet a quick check',
            step3: 'Double-check the API key is set up right',
            step4: 'Sometimes the response format gets wonky - try again?'
        }
    }
];

// Display comparisons
comparisons.forEach(comp => {
    console.log(`📋 ${comp.category.toUpperCase()}`);
    console.log('-'.repeat(50));
    
    Object.keys(comp.before).forEach(key => {
        console.log(`\n${key.charAt(0).toUpperCase() + key.slice(1)}:`);
        console.log(`❌ BEFORE: "${comp.before[key]}"`);
        console.log(`✅ AFTER:  "${comp.after[key]}"`);
    });
    
    console.log('\n');
});

console.log('🎯 TONE STRATEGY');
console.log('================');
console.log('✅ Talk TO users, not AT them');
console.log('✅ Focus on outcomes, not processes');
console.log('✅ Use "we" instead of "AI" or "system"');
console.log('✅ Be honest about failures without drama');
console.log('✅ Guide without lecturing');
console.log('✅ Sound like a smart teammate, not a robot');

console.log('\n💡 The Result:');
console.log('The system now feels like a helpful colleague rather than');
console.log('an intimidating AI tool. Users will share natural updates');
console.log('instead of trying to "feed the AI" with structured data.\n');