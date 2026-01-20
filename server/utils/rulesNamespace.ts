export function parseRulePath(path: string): {
	owner?: string;
	ruleName: string;
} | null {
	// Check if path is valid
	if (!path || path.trim() === "") {
		return null;
	}

	// Remove leading @ if present
	const cleanPath = path.startsWith("@") ? path.substring(1) : path;

	// Split by /
	const parts = cleanPath.split("/");

	if (parts.length === 1 && parts[0]) {
		// Simple rule name without owner
		return {
			ruleName: parts[0],
		};
	} else if (parts.length === 2 && parts[0] && parts[1]) {
		// Owner/rule format
		return {
			owner: parts[0],
			ruleName: parts[1],
		};
	} else if (parts.length === 2) {
		// Invalid formats like "owner/" or "/rule"
		return null;
	}

	// Invalid paths with more than 2 parts
	return null;
}
