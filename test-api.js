#!/usr/bin/env node

/**
 * Quick test script to verify the API endpoint
 */

import fetch from 'node-fetch';

const testApiUpdate = async () => {
    try {
        console.log('Testing API update endpoint...');
        
        const response = await fetch('http://localhost:10000/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                memberName: 'joe',
                updateText: 'Just had a meeting with Acme Dealership. They are interested in our pilot program and want to schedule a demo next week. Concerns about integration with their existing system.'
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log('Response body:', responseText);
        
        if (response.ok) {
            const data = JSON.parse(responseText);
            console.log('Parsed response:', JSON.stringify(data, null, 2));
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
};

// Test health endpoint too
const testHealth = async () => {
    try {
        console.log('\nTesting health endpoint...');
        
        const response = await fetch('http://localhost:10000/health');
        const data = await response.json();
        
        console.log('Health check:', JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('Health check failed:', error.message);
    }
};

// Run tests
testHealth().then(() => testApiUpdate()).catch(console.error);
