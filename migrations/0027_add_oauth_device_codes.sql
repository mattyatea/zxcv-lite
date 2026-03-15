CREATE TABLE IF NOT EXISTS oauth_device_codes (
    id TEXT PRIMARY KEY,
    device_code TEXT NOT NULL UNIQUE,
    user_code TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_ip TEXT,
    user_agent TEXT,
    scopes TEXT,
    expires_at INTEGER NOT NULL,
    interval INTEGER NOT NULL DEFAULT 5,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_poll_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_device_code ON oauth_device_codes(device_code);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_user_code ON oauth_device_codes(user_code);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_expires_at ON oauth_device_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_client_ip ON oauth_device_codes(client_ip);
