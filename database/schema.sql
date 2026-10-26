-- ============================================================================
-- STOCK MARKET — QUALIFICATION PORTAL (PHASE 2)
-- Database: Neon PostgreSQL Schema
-- Table: leads
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    lead_reference VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'partial' CHECK (status IN ('partial', 'completed')),
    current_step INTEGER NOT NULL DEFAULT 1,
    
    -- Step 1: Challenge
    challenge TEXT NULL,
    
    -- Step 2: Contact Details (Mobile & WhatsApp are strictly separate)
    full_name VARCHAR(100) NULL,
    mobile_number VARCHAR(20) NULL,
    
    -- Step 3: Segment
    trading_segment VARCHAR(50) NULL,
    
    -- Step 4: Capital
    trading_capital VARCHAR(50) NULL,
    
    -- Step 5: Final Communication Details
    whatsapp_number VARCHAR(20) NULL,
    state VARCHAR(100) NULL,
    
    -- Marketing Attribution
    utm_source TEXT NULL,
    utm_medium TEXT NULL,
    utm_campaign TEXT NULL,
    utm_content TEXT NULL,
    utm_term TEXT NULL,
    fbclid TEXT NULL,
    
    -- Network Metadata
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_leads_session_id ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_current_step ON leads(current_step);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_completed_at ON leads(completed_at);
