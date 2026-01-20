export interface User {
	id: string;
	email: string;
	username: string;
	password_hash: string;
	created_at: number;
	updated_at: number;
}

export interface Rule {
	id: string;
	name: string;
	user_id: string;
	visibility: "public" | "private";
	description?: string;
	tags?: string[];
	created_at: number;
	updated_at: number;
	published_at?: number;
	version: string;
	latest_version_id?: string;
}

export interface RuleVersion {
	id: string;
	rule_id: string;
	version_number: string;
	changelog?: string;
	content_hash: string;
	r2_object_key: string;
	created_at: number;
	created_by: string;
}

export interface ApiKey {
	id: string;
	user_id: string;
	key_hash: string;
	name: string;
	last_used_at?: number;
	created_at: number;
	expires_at?: number;
	is_active: boolean;
}

// Type for user settings
export interface UserSettings {
	locale?: string;
	theme?: string;
	timezone?: string;
	notifications?: {
		email?: boolean;
		push?: boolean;
	};
}

// Type for API key update data
export interface ApiKeyUpdateData {
	name?: string;
	scopes?: string;
	expiresAt?: number;
}

// Type for SQL update values
export type SqlUpdateValue = string | number | boolean | null;
