-- Remove organization/team features from schema

-- Drop FTS artifacts that rely on organization fields
DROP TRIGGER IF EXISTS rules_fts_insert;
DROP TRIGGER IF EXISTS rules_fts_update;
DROP TRIGGER IF EXISTS rules_fts_delete;
DROP TABLE IF EXISTS rules_fts;

-- Drop organization/team tables
DROP TABLE IF EXISTS organization_invitations;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS team_invitations;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;

-- Rebuild rules table without organization fields
CREATE TABLE rules_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    description TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    published_at INTEGER,
    version TEXT NOT NULL DEFAULT '1.0.0',
    latest_version_id TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    stars INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'rule' CHECK (type IN ('rule', 'ccsubagents')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO rules_new (
    id,
    name,
    user_id,
    visibility,
    description,
    tags,
    created_at,
    updated_at,
    published_at,
    version,
    latest_version_id,
    views,
    stars,
    type
)
SELECT
    id,
    name,
    user_id,
    CASE WHEN visibility = 'organization' THEN 'private' ELSE visibility END,
    description,
    tags,
    created_at,
    updated_at,
    published_at,
    version,
    latest_version_id,
    views,
    stars,
    type
FROM rules;

DROP TABLE rules;
ALTER TABLE rules_new RENAME TO rules;

CREATE INDEX idx_rules_user_id ON rules(user_id);
CREATE INDEX idx_rules_visibility ON rules(visibility);
CREATE INDEX idx_rules_name ON rules(name);
CREATE INDEX idx_rules_updated_at ON rules(updated_at);
CREATE INDEX idx_rules_views ON rules(views);
CREATE INDEX idx_rules_stars ON rules(stars);
CREATE INDEX idx_rules_type ON rules(type);

-- Recreate FTS table without organization fields
CREATE VIRTUAL TABLE IF NOT EXISTS rules_fts USING fts5(
    rule_id,
    name,
    description,
    tags,
    content
);

INSERT INTO rules_fts (rule_id, name, description, tags)
SELECT id, name, description, tags FROM rules;

CREATE TRIGGER IF NOT EXISTS rules_fts_insert AFTER INSERT ON rules
BEGIN
    INSERT INTO rules_fts (rule_id, name, description, tags)
    VALUES (new.id, new.name, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS rules_fts_update AFTER UPDATE ON rules
BEGIN
    UPDATE rules_fts SET
        name = new.name,
        description = new.description,
        tags = new.tags
    WHERE rule_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS rules_fts_delete AFTER DELETE ON rules
BEGIN
    DELETE FROM rules_fts WHERE rule_id = old.id;
END;
