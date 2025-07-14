#!/usr/bin/env node

/**
 * Test script for Supermemory integration
 * Verifies that personal assistants use memory correctly
 */

import { PersonalAssistantFactory } from '../src/core/agents/personal-assistant-factory.js';
import { logger } from '../src/utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSupermemoryIntegration() {
    console.log('🧪 Testing Supermemory Integration...\n');
    
    // Check if Supermemory API key is configured
    if (!process.env.SUPERMEMORY_API_KEY) {
        console.error('❌ SUPERMEMORY_API_KEY not set in environment');
        console.log('Please set SUPERMEMORY_API_KEY in your .env file');
        process.exit(1);
    }
    
    console.log('✅ Supermemory API key found\n');
    
    try {
        // Initialize factory
        const factory = new PersonalAssistantFactory();
        
        // Test creating assistant for Joe
        console.log('1️⃣ Creating personal assistant for Joe...');
        const joeAssistant = await factory.createAssistant('joe', {
            id: 'joe',
            name: 'Joe',
            role: 'Sales Consultant',
            ai_model: 'claude-3-sonnet'
        });
        
        console.log('✅ Assistant created');
        console.log(`   - Has memory: ${!!joeAssistant.memory}`);
        console.log(`   - Space ID: ${joeAssistant.config?.supermemoryConfig?.spaceId || 'None'}\n`);
        
        // Test processing an update
        console.log('2️⃣ Processing first update (no memory context)...');
        const update1 = "Just had a great meeting with Downtown Toyota. They're interested in our premium package at $15k/month. The GM loves the AI features.";
        
        const result1 = await joeAssistant.processUpdate(update1);
        console.log('✅ First update processed');
        console.log(`   - Success: ${result1.success || !!result1.extracted}`);
        console.log(`   - Memory context used: ${result1.memoryContextUsed || false}`);
        console.log(`   - Extracted items: ${JSON.stringify(result1.extracted?.clientInfo || [])}\n`);
        
        // Wait a bit for memory to be stored
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test processing second update (should have memory context)
        console.log('3️⃣ Processing second update (with memory context)...');
        const update2 = "Following up with Toyota tomorrow about the contract. They had some questions about integration timeline.";
        
        const result2 = await joeAssistant.processUpdate(update2);
        console.log('✅ Second update processed');
        console.log(`   - Success: ${result2.success || !!result2.extracted}`);
        console.log(`   - Memory context used: ${result2.memoryContextUsed || false}`);
        console.log(`   - Client intelligence: ${JSON.stringify(result2.clientIntelligence || {})}\n`);
        
        // Test memory search directly
        if (joeAssistant.memory) {
            console.log('4️⃣ Testing direct memory search...');
            try {
                const memories = await joeAssistant.memory.searchMemories({
                    query: 'Toyota',
                    userId: 'joe',
                    limit: 5
                });
                console.log(`✅ Memory search complete`);
                console.log(`   - Memories found: ${memories.length}`);
                if (memories.length > 0) {
                    console.log(`   - First memory: ${memories[0].content.text?.substring(0, 50)}...`);
                }
            } catch (error) {
                console.log(`⚠️  Memory search failed: ${error.message}`);
            }
        }
        
        console.log('\n✅ Supermemory integration test complete!');
        
        // Summary
        console.log('\n📊 Summary:');
        console.log(`- Assistant created: ✅`);
        console.log(`- Memory initialized: ${joeAssistant.memory ? '✅' : '❌'}`);
        console.log(`- Updates processed: ✅`);
        console.log(`- Memory context working: ${result2.memoryContextUsed ? '✅' : '❌'}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testSupermemoryIntegration().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});