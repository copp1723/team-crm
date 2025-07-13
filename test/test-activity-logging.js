/**
 * Test script for User Activity Logging System
 * Tests all components of the activity logging implementation
 */

import axios from 'axios';
import { db } from './src/core/database/connection.js';

const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const TEST_USER = 'joe';
const TEST_PASSWORD = process.env.JOE_PASSWORD || 'changemeuuxv47';

// Create axios instance with auth
const api = axios.create({
    baseURL: BASE_URL,
    auth: {
        username: TEST_USER,
        password: TEST_PASSWORD
    },
    validateStatus: () => true // Don't throw on any status
});

async function runTests() {
    console.log('🧪 Testing User Activity Logging System...\n');
    
    try {
        // Initialize database connection
        console.log('📊 Initializing database connection...');
        await db.initialize();
        console.log('✅ Database connected\n');
        
        // Test 1: Basic API call logging
        console.log('Test 1: Basic API call logging');
        const testResponse = await api.get('/test');
        console.log(`  Response: ${testResponse.status} ${testResponse.statusText}`);
        
        // Verify activity was logged
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for async logging
        const activityCheck = await db.query(
            'SELECT * FROM user_activities WHERE user_id = $1 AND endpoint = $2 ORDER BY created_at DESC LIMIT 1',
            [TEST_USER, '/test']
        );
        console.log(`  ✅ Activity logged: ${activityCheck.rows.length > 0 ? 'Yes' : 'No'}`);
        if (activityCheck.rows.length > 0) {
            const activity = activityCheck.rows[0];
            console.log(`  - Response time: ${activity.response_time_ms}ms`);
            console.log(`  - Status code: ${activity.status_code}`);
            console.log(`  - Session ID: ${activity.session_id || 'None'}\n`);
        }
        
        // Test 2: Error logging
        console.log('Test 2: Error logging');
        const errorResponse = await api.get('/api/nonexistent');
        console.log(`  Response: ${errorResponse.status} ${errorResponse.statusText}`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        const errorCheck = await db.query(
            'SELECT * FROM user_activities WHERE user_id = $1 AND endpoint = $2 AND error_occurred = true ORDER BY created_at DESC LIMIT 1',
            [TEST_USER, '/api/nonexistent']
        );
        console.log(`  ✅ Error logged: ${errorCheck.rows.length > 0 ? 'Yes' : 'No'}\n`);
        
        // Test 3: Login tracking
        console.log('Test 3: Login tracking');
        const loginResponse = await api.post('/api/auth/login', {
            username: TEST_USER,
            password: TEST_PASSWORD
        });
        console.log(`  Response: ${loginResponse.status} ${loginResponse.statusText}`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        const loginCheck = await db.query(
            'SELECT * FROM login_activities WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [TEST_USER]
        );
        console.log(`  ✅ Login tracked: ${loginCheck.rows.length > 0 ? 'Yes' : 'No'}`);
        if (loginCheck.rows.length > 0) {
            const login = loginCheck.rows[0];
            console.log(`  - Status: ${login.login_status}`);
            console.log(`  - Risk score: ${login.risk_score || 0}\n`);
        }
        
        // Test 4: UI interaction tracking
        console.log('Test 4: UI interaction tracking');
        const uiResponse = await api.post('/api/track/interaction', {
            interactionType: 'click',
            elementId: 'test-button',
            elementText: 'Test Button',
            pageUrl: '/executive-dashboard',
            timeOnPage: 5000
        });
        console.log(`  Response: ${uiResponse.status} ${uiResponse.statusText}`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        const uiCheck = await db.query(
            'SELECT * FROM ui_interactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [TEST_USER]
        );
        console.log(`  ✅ UI interaction tracked: ${uiCheck.rows.length > 0 ? 'Yes' : 'No'}\n`);
        
        // Test 5: Rate limiting integration
        console.log('Test 5: Rate limiting integration');
        console.log('  Sending multiple rapid requests...');
        const rapidRequests = [];
        for (let i = 0; i < 15; i++) {
            rapidRequests.push(api.get('/api/test'));
        }
        const rapidResponses = await Promise.all(rapidRequests);
        const rateLimited = rapidResponses.filter(r => r.status === 429);
        console.log(`  Rate limited responses: ${rateLimited.length}`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        const rateLimitCheck = await db.query(
            `SELECT COUNT(*) as count FROM user_activities 
             WHERE user_id = $1 AND activity_type = 'rate_limit_exceeded' 
             AND created_at > NOW() - INTERVAL '1 minute'`,
            [TEST_USER]
        );
        console.log(`  ✅ Rate limit violations logged: ${rateLimitCheck.rows[0].count}\n`);
        
        // Test 6: Activity analytics endpoints
        console.log('Test 6: Activity analytics endpoints');
        
        // Get user summary
        const summaryResponse = await api.get(`/api/admin/activities/user/${TEST_USER}/summary?days=1`);
        console.log(`  User summary endpoint: ${summaryResponse.status}`);
        if (summaryResponse.status === 200) {
            const summary = summaryResponse.data.data;
            console.log(`  - Total activities: ${summary.total_activities}`);
            console.log(`  - Error rate: ${summary.errorRate}%`);
            console.log(`  - Avg response time: ${Math.round(summary.avg_response_time)}ms`);
        }
        
        // Get activity patterns
        const patternsResponse = await api.get(`/api/admin/activities/user/${TEST_USER}/patterns?days=1`);
        console.log(`  User patterns endpoint: ${patternsResponse.status}`);
        
        // Get endpoint stats
        const endpointResponse = await api.get('/api/admin/activities/endpoints/stats?days=1');
        console.log(`  Endpoint stats endpoint: ${endpointResponse.status}\n`);
        
        // Test 7: Performance metrics
        console.log('Test 7: Performance tracking');
        const slowEndpoint = await api.get('/api/test?delay=4000'); // Simulate slow request
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        const perfCheck = await db.query(
            `SELECT * FROM user_activities 
             WHERE user_id = $1 AND response_time_ms > 3000 
             ORDER BY created_at DESC LIMIT 1`,
            [TEST_USER]
        );
        console.log(`  ✅ Slow requests tracked: ${perfCheck.rows.length > 0 ? 'Yes' : 'No'}`);
        if (perfCheck.rows.length > 0) {
            console.log(`  - Response time: ${perfCheck.rows[0].response_time_ms}ms\n`);
        }
        
        // Summary
        console.log('\n📊 Test Summary:');
        const totalActivities = await db.query(
            'SELECT COUNT(*) as count FROM user_activities WHERE user_id = $1',
            [TEST_USER]
        );
        console.log(`  Total activities logged: ${totalActivities.rows[0].count}`);
        
        const activityTypes = await db.query(
            `SELECT activity_type, COUNT(*) as count 
             FROM user_activities WHERE user_id = $1 
             GROUP BY activity_type`,
            [TEST_USER]
        );
        console.log('  Activity types:');
        activityTypes.rows.forEach(row => {
            console.log(`    - ${row.activity_type}: ${row.count}`);
        });
        
        console.log('\n✅ All tests completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await db.close();
        process.exit(0);
    }
}

// Run tests
console.log('Starting activity logging tests...');
console.log('Make sure the server is running on', BASE_URL);
console.log('-----------------------------------\n');

runTests();