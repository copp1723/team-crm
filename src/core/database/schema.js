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
  supermemory_space_id VARCHAR(255), -- Individual Supermemory space for this user
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Personal Assistant configurations for each team member
CREATE TABLE IF NOT EXISTS personal_assistants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  assistant_name VARCHAR(100),
  assistant_email VARCHAR(255), -- Individual assistant email address
  supermemory_collection_id VARCHAR(255), -- Dedicated memory collection
  configuration JSONB, -- Custom settings for this assistant
  learning_preferences JSONB, -- What this assistant should focus on learning
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id) -- One assistant per member
);

-- Assistant emails table for tracking email communications
CREATE TABLE IF NOT EXISTS assistant_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id VARCHAR(255) UNIQUE,
  member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  assistant_email VARCHAR(255) NOT NULL,
  from_address VARCHAR(255),
  from_name VARCHAR(255),
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  clean_text TEXT,
  is_auto_reply BOOLEAN DEFAULT false,
  is_reply BOOLEAN DEFAULT false,
  thread_id VARCHAR(255),
  attachments JSONB DEFAULT '[]',
  links JSONB DEFAULT '[]',
  headers JSONB DEFAULT '{}',
  processed_data JSONB,
  email_context JSONB,
  confidence_score DECIMAL(3, 2),
  requires_attention BOOLEAN DEFAULT false,
  processing_status VARCHAR(50) DEFAULT 'pending',
  response_sent BOOLEAN DEFAULT false,
  response_message_id VARCHAR(255),
  response_sent_at TIMESTAMP WITH TIME ZONE,
  forwarded_to_member BOOLEAN DEFAULT false,
  forward_message_id VARCHAR(255),
  forwarded_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Clients table (dealerships we're selling to)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  client_type VARCHAR(50) DEFAULT 'dealership', -- dealership, dealer_group, oem, etc.
  parent_company VARCHAR(255), -- Parent company if part of a group
  industry VARCHAR(100) DEFAULT 'automotive',
  size VARCHAR(50), -- small, medium, large, enterprise
  annual_revenue DECIMAL(15, 2),
  employee_count INTEGER,
  website VARCHAR(255),
  location VARCHAR(255),
  timezone VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Client contacts (multiple contacts per client)
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  is_primary BOOLEAN DEFAULT false,
  is_decision_maker BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deals/Opportunities table (selling our AI technology)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  owner_id UUID REFERENCES team_members(id),
  name VARCHAR(255) NOT NULL,
  stage deal_stage NOT NULL DEFAULT 'prospect',
  monthly_value DECIMAL(15, 2), -- Monthly recurring revenue
  implementation_fee DECIMAL(15, 2), -- One-time setup fee
  total_contract_value DECIMAL(15, 2), -- Total deal value
  probability DECIMAL(5, 2) DEFAULT 0, -- 0-100
  expected_close_date DATE,
  actual_close_date DATE,
  priority priority_level DEFAULT 'medium',
  product_type VARCHAR(100), -- Our product being sold
  use_case TEXT, -- How client will use our technology
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
  client_id UUID REFERENCES clients(id),
  extraction_type VARCHAR(50), -- 'action_item', 'client_feedback', 'risk', 'opportunity', 'technical_requirement'
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
CREATE INDEX idx_personal_assistants_member ON personal_assistants(member_id);
CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX idx_assistant_emails_member ON assistant_emails(member_id, received_at DESC);
CREATE INDEX idx_assistant_emails_status ON assistant_emails(processing_status, requires_attention);
CREATE INDEX idx_assistant_emails_thread ON assistant_emails(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_assistant_emails_context ON assistant_emails USING gin(email_context) WHERE email_context IS NOT NULL;

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
 * @property {string} [supermemory_space_id]
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Client
 * @property {string} id
 * @property {string} name
 * @property {string} [client_type]
 * @property {string} [parent_company]
 * @property {string} [industry]
 * @property {string} [size]
 * @property {number} [annual_revenue]
 * @property {number} [employee_count]
 * @property {string} [website]
 * @property {string} [location]
 * @property {string} [timezone]
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} PersonalAssistant
 * @property {string} id
 * @property {string} member_id
 * @property {string} [assistant_name]
 * @property {string} [supermemory_collection_id]
 * @property {Object} [configuration]
 * @property {Object} [learning_preferences]
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Deal
 * @property {string} id
 * @property {string} [client_id]
 * @property {string} [owner_id]
 * @property {string} name
 * @property {'prospect'|'qualified'|'proposal'|'negotiation'|'closed_won'|'closed_lost'|'on_hold'} stage
 * @property {number} [monthly_value]
 * @property {number} [implementation_fee]
 * @property {number} [total_contract_value]
 * @property {number} probability
 * @property {Date} [expected_close_date]
 * @property {Date} [actual_close_date]
 * @property {'low'|'medium'|'high'|'critical'} priority
 * @property {string} [product_type]
 * @property {string} [use_case]
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
