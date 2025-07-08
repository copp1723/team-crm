/**
 * DATABASE SCHEMA
 * PostgreSQL schema for team CRM data persistence and analytics
 * 
 * This schema enables:
 * - Historical conversation and deal tracking
 * - Analytics snapshots for trend analysis
 * - Team performance metrics
 * - AI-powered forecasting data storage
 */

// SQL Schema Definition
export const schemaSQL = `
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Enum types
CREATE TYPE deal_stage AS ENUM (
  'prospect',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
  'on_hold'
);

CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE update_source AS ENUM ('chat', 'email', 'slack', 'api', 'manual');

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'joe', 'charlie'
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100),
  email VARCHAR(255),
  active BOOLEAN DEFAULT true,
  ai_model VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dealerships table (replacing clients)
CREATE TABLE IF NOT EXISTS dealerships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  dealer_group VARCHAR(255), -- Parent company if part of a group
  rooftops INTEGER DEFAULT 1, -- Number of locations
  brands TEXT[], -- Array of brands sold (Ford, Toyota, etc)
  monthly_units INTEGER, -- Average units sold per month
  location VARCHAR(255),
  gm_name VARCHAR(255), -- General Manager
  gm_email VARCHAR(255),
  gm_phone VARCHAR(50),
  current_solutions TEXT[], -- Existing AI/software they use
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deals/Opportunities table (AI solutions for dealerships)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealership_id UUID REFERENCES dealerships(id),
  owner_id UUID REFERENCES team_members(id),
  name VARCHAR(255) NOT NULL,
  stage deal_stage NOT NULL DEFAULT 'prospect',
  monthly_value DECIMAL(15, 2), -- Monthly recurring revenue
  implementation_fee DECIMAL(15, 2), -- One-time setup fee
  probability DECIMAL(5, 2) DEFAULT 0, -- 0-100
  expected_close_date DATE,
  actual_close_date DATE,
  priority priority_level DEFAULT 'medium',
  solution_type VARCHAR(100), -- 'service_ai', 'sales_ai', 'full_platform'
  pilot_start_date DATE,
  pilot_end_date DATE,
  competitors TEXT[], -- Array of competitor names
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Team updates/conversations table
CREATE TABLE IF NOT EXISTS team_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES team_members(id),
  update_text TEXT NOT NULL,
  source update_source DEFAULT 'chat',
  priority priority_level,
  is_urgent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI extractions from team updates
CREATE TABLE IF NOT EXISTS update_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  update_id UUID REFERENCES team_updates(id),
  deal_id UUID REFERENCES deals(id),
  dealership_id UUID REFERENCES dealerships(id),
  extraction_type VARCHAR(50), -- 'action_item', 'dealer_feedback', 'risk', 'opportunity', 'pilot_update'
  content JSONB NOT NULL, -- Flexible structure for different extraction types
  confidence_score DECIMAL(3, 2), -- 0-1
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deal activities/history
CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id),
  update_id UUID REFERENCES team_updates(id),
  member_id UUID REFERENCES team_members(id),
  activity_type VARCHAR(50), -- 'stage_change', 'amount_change', 'meeting', 'email', etc.
  old_value JSONB,
  new_value JSONB,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Executive summaries generated
CREATE TABLE IF NOT EXISTS executive_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  executive_id UUID REFERENCES team_members(id),
  summary_date DATE NOT NULL,
  content TEXT NOT NULL,
  key_highlights JSONB, -- Array of highlight objects
  attention_required JSONB, -- Array of urgent items
  revenue_impact JSONB, -- Revenue-related insights
  team_performance JSONB, -- Performance metrics
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytics snapshots for historical tracking
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_date DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL, -- 'pipeline_value', 'conversion_rate', 'activity_count', etc.
  dimension VARCHAR(50), -- 'by_owner', 'by_stage', 'by_client', 'overall'
  dimension_value VARCHAR(255), -- The specific owner, stage, client, etc.
  metric_value DECIMAL(15, 4),
  period_type VARCHAR(20) DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_date, metric_type, dimension, dimension_value, period_type)
);

-- AI context memory for improved intelligence
CREATE TABLE IF NOT EXISTS ai_context_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_type VARCHAR(50), -- 'client_profile', 'deal_pattern', 'team_behavior'
  entity_type VARCHAR(50), -- 'client', 'deal', 'member'
  entity_id UUID, -- Reference to the specific entity
  context_data JSONB NOT NULL, -- AI-learned patterns and insights
  confidence_score DECIMAL(3, 2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Follow-up suggestions from AI
CREATE TABLE IF NOT EXISTS ai_follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id),
  member_id UUID REFERENCES team_members(id),
  suggestion_text TEXT NOT NULL,
  reason TEXT,
  priority priority_level DEFAULT 'medium',
  suggested_date DATE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_deals_owner_stage ON deals(owner_id, stage);
CREATE INDEX idx_deals_client ON deals(client_id);
CREATE INDEX idx_deals_expected_close ON deals(expected_close_date);
CREATE INDEX idx_team_updates_member_created ON team_updates(member_id, created_at DESC);
CREATE INDEX idx_update_extractions_type ON update_extractions(extraction_type);
CREATE INDEX idx_deal_activities_deal_created ON deal_activities(deal_id, created_at DESC);
CREATE INDEX idx_analytics_snapshots_lookup ON analytics_snapshots(snapshot_date, metric_type, dimension);
CREATE INDEX idx_ai_context_entity ON ai_context_memory(entity_type, entity_id);
CREATE INDEX idx_ai_follow_ups_member_date ON ai_follow_ups(member_id, suggested_date);

-- Full text search indexes
CREATE INDEX idx_team_updates_text_search ON team_updates USING gin(to_tsvector('english', update_text));
CREATE INDEX idx_clients_name_search ON clients USING gin(name gin_trgm_ops);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries
CREATE VIEW pipeline_summary AS
SELECT 
  d.stage,
  COUNT(*) as deal_count,
  SUM(d.amount) as total_value,
  AVG(d.probability) as avg_probability,
  SUM(d.amount * d.probability / 100) as weighted_value
FROM deals d
WHERE d.stage NOT IN ('closed_won', 'closed_lost')
GROUP BY d.stage;

CREATE VIEW team_performance AS
SELECT 
  tm.id,
  tm.name,
  tm.role,
  COUNT(DISTINCT d.id) as active_deals,
  SUM(CASE WHEN d.stage = 'closed_won' THEN d.amount ELSE 0 END) as revenue_closed,
  COUNT(DISTINCT tu.id) as updates_count,
  MAX(tu.created_at) as last_update
FROM team_members tm
LEFT JOIN deals d ON d.owner_id = tm.id
LEFT JOIN team_updates tu ON tu.member_id = tm.id
WHERE tm.active = true
GROUP BY tm.id, tm.name, tm.role;
`;

// JSDoc type definitions for schema objects
/**
 * @typedef {Object} TeamMember
 * @property {string} id
 * @property {string} external_id
 * @property {string} name
 * @property {string} [role]
 * @property {string} [email]
 * @property {boolean} active
 * @property {string} [ai_model]
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Dealership
 * @property {string} id
 * @property {string} name
 * @property {string} [dealer_group]
 * @property {number} [rooftops]
 * @property {string[]} [brands]
 * @property {number} [monthly_units]
 * @property {string} [location]
 * @property {string} [gm_name]
 * @property {string} [gm_email]
 * @property {string} [gm_phone]
 * @property {string[]} [current_solutions]
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Deal
 * @property {string} id
 * @property {string} [dealership_id]
 * @property {string} [owner_id]
 * @property {string} name
 * @property {'prospect'|'qualified'|'proposal'|'negotiation'|'closed_won'|'closed_lost'|'on_hold'} stage
 * @property {number} [monthly_value]
 * @property {number} [implementation_fee]
 * @property {number} probability
 * @property {Date} [expected_close_date]
 * @property {Date} [actual_close_date]
 * @property {'low'|'medium'|'high'|'critical'} priority
 * @property {string} [solution_type]
 * @property {Date} [pilot_start_date]
 * @property {Date} [pilot_end_date]
 * @property {string[]} [competitors]
 * @property {string} [notes]
 * @property {Date} created_at
 * @property {Date} updated_at
 * @property {Date} [closed_at]
 */

/**
 * @typedef {Object} TeamUpdate
 * @property {string} id
 * @property {string} [member_id]
 * @property {string} update_text
 * @property {'chat'|'email'|'slack'|'api'|'manual'} source
 * @property {'low'|'medium'|'high'|'critical'} [priority]
 * @property {boolean} is_urgent
 * @property {Date} created_at
 */

/**
 * @typedef {Object} UpdateExtraction
 * @property {string} id
 * @property {string} [update_id]
 * @property {string} [deal_id]
 * @property {string} [client_id]
 * @property {string} [extraction_type]
 * @property {*} content
 * @property {number} [confidence_score]
 * @property {Date} created_at
 */

/**
 * @typedef {Object} AnalyticsSnapshot
 * @property {string} id
 * @property {Date} snapshot_date
 * @property {string} metric_type
 * @property {string} [dimension]
 * @property {string} [dimension_value]
 * @property {number} metric_value
 * @property {string} period_type
 * @property {Date} created_at
 */
