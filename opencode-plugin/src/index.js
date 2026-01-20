import { tool } from "@opencode-ai/plugin";
let accessToken = null;
let refreshToken = null;
const config = {
    apiUrl: "http://localhost:5144/api"
};
async function request(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...options.headers
    };
    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const response = await fetch(`${config.apiUrl}${path}`, {
        ...options,
        headers
    });
    if (response.status === 401 && refreshToken) {
        await refreshTokens();
        if (accessToken) {
            headers["Authorization"] = `Bearer ${accessToken}`;
            return request(path, options);
        }
    }
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}
async function refreshTokens() {
    if (!refreshToken)
        return;
    const result = await request("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken })
    });
    accessToken = result.accessToken;
    refreshToken = result.refreshToken;
    await saveTokens();
}
async function saveTokens() {
    const configDir = `${process.env.HOME}/.config/opencode`;
    await Bun.write(`${configDir}/zxcv-auth.json`, JSON.stringify({ accessToken, refreshToken }));
}
async function loadTokens() {
    try {
        const configDir = `${process.env.HOME}/.config/opencode`;
        const data = await Bun.file(`${configDir}/zxcv-auth.json`).text();
        const tokens = JSON.parse(data);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
    }
    catch {
        accessToken = null;
        refreshToken = null;
    }
}
const ZxcvPlugin = async (ctx) => {
    await loadTokens();
    return {
        tool: {
            zxcv_login: tool({
                description: "Login to zxcv platform using OAuth (GitHub)",
                args: {
                    provider: tool.schema.enum(["github"]).describe("OAuth provider to use")
                },
                async execute(args) {
                    const provider = args.provider;
                    const result = await request("/auth/oauthInitialize", {
                        method: "POST",
                        body: JSON.stringify({ provider, action: "login" })
                    });
                    return JSON.stringify({
                        message: "Please visit this URL to authenticate:",
                        authorizationUrl: result.authorizationUrl,
                        instructions: "After authentication, paste the authorization code or the callback URL here."
                    });
                }
            }),
            zxcv_oauth_callback: tool({
                description: "Complete OAuth authentication with the callback code",
                args: {
                    provider: tool.schema.enum(["github"]).describe("OAuth provider"),
                    code: tool.schema.string().describe("OAuth authorization code"),
                    state: tool.schema.string().describe("OAuth state parameter")
                },
                async execute(args) {
                    const provider = args.provider;
                    const code = args.code;
                    const state = args.state;
                    const result = await request("/auth/oauthCallback", {
                        method: "POST",
                        body: JSON.stringify({ provider, code, state })
                    });
                    if ("requiresUsername" in result) {
                        return JSON.stringify({
                            message: "Username required for new account",
                            tempToken: result.tempToken,
                            instructions: "Please use the zxcv_complete_registration tool with your desired username."
                        });
                    }
                    accessToken = result.accessToken;
                    refreshToken = result.refreshToken;
                    await saveTokens();
                    return JSON.stringify({
                        message: "Successfully authenticated!",
                        user: result.user
                    });
                }
            }),
            zxcv_complete_registration: tool({
                description: "Complete OAuth registration with a username",
                args: {
                    tempToken: tool.schema.string().describe("Temporary token from OAuth callback"),
                    username: tool.schema.string().describe("Username to register")
                },
                async execute(args) {
                    const tempToken = args.tempToken;
                    const username = args.username;
                    const result = await request("/auth/completeOAuthRegistration", {
                        method: "POST",
                        body: JSON.stringify({ tempToken, username })
                    });
                    accessToken = result.accessToken;
                    refreshToken = result.refreshToken;
                    await saveTokens();
                    return JSON.stringify({
                        message: "Registration completed successfully!",
                        user: result.user
                    });
                }
            }),
            zxcv_get_user: tool({
                description: "Get current user information",
                args: {},
                async execute() {
                    if (!accessToken) {
                        throw new Error("Not authenticated. Please login first using zxcv_login.");
                    }
                    const user = await request("/auth/me");
                    return JSON.stringify(user);
                }
            }),
            zxcv_search_rules: tool({
                description: "Search for rules on the zxcv platform",
                args: {
                    query: tool.schema.string().describe("Search query"),
                    tags: tool.schema.array(tool.schema.string()).optional().describe("Filter by tags"),
                    author: tool.schema.string().optional().describe("Filter by author username"),
                    type: tool.schema.enum(["rule", "ccsubagents"]).optional().describe("Filter by type"),
                    visibility: tool.schema.string().optional().describe("Filter by visibility (public/private)"),
                    sortBy: tool.schema.string().optional().describe("Sort field (e.g., 'createdAt', 'stars', 'views')"),
                    page: tool.schema.number().optional().describe("Page number (default: 1)"),
                    limit: tool.schema.number().optional().describe("Results per page (default: 20)")
                },
                async execute(args) {
                    const body = {
                        page: args.page || 1,
                        limit: args.limit || 20
                    };
                    if (args.query)
                        body.query = args.query;
                    if (args.tags)
                        body.tags = args.tags;
                    if (args.author)
                        body.author = args.author;
                    if (args.type)
                        body.type = args.type;
                    if (args.visibility)
                        body.visibility = args.visibility;
                    if (args.sortBy)
                        body.sortBy = args.sortBy;
                    const result = await request("/rules/search", {
                        method: "POST",
                        body: JSON.stringify(body)
                    });
                    return JSON.stringify({
                        message: `Found ${result.total} rules`,
                        rules: result.rules,
                        total: result.total,
                        page: result.page,
                        limit: result.limit
                    });
                }
            }),
            zxcv_get_rule_by_path: tool({
                description: "Get a rule by its path (@owner/rulename)",
                args: {
                    path: tool.schema.string().describe("Rule path in format @owner/rulename")
                },
                async execute(args) {
                    const rule = await request("/rules/getByPath", {
                        method: "POST",
                        body: JSON.stringify({ path: args.path })
                    });
                    return JSON.stringify(rule);
                }
            }),
            zxcv_get_rule_content: tool({
                description: "Get the content of a rule by ID",
                args: {
                    id: tool.schema.string().describe("Rule ID"),
                    version: tool.schema.string().optional().describe("Specific version (optional)")
                },
                async execute(args) {
                    const body = { id: args.id };
                    if (args.version)
                        body.version = args.version;
                    const content = await request("/rules/getContent", {
                        method: "POST",
                        body: JSON.stringify(body)
                    });
                    return JSON.stringify(content);
                }
            }),
            zxcv_install_rule: tool({
                description: "Install a rule to current project",
                args: {
                    id: tool.schema.string().describe("Rule ID to install"),
                    version: tool.schema.string().optional().describe("Specific version (optional)"),
                    languages: tool.schema.array(tool.schema.string()).optional().describe("Languages to apply this rule to (e.g., ['typescript', 'javascript']) - if not specified, rule applies to all files")
                },
                async execute(args) {
                    const content = await request("/rules/getContent", {
                        method: "POST",
                        body: JSON.stringify({ id: args.id, version: args.version })
                    });
                    const rulesDir = `${ctx.directory}/.opencode/rules`;
                    await Bun.$ `mkdir -p ${rulesDir}`;
                    let ruleContent = content.content;
                    if (args.languages && args.languages.length > 0) {
                        const languageTags = args.languages.map(lang => `@${lang}`).join("\n");
                        ruleContent = `${languageTags}\n\n${content.content}`;
                    }
                    const rulePath = `${rulesDir}/${content.name}.md`;
                    await Bun.write(rulePath, ruleContent);
                    return JSON.stringify({
                        message: `Rule "${content.name}" installed successfully!`,
                        path: rulePath,
                        version: content.version,
                        languages: args.languages || "all files"
                    });
                }
            }),
            zxcv_list_installed_rules: tool({
                description: "List all installed rules in current project",
                args: {},
                async execute() {
                    try {
                        const rulesDir = `${ctx.directory}/.opencode/rules`;
                        const files = [];
                        for await (const path of Bun.glob(`${rulesDir}/*.md`)) {
                            files.push(path);
                        }
                        const rules = await Promise.all(files.map(async (filePath) => {
                            const name = filePath.split("/").pop()?.replace(".md", "") || "unknown";
                            const content = await Bun.file(filePath).text();
                            const firstLine = content.split("\n")[0];
                            return {
                                name,
                                path: filePath,
                                description: firstLine.startsWith("#") ? firstLine.substring(1).trim() : "No description"
                            };
                        }));
                        return JSON.stringify({
                            message: rules.length > 0 ? `Found ${rules.length} installed rules` : "No rules installed yet",
                            rules
                        });
                    }
                    catch (error) {
                        return JSON.stringify({
                            message: "No rules directory found",
                            rules: []
                        });
                    }
                }
            }),
            zxcv_logout: tool({
                description: "Logout from zxcv platform",
                args: {},
                async execute() {
                    if (!refreshToken) {
                        return JSON.stringify({ message: "Not logged in" });
                    }
                    await request("/auth/logout", {
                        method: "POST",
                        body: JSON.stringify({ refreshToken })
                    });
                    accessToken = null;
                    refreshToken = null;
                    const configDir = `${process.env.HOME}/.config/opencode`;
                    await Bun.$ `rm -f ${configDir}/zxcv-auth.json`;
                    return JSON.stringify({ message: "Successfully logged out" });
                }
            })
        }
    };
};
export default ZxcvPlugin;
