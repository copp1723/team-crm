/**
 * ANALYTICS ENGINE
 * Handles data persistence, trend analysis, and AI-powered forecasting
 */

import { db, dbHelpers } from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';

export class AnalyticsEngine {
    constructor() {
        this.initialized = false;
        this.snapshotInterval = null;
    }

    /**
     * Initialize the analytics engine
     */
    async initialize() {
        try {
            console.log('🔍 Initializing Analytics Engine...');
            
            // Start periodic snapshot collection
            this.startSnapshotCollection();
            
            // Initialize with current metrics
            await this.captureCurrentMetrics();
            
            this.initialized = true;
            console.log('✅ Analytics Engine initialized');
        } catch (error) {
            console.error('❌ Analytics Engine initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start periodic collection of analytics snapshots
     */
    startSnapshotCollection() {
        // Capture snapshots every hour
        this.snapshotInterval = setInterval(async () => {
            await this.captureCurrentMetrics();
        }, 60 * 60 * 1000); // 1 hour

        // Also capture at midnight for daily summaries
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const timeUntilMidnight = midnight.getTime() - now.getTime();
        
        setTimeout(() => {
            this.captureDailySummary();
            // Then repeat daily
            setInterval(() => this.captureDailySummary(), 24 * 60 * 60 * 1000);
        }, timeUntilMidnight);
    }

    /**
     * Capture current metrics snapshot
     */
    async captureCurrentMetrics() {
        try {
            // Pipeline metrics
            const pipeline = await dbHelpers.getPipelineSummary();
            for (const stage of pipeline) {
                await dbHelpers.saveAnalyticsSnapshot(
                    'pipeline_count', 
                    stage.deal_count, 
                    'by_stage', 
                    stage.stage
                );
                await dbHelpers.saveAnalyticsSnapshot(
                    'pipeline_value', 
                    stage.total_value || 0, 
                    'by_stage', 
                    stage.stage
                );
                await dbHelpers.saveAnalyticsSnapshot(
                    'pipeline_weighted_value', 
                    stage.weighted_value || 0, 
                    'by_stage', 
                    stage.stage
                );
            }

            // Team performance metrics
            const teamPerf = await dbHelpers.getTeamPerformance();
            for (const member of teamPerf) {
                await dbHelpers.saveAnalyticsSnapshot(
                    'active_deals', 
                    member.active_deals, 
                    'by_owner', 
                    member.name
                );
                await dbHelpers.saveAnalyticsSnapshot(
                    'revenue_closed', 
                    member.revenue_closed || 0, 
                    'by_owner', 
                    member.name
                );
            }

            // Overall metrics
            const totalPipeline = pipeline.reduce((sum, s) => sum + (s.weighted_value || 0), 0);
            await dbHelpers.saveAnalyticsSnapshot('total_pipeline_value', totalPipeline, 'overall');

            const totalDeals = pipeline.reduce((sum, s) => sum + s.deal_count, 0);
            await dbHelpers.saveAnalyticsSnapshot('total_deals', totalDeals, 'overall');

            console.log('📊 Analytics snapshot captured');
        } catch (error) {
            console.error('Error capturing metrics:', error);
        }
    }

    /**
     * Capture comprehensive daily summary
     */
    async captureDailySummary() {
        try {
            console.log('📅 Capturing daily summary...');
            
            // Get all today's metrics for daily rollup
            const today = new Date().toISOString().split('T')[0];
            
            // Calculate conversion rates
            const conversionRate = await this.calculateConversionRate(today);
            await dbHelpers.saveAnalyticsSnapshot(
                'conversion_rate', 
                conversionRate, 
                'overall', 
                null, 
                'daily'
            );

            // Calculate average deal size
            const avgDealSize = await this.calculateAverageDealSize();
            await dbHelpers.saveAnalyticsSnapshot(
                'avg_deal_size', 
                avgDealSize, 
                'overall', 
                null, 
                'daily'
            );

            // Activity metrics
            const dailyActivities = await this.getDailyActivityCount(today);
            await dbHelpers.saveAnalyticsSnapshot(
                'daily_activities', 
                dailyActivities, 
                'overall', 
                null, 
                'daily'
            );

            console.log('✅ Daily summary captured');
        } catch (error) {
            console.error('Error capturing daily summary:', error);
        }
    }

    /**
     * Calculate conversion rate for a given date
     */
    async calculateConversionRate(date) {
        const result = await db.query(`
            SELECT 
                COUNT(CASE WHEN stage = 'closed_won' THEN 1 END)::float / 
                NULLIF(COUNT(*), 0) * 100 as conversion_rate
            FROM deals
            WHERE DATE(created_at) <= $1::date
        `, [date]);
        
        return result.rows[0]?.conversion_rate || 0;
    }

    /**
     * Calculate average deal size
     */
    async calculateAverageDealSize() {
        const result = await db.query(`
            SELECT AVG(amount) as avg_deal_size
            FROM deals
            WHERE stage = 'closed_won' AND amount IS NOT NULL
        `);
        
        return result.rows[0]?.avg_deal_size || 0;
    }

    /**
     * Get daily activity count
     */
    async getDailyActivityCount(date) {
        const result = await db.query(`
            SELECT COUNT(*) as count
            FROM deal_activities
            WHERE DATE(created_at) = $1::date
        `, [date]);
        
        return result.rows[0]?.count || 0;
    }

    /**
     * Get trend analysis for a metric
     */
    async getTrendAnalysis(metricType, days = 30, dimension = null) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const historicalData = await dbHelpers.getHistoricalAnalytics(
            metricType, 
            startDate.toISOString(), 
            endDate.toISOString(), 
            dimension
        );

        // Calculate trend
        if (historicalData.length < 2) {
            return { trend: 'insufficient_data', data: historicalData };
        }

        // Simple linear regression for trend
        const xValues = historicalData.map((_, i) => i);
        const yValues = historicalData.map(d => d.metric_value);
        
        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const trend = slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable';
        
        // Calculate percentage change
        const firstValue = yValues[yValues.length - 1];
        const lastValue = yValues[0];
        const percentageChange = firstValue !== 0 
            ? ((lastValue - firstValue) / firstValue) * 100 
            : 0;

        return {
            trend,
            slope,
            percentageChange,
            data: historicalData,
            summary: this.generateTrendSummary(metricType, trend, percentageChange)
        };
    }

    /**
     * Generate human-readable trend summary
     */
    generateTrendSummary(metricType, trend, percentageChange) {
        const direction = trend === 'increasing' ? 'up' : trend === 'decreasing' ? 'down' : 'stable';
        const change = Math.abs(percentageChange).toFixed(1);
        
        const metricLabels = {
            'pipeline_value': 'Pipeline value',
            'conversion_rate': 'Conversion rate',
            'active_deals': 'Active deals',
            'revenue_closed': 'Closed revenue',
            'avg_deal_size': 'Average deal size'
        };
        
        const label = metricLabels[metricType] || metricType;
        
        if (trend === 'stable') {
            return `${label} has remained stable`;
        }
        
        return `${label} is ${direction} ${change}% over the period`;
    }

    /**
     * AI-powered forecast based on historical patterns
     */
    async generateForecast(metricType, forecastDays = 30, dimension = null) {
        try {
            // Get historical data (90 days for better pattern recognition)
            const trendData = await this.getTrendAnalysis(metricType, 90, dimension);
            
            if (trendData.trend === 'insufficient_data') {
                return { error: 'Insufficient historical data for forecasting' };
            }

            // Simple forecast using linear projection
            const lastValue = trendData.data[0].metric_value;
            const dailyChange = trendData.slope;
            
            const forecast = [];
            for (let i = 1; i <= forecastDays; i++) {
                const date = new Date();
                date.setDate(date.getDate() + i);
                
                // Add some variance based on historical volatility
                const volatility = this.calculateVolatility(trendData.data);
                const randomFactor = 1 + (Math.random() - 0.5) * volatility * 0.1;
                
                const forecastValue = Math.max(0, lastValue + (dailyChange * i) * randomFactor);
                
                forecast.push({
                    date: date.toISOString().split('T')[0],
                    value: forecastValue,
                    confidence: Math.max(0.5, 1 - (i / forecastDays) * 0.5) // Confidence decreases over time
                });
            }

            // Detect seasonal patterns (simplified)
            const seasonalPattern = this.detectSeasonalPattern(trendData.data);
            
            return {
                forecast,
                trend: trendData.trend,
                seasonalPattern,
                confidence: this.calculateForecastConfidence(trendData),
                insights: this.generateForecastInsights(metricType, forecast, trendData)
            };
        } catch (error) {
            console.error('Error generating forecast:', error);
            return { error: 'Failed to generate forecast' };
        }
    }

    /**
     * Calculate volatility of historical data
     */
    calculateVolatility(data) {
        if (data.length < 2) return 0;
        
        const values = data.map(d => d.metric_value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        
        return Math.sqrt(variance) / mean; // Coefficient of variation
    }

    /**
     * Detect seasonal patterns in data
     */
    detectSeasonalPattern(data) {
        // Simplified: Check for weekly patterns
        if (data.length < 14) return null;
        
        const dayAverages = {};
        data.forEach(item => {
            const day = new Date(item.snapshot_date).getDay();
            if (!dayAverages[day]) {
                dayAverages[day] = { sum: 0, count: 0 };
            }
            dayAverages[day].sum += item.metric_value;
            dayAverages[day].count++;
        });
        
        const avgByDay = Object.entries(dayAverages).map(([day, stats]) => ({
            day: parseInt(day),
            average: stats.sum / stats.count
        }));
        
        // Find peak and trough days
        const sorted = [...avgByDay].sort((a, b) => b.average - a.average);
        const peak = sorted[0];
        const trough = sorted[sorted.length - 1];
        
        if (peak.average / trough.average > 1.2) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return {
                type: 'weekly',
                peakDay: days[peak.day],
                troughDay: days[trough.day],
                variance: (peak.average - trough.average) / trough.average
            };
        }
        
        return null;
    }

    /**
     * Calculate forecast confidence
     */
    calculateForecastConfidence(trendData) {
        const volatility = this.calculateVolatility(trendData.data);
        const dataPoints = trendData.data.length;
        
        // Higher confidence with more data points and lower volatility
        const dataConfidence = Math.min(1, dataPoints / 30);
        const volatilityConfidence = Math.max(0, 1 - volatility);
        
        return (dataConfidence + volatilityConfidence) / 2;
    }

    /**
     * Generate actionable forecast insights
     */
    generateForecastInsights(metricType, forecast, trendData) {
        const insights = [];
        
        // Trend insight
        if (trendData.trend === 'increasing') {
            insights.push({
                type: 'positive',
                message: `${metricType} is on an upward trajectory`,
                recommendation: 'Continue current strategies and monitor for sustainability'
            });
        } else if (trendData.trend === 'decreasing') {
            insights.push({
                type: 'warning',
                message: `${metricType} shows a declining trend`,
                recommendation: 'Review and adjust strategies to reverse the trend'
            });
        }
        
        // Forecast insight
        const forecastEnd = forecast[forecast.length - 1];
        const currentValue = trendData.data[0].metric_value;
        const projectedChange = ((forecastEnd.value - currentValue) / currentValue) * 100;
        
        if (Math.abs(projectedChange) > 20) {
            insights.push({
                type: projectedChange > 0 ? 'opportunity' : 'risk',
                message: `Expecting ${Math.abs(projectedChange).toFixed(1)}% ${projectedChange > 0 ? 'increase' : 'decrease'} over next ${forecast.length} days`,
                recommendation: projectedChange > 0 
                    ? 'Prepare resources to handle increased volume'
                    : 'Implement corrective measures to prevent further decline'
            });
        }
        
        // Seasonal insight
        if (trendData.seasonalPattern) {
            insights.push({
                type: 'pattern',
                message: `Weekly pattern detected: Peak on ${trendData.seasonalPattern.peakDay}, low on ${trendData.seasonalPattern.troughDay}`,
                recommendation: 'Align resource allocation with weekly patterns'
            });
        }
        
        return insights;
    }

    /**
     * Export analytics data for presentations
     */
    async exportAnalytics(startDate, endDate, format = 'json') {
        try {
            // Gather all relevant data
            const exportData = {
                metadata: {
                    generatedAt: new Date().toISOString(),
                    period: { start: startDate, end: endDate },
                    format
                },
                summary: {
                    pipeline: await dbHelpers.getPipelineSummary(),
                    teamPerformance: await dbHelpers.getTeamPerformance()
                },
                trends: {},
                forecasts: {}
            };

            // Get trends for key metrics
            const keyMetrics = ['pipeline_value', 'conversion_rate', 'active_deals', 'revenue_closed'];
            for (const metric of keyMetrics) {
                exportData.trends[metric] = await this.getTrendAnalysis(metric, 30);
                exportData.forecasts[metric] = await this.generateForecast(metric, 30);
            }

            // Format based on request
            if (format === 'csv') {
                return this.formatAsCSV(exportData);
            } else if (format === 'summary') {
                return this.formatAsExecutiveSummary(exportData);
            }
            
            return exportData;
        } catch (error) {
            console.error('Error exporting analytics:', error);
            throw error;
        }
    }

    /**
     * Format data as CSV
     */
    formatAsCSV(data) {
        // Simplified CSV generation
        const lines = ['Metric,Current Value,Trend,30-Day Change'];
        
        for (const [metric, trendData] of Object.entries(data.trends)) {
            const current = trendData.data[0]?.metric_value || 0;
            const trend = trendData.trend;
            const change = trendData.percentageChange?.toFixed(1) || '0';
            
            lines.push(`${metric},${current},${trend},${change}%`);
        }
        
        return lines.join('\n');
    }

    /**
     * Format as executive summary
     */
    formatAsExecutiveSummary(data) {
        const summary = {
            headline: 'Sales Performance Executive Summary',
            period: `${data.metadata.period.start} to ${data.metadata.period.end}`,
            keyMetrics: [],
            insights: [],
            recommendations: []
        };

        // Process each metric
        for (const [metric, trendData] of Object.entries(data.trends)) {
            const current = trendData.data[0]?.metric_value || 0;
            const forecast = data.forecasts[metric];
            
            summary.keyMetrics.push({
                metric,
                currentValue: current,
                trend: trendData.summary,
                forecast: forecast.forecast?.[29]?.value || null
            });

            // Add insights
            if (forecast.insights) {
                summary.insights.push(...forecast.insights);
            }
        }

        // Generate recommendations
        const hasDecline = Object.values(data.trends).some(t => t.trend === 'decreasing');
        const hasGrowth = Object.values(data.trends).some(t => t.trend === 'increasing');
        
        if (hasDecline) {
            summary.recommendations.push({
                priority: 'high',
                action: 'Address declining metrics immediately',
                details: 'Focus on metrics showing downward trends'
            });
        }
        
        if (hasGrowth) {
            summary.recommendations.push({
                priority: 'medium',
                action: 'Capitalize on positive momentum',
                details: 'Allocate resources to support growing areas'
            });
        }

        return summary;
    }

    /**
     * Clean up resources
     */
    async shutdown() {
        if (this.snapshotInterval) {
            clearInterval(this.snapshotInterval);
        }
        console.log('Analytics Engine shut down');
    }
}

// Singleton instance
export const analyticsEngine = new AnalyticsEngine();