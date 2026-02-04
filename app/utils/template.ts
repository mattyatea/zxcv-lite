/**
 * Template engine for rule content (client-side)
 * Supports {{variable}} syntax for dynamic content replacement
 */

export interface TemplateVariable {
	name: string;
	defaultValue?: string;
	description?: string;
}

export interface TemplateRenderOptions {
	[key: string]: string;
}

/**
 * Parse template variables from content
 * Extracts all {{variable}} occurrences
 */
export function parseTemplateVariables(content: string): TemplateVariable[] {
	const regex = /\{\{(\w+)\}\}/g;
	const variables = new Set<string>();
	let match: RegExpExecArray | null = regex.exec(content);

	while (match !== null) {
		if (match[1]) {
			variables.add(match[1]);
		}
		match = regex.exec(content);
	}

	return Array.from(variables).map((name) => ({
		name,
	}));
}

/**
 * Check if content contains template variables
 */
export function hasTemplateVariables(content: string): boolean {
	return /\{\{\w+\}\}/.test(content);
}

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render template with provided values
 */
export function renderTemplate(content: string, values: TemplateRenderOptions): string {
	let rendered = content;

	for (const [key, value] of Object.entries(values)) {
		// Validate variable name before processing
		if (!isValidVariableName(key)) {
			console.warn(`Invalid variable name: ${key}, skipping`);
			continue;
		}

		// Escape special regex characters to prevent ReDoS
		const escapedKey = escapeRegex(key);
		const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g");

		// Escape $ in replacement string (JavaScript replace treats $ specially)
		const escapedValue = value.replace(/\$/g, "$$$$");
		rendered = rendered.replace(regex, escapedValue);
	}

	return rendered;
}

/**
 * Get missing template variables (variables without values)
 */
export function getMissingVariables(
	content: string,
	providedValues: TemplateRenderOptions,
): TemplateVariable[] {
	const allVariables = parseTemplateVariables(content);
	return allVariables.filter((v) => !(v.name in providedValues));
}

/**
 * Validate template variable name
 */
export function isValidVariableName(name: string): boolean {
	return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export type MeetingType = "勉強会" | "定例" | "意思決定";

const MEETING_TYPE_KEYWORDS: Record<MeetingType, string[]> = {
	勉強会: [
		"勉強会",
		"学習",
		"学び",
		"研修",
		"読書会",
		"ワークショップ",
		"study session",
		"workshop",
		"training",
		"learning",
	],
	定例: [
		"定例",
		"週次",
		"月次",
		"隔週",
		"日次",
		"スタンドアップ",
		"1on1",
		"regular",
		"recurring",
		"weekly",
		"monthly",
		"standup",
	],
	意思決定: [
		"意思決定",
		"決定",
		"承認",
		"合意",
		"稟議",
		"decision",
		"approval",
		"sign-off",
		"sign off",
		"alignment",
	],
};

export function detectMeetingType(input: string): MeetingType {
	const normalized = input.toLowerCase();
	const source = `${input}\n${normalized}`;
	const matches = (keywords: string[]) =>
		keywords.some((keyword) => source.includes(keyword));

	if (matches(MEETING_TYPE_KEYWORDS.意思決定)) {
		return "意思決定";
	}

	if (matches(MEETING_TYPE_KEYWORDS.勉強会)) {
		return "勉強会";
	}

	if (matches(MEETING_TYPE_KEYWORDS.定例)) {
		return "定例";
	}

	return "定例";
}

/**
 * Extract template metadata from content
 * Looks for special comments like: <!-- template: language = "english" -->
 */
export function extractTemplateMetadata(content: string): Record<string, string> {
	const metadata: Record<string, string> = {};
	const regex = /<!--\s*template:\s*(\w+)\s*=\s*"([^"]+)"\s*-->/g;
	let match: RegExpExecArray | null = regex.exec(content);

	while (match !== null) {
		if (match[1] && match[2]) {
			metadata[match[1]] = match[2];
		}
		match = regex.exec(content);
	}

	return metadata;
}
