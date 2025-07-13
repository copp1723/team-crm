#!/usr/bin/env node

/**
 * Simple server test script that checks the actual running port
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function findRunningServer() {
    const possiblePorts = [
        process.env.PORT || 10000,
        8080,
        3000,
        10000
    ];
    
    console.log('🔍 Looking for running Team CRM server...\n');
    
    for (const port of possiblePorts) {
        try {
            console.log(`Checking port ${port}...`);
            const response = await fetch(`http://localhost:${port}/health`, { 
                timeout: 2000 
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Found server running on port ${port}`);
                console.log(`   Status: ${data.status || 'unknown'}`);
                console.log(`   URLs:`);
                console.log(`   - Chat: http://localhost:${port}/chat`);
                console.log(`   - Executive: http://localhost:${port}/executive-dashboard`);
                console.log(`   - API: http://localhost:${port}/api/docs`);
                
                // Test the update endpoint
                console.log(`\n📝 Testing update endpoint...`);
                try {
                    const updateResponse = await fetch(`http://localhost:${port}/api/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            memberName: 'joe',
                            updateText: 'Quick test message to verify the API is working correctly.'
                        }),
                        timeout: 5000
                    });
                    
                    if (updateResponse.ok) {
                        console.log(`✅ Update endpoint working (${updateResponse.status})`);
                    } else {
                        console.log(`❌ Update endpoint error: ${updateResponse.status} ${updateResponse.statusText}`);
                        const errorText = await updateResponse.text();
                        console.log(`   Response: ${errorText.substring(0, 200)}`);
                    }
                } catch (updateError) {
                    console.log(`❌ Update endpoint failed: ${updateError.message}`);
                }
                
                return port;
            }
        } catch (error) {
            console.log(`   No server on port ${port}`);
        }
    }
    
    console.log('\n❌ No running Team CRM server found');
    console.log('💡 Start the server with: npm start');
    return null;
}

findRunningServer().catch(console.error);
