#!/usr/bin/env node

/**
 * COMPREHENSIVE UX TEST SUITE
 * Tests the enhanced API responses, AI processing, and system reliability
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 10000}`;

console.log('🧪 Team CRM UX Test Suite');
console.log('==========================\n');

class UXTestSuite {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async runAllTests() {
        console.log(`Testing server at: ${BASE_URL}\n`);

        // Test categories
        await this.testHealthEndpoint();
        await this.testAPIResponseStructure();
        await this.testAIProcessingQuality();
        await this.testErrorHandling();
        await this.testPerformance();
        await this.testReliability();

        this.printResults();
    }

    async testHealthEndpoint() {
        console.log('📋 Testing Health Endpoint...');
        
        try {
            const response = await fetch(`${BASE_URL}/health`, { timeout: 5000 });
            const data = await response.json();

            this.assert('Health endpoint responds', response.ok);
            this.assert('Health response has enhanced structure', 
                data.success !== undefined && data.services !== undefined);
            this.assert('Health includes AI status', 
                data.services?.ai?.status !== undefined);
            this.assert('Health includes performance metrics', 
                data.performance !== undefined);

        } catch (error) {
            this.fail('Health endpoint failed', error.message);
        }
    }

    async testAPIResponseStructure() {
        console.log('\n📡 Testing API Response Structure...');

        const testUpdate = {
            memberName: 'joe',
            updateText: 'Had a great meeting with Acme Corp today. They want to move forward with a $250k contract but need executive approval by Friday. Some concerns about integration timeline.'
        };

        try {
            const response = await fetch(`${BASE_URL}/api/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testUpdate),
                timeout: 30000
            });

            const data = await response.json();

            this.assert('Update endpoint responds successfully', response.ok);
            this.assert('Response has enhanced structure', 
                data.success !== undefined && data.analysis !== undefined);
            this.assert('Response includes confidence scores', 
                data.analysis?.confidence !== undefined);
            this.assert('Response includes processing metadata', 
                data.metadata?.processingVersion !== undefined);
            this.assert('Response includes recommendations', 
                Array.isArray(data.recommendations));
            this.assert('Response includes quality indicators', 
                data.quality?.confidence !== undefined);

            // Test detailed analysis structure
            if (data.analysis) {
                this.assert('Analysis includes action items', 
                    Array.isArray(data.analysis.actionItems));
                this.assert('Analysis includes client information', 
                    Array.isArray(data.analysis.clients));
                this.assert('Analysis includes sentiment analysis', 
                    data.analysis.sentiment?.overall !== undefined);
                this.assert('Analysis includes executive escalation info', 
                    data.analysis.executiveEscalation?.required !== undefined);
            }

        } catch (error) {
            this.fail('API update test failed', error.message);
        }
    }

    async testAIProcessingQuality() {
        console.log('\n🤖 Testing AI Processing Quality...');

        const complexUpdate = {
            memberName: 'charlie',
            updateText: `URGENT: TechCorp deal is at risk. They're concerned about our API integration timeline and want to meet with executive team by Thursday. This is a $500K opportunity that could expand to $2M next year. Competitor is pushing hard. Need to schedule CEO meeting ASAP and prepare technical deep-dive presentation. Also, their CTO mentioned potential partnership for their sister company.`
        };

        try {
            const response = await fetch(`${BASE_URL}/api/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(complexUpdate),
                timeout: 45000
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Test AI extraction quality
                this.assert('AI extracted multiple items', 
                    data.extracted?.totalItems > 3);
                this.assert('AI detected urgency', 
                    data.analysis?.sentiment?.overall === 'concerned' || 
                    data.analysis?.priorities?.some(p => p.urgency === 'high' || p.urgency === 'critical'));
                this.assert('AI extracted dollar amounts', 
                    data.analysis?.clients?.some(c => c.dealValue > 0));
                this.assert('AI detected executive escalation need', 
                    data.analysis?.executiveEscalation?.required === true);
                this.assert('AI identified action items with deadlines', 
                    data.analysis?.actionItems?.some(a => a.deadline !== null));
                this.assert('AI confidence is reasonable', 
                    data.analysis?.confidence > 0.5);

            } else {
                this.assert('Fallback processing worked', 
                    data.metadata?.fallbackUsed === true);
                console.log('   ⚠️  AI processing unavailable, fallback used');
            }

        } catch (error) {
            this.fail('AI processing test failed', error.message);
        }
    }

    async testErrorHandling() {
        console.log('\n❌ Testing Error Handling...');

        // Test validation errors
        try {
            const response = await fetch(`${BASE_URL}/api/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberName: '',
                    updateText: 'short'
                }),
                timeout: 5000
            });

            const data = await response.json();

            this.assert('Validation errors return structured response', 
                !response.ok && data.error?.type !== undefined);
            this.assert('Error response includes troubleshooting', 
                data.support?.troubleshooting !== undefined);
            this.assert('Error response includes retry information', 
                data.error?.retryable !== undefined);

        } catch (error) {
            this.fail('Error handling test failed', error.message);
        }

        // Test invalid endpoint
        try {
            const response = await fetch(`${BASE_URL}/api/nonexistent`, { timeout: 5000 });
            this.assert('Invalid endpoints return 404', response.status === 404);
        } catch (error) {
            // Expected for non-existent endpoints
        }
    }

    async testPerformance() {
        console.log('\n⚡ Testing Performance...');

        const startTime = Date.now();
        
        try {
            const response = await fetch(`${BASE_URL}/health`, { timeout: 5000 });
            const healthTime = Date.now() - startTime;

            this.assert('Health check responds quickly', healthTime < 1000);

            // Test update processing time
            const updateStartTime = Date.now();
            const updateResponse = await fetch(`${BASE_URL}/api/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberName: 'joe',
                    updateText: 'Quick test update for performance measurement.'
                }),
                timeout: 30000
            });

            const updateTime = Date.now() - updateStartTime;
            const updateData = await updateResponse.json();

            this.assert('Update processing completes within reasonable time', 
                updateTime < 30000);

            if (updateResponse.ok && updateData.metadata?.processingTime) {
                this.assert('Processing time is tracked accurately', 
                    updateData.metadata.processingTime > 0);
                console.log(`   📊 Processing time: ${updateData.metadata.processingTime.toFixed(2)}s`);
            }

        } catch (error) {
            this.fail('Performance test failed', error.message);
        }
    }

    async testReliability() {
        console.log('\n🛡️ Testing System Reliability...');

        // Test multiple concurrent requests
        const concurrentTests = [];
        for (let i = 0; i < 3; i++) {
            concurrentTests.push(
                fetch(`${BASE_URL}/api/status`, { timeout: 10000 })
                    .then(r => r.json())
                    .catch(e => ({ error: e.message }))
            );
        }

        try {
            const results = await Promise.all(concurrentTests);
            const successCount = results.filter(r => !r.error).length;

            this.assert('System handles concurrent requests', successCount >= 2);

            // Test system status endpoint
            const statusResponse = await fetch(`${BASE_URL}/api/status`, { timeout: 5000 });
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                this.assert('System status provides useful information', 
                    statusData.initialized !== undefined);
            }

        } catch (error) {
            this.fail('Reliability test failed', error.message);
        }
    }

    // Test utilities
    assert(description, condition) {
        if (condition) {
            console.log(`   ✅ ${description}`);
            this.results.passed++;
        } else {
            console.log(`   ❌ ${description}`);
            this.results.failed++;
        }
        this.results.tests.push({ description, passed: condition });
    }

    fail(description, error) {
        console.log(`   ❌ ${description}: ${error}`);
        this.results.failed++;
        this.results.tests.push({ description, passed: false, error });
    }

    printResults() {
        console.log('\n📊 Test Results Summary');
        console.log('========================');
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📈 Success Rate: ${(this.results.passed / (this.results.passed + this.results.failed) * 100).toFixed(1)}%`);

        if (this.results.failed > 0) {
            console.log('\n🔍 Failed Tests:');
            this.results.tests
                .filter(t => !t.passed)
                .forEach(t => {
                    console.log(`   • ${t.description}${t.error ? ` (${t.error})` : ''}`);
                });
        }

        console.log('\n🎯 UX Assessment:');
        const successRate = this.results.passed / (this.results.passed + this.results.failed);
        
        if (successRate >= 0.9) {
            console.log('🌟 EXCELLENT: System provides high-quality, reliable user experience');
        } else if (successRate >= 0.7) {
            console.log('✅ GOOD: System is functional with room for improvement');
        } else if (successRate >= 0.5) {
            console.log('⚠️  FAIR: System works but has significant issues');
        } else {
            console.log('❌ POOR: System needs major improvements for production use');
        }

        console.log('\n💡 Recommendations:');
        if (this.results.failed === 0) {
            console.log('   • System is ready for production use');
            console.log('   • Consider adding monitoring and alerting');
            console.log('   • Monitor AI processing costs and performance');
        } else {
            console.log('   • Address failed tests before production deployment');
            console.log('   • Implement proper error monitoring');
            console.log('   • Consider adding circuit breakers for AI services');
            console.log('   • Set up automated health checks');
        }
    }
}

// Run the test suite
async function main() {
    const suite = new UXTestSuite();
    await suite.runAllTests();
}

main().catch(console.error);
