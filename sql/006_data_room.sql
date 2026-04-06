-- Data Room: Investor document access with NDA consent tracking
-- Migration 006

-- NDA consent records — who agreed and when
CREATE TABLE IF NOT EXISTS data_room_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  title TEXT,
  ip_address TEXT,
  user_agent TEXT,
  consented_at TIMESTAMPTZ DEFAULT NOW(),
  access_code_used TEXT NOT NULL,
  nda_version TEXT NOT NULL DEFAULT '1.0',
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_data_room_consents_email ON data_room_consents(email);

-- Document metadata with version tracking
CREATE TABLE IF NOT EXISTS data_room_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('pitch_deck', 'financials', 'one_pager', 'legal', 'other')) NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_data_room_docs_category ON data_room_documents(category);
CREATE INDEX IF NOT EXISTS idx_data_room_docs_active ON data_room_documents(is_active);

-- Download/view audit log
CREATE TABLE IF NOT EXISTS data_room_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id UUID REFERENCES data_room_consents(id),
  document_id UUID REFERENCES data_room_documents(id),
  action TEXT CHECK (action IN ('view', 'download')) NOT NULL,
  ip_address TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_data_room_logs_consent ON data_room_access_logs(consent_id);
CREATE INDEX IF NOT EXISTS idx_data_room_logs_document ON data_room_access_logs(document_id);
