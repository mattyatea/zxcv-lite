import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

declare const Bun: any
declare global {
	var Bun: any
}

interface Config {
  apiUrl: string
}

let accessToken: string | null = null
let refreshToken: string | null = null

const config: Config = {
  apiUrl: "https://zxcv-lite.nanasi-apps.xyz/api"
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers as Record<string, string>
  }

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers
  })

  if (response.status === 401 && refreshToken) {
    await refreshTokens()
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`
      return request<T>(path, options)
    }
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json() as T
}

async function refreshTokens(): Promise<void> {
  if (!refreshToken) return

  const result = await request<{ accessToken: string; refreshToken: string }>(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    }
  )

  accessToken = result.accessToken
  refreshToken = result.refreshToken

  await saveTokens()
}

async function saveTokens(): Promise<void> {
  const configDir = `${process.env.HOME}/.config/opencode`
  await Bun.write(`${configDir}/zxcv-auth.json`, JSON.stringify({ accessToken, refreshToken }))
}

async function loadTokens(): Promise<void> {
  try {
    const configDir = `${process.env.HOME}/.config/opencode`
    const data = await Bun.file(`${configDir}/zxcv-auth.json`).text()
    const tokens = JSON.parse(data)
    accessToken = tokens.accessToken
    refreshToken = tokens.refreshToken
  } catch {
    accessToken = null
    refreshToken = null
  }
}

interface Rule {
  id: string
  name: string
  userId: string | null
  type: "rule" | "ccsubagents"
  visibility: "public" | "private"
  description: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
  publishedAt: number | null
  version: string
  latestVersionId: string | null
  views: number
  stars: number
  user: {
    id: string
    username: string
    email: string
    displayName: string | null
    avatarUrl: string | null
  }
  author: {
    id: string
    username: string
    email: string
    displayName: string | null
    avatarUrl: string | null
  }
}

interface RuleContent {
  id: string
  name: string
  version: string
  content: string
}

interface User {
  id: string
  email: string
  username: string
  role: string
  emailVerified: boolean
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  location: string | null
  website: string | null
}

const LANGUAGE_MAP: Record<string, string[]> = {
  typescript: ["**/*.ts", "**/*.tsx"],
  javascript: ["**/*.js", "**/*.jsx", "**/*.mjs"],
  java: ["**/*.java"],
  python: ["**/*.py"],
  go: ["**/*.go"],
  rust: ["**/*.rs"],
  ruby: ["**/*.rb"],
  php: ["**/*.php"],
  csharp: ["**/*.cs"],
  cpp: ["**/*.cpp", "**/*.cc", "**/*.hpp"],
  c: ["**/*.c", "**/*.h"],
  swift: ["**/*.swift"],
  kotlin: ["**/*.kt", "**/*.kts"],
  scala: ["**/*.scala"],
}

function inferGlobsFromTagsAndName(tags: string[], ruleName: string): string[] {
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase()
    if (LANGUAGE_MAP[lowerTag]) {
      return LANGUAGE_MAP[lowerTag]
    }
  }

  const lowerName = ruleName.toLowerCase()
  for (const [lang, globs] of Object.entries(LANGUAGE_MAP)) {
    if (lowerName.includes(lang)) {
      return globs
    }
  }

  return []
}

const ZxcvPlugin: Plugin = async (ctx) => {
  await loadTokens()

  return {
    tool: {
      zxcv_login: tool({
        description: "Login to zxcv platform using OAuth (GitHub)",
        args: {
          provider: tool.schema.enum(["github"]).describe("OAuth provider to use")
        },
        async execute(args) {
          const provider = args.provider

          const result = await request<{ authorizationUrl: string }>(
            "/auth/oauthInitialize",
            {
              method: "POST",
              body: JSON.stringify({ provider, action: "login" })
            }
          )

          return JSON.stringify({
            message: "Please visit this URL to authenticate:",
            authorizationUrl: result.authorizationUrl,
            instructions: "After authentication, paste the authorization code or the callback URL here."
          })
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
          const provider = args.provider
          const code = args.code
          const state = args.state

          const result = await request<{ accessToken: string; refreshToken: string; user: User } | { tempToken: string; provider: string; requiresUsername: true }>(
            "/auth/oauthCallback",
            {
              method: "POST",
              body: JSON.stringify({ provider, code, state })
            }
          )

          if ("requiresUsername" in result) {
            return JSON.stringify({
              message: "Username required for new account",
              tempToken: result.tempToken,
              instructions: "Please use the zxcv_complete_registration tool with your desired username."
            })
          }

          accessToken = result.accessToken
          refreshToken = result.refreshToken
          await saveTokens()

          return JSON.stringify({
            message: "Successfully authenticated!",
            user: result.user
          })
        }
      }),

      zxcv_get_user: tool({
        description: "Get current user information",
        args: {},
        async execute() {
          if (!accessToken) {
            throw new Error("Not authenticated. Please login first using zxcv_login.")
          }

          const user = await request<User>("/auth/me")
          return JSON.stringify(user)
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
          const body: Record<string, unknown> = {
            page: args.page || 1,
            limit: args.limit || 20
          }

          if (args.query) body.query = args.query
          if (args.tags) body.tags = args.tags
          if (args.author) body.author = args.author
          if (args.type) body.type = args.type
          if (args.visibility) body.visibility = args.visibility
          if (args.sortBy) body.sortBy = args.sortBy

          const result = await request<{ rules: Rule[]; total: number; page: number; limit: number }>(
            "/rules/search",
            {
              method: "POST",
              body: JSON.stringify(body)
            }
          )

          return JSON.stringify({
            message: `Found ${result.total} rules`,
            rules: result.rules,
            total: result.total,
            page: result.page,
            limit: result.limit
          })
        }
      }),

      zxcv_get_rule_by_path: tool({
        description: "Get a rule by its path (@owner/rulename)",
        args: {
          path: tool.schema.string().describe("Rule path in format @owner/rulename")
        },
        async execute(args) {
          const rule = await request<Rule>("/rules/getByPath", {
            method: "POST",
            body: JSON.stringify({ path: args.path })
          })

          return JSON.stringify(rule)
        }
      }),

      zxcv_get_rule_content: tool({
        description: "Get the content of a rule by ID",
        args: {
          id: tool.schema.string().describe("Rule ID"),
          version: tool.schema.string().optional().describe("Specific version (optional)")
        },
        async execute(args) {
          const body: Record<string, unknown> = { id: args.id }
          if (args.version) body.version = args.version

          const content = await request<RuleContent>("/rules/getContent", {
            method: "POST",
            body: JSON.stringify(body)
          })

          return JSON.stringify(content)
        }
      }),

      zxcv_install_rule: tool({
        description: "Install a rule globally (~/.config/opencode/rules)",
        args: {
          id: tool.schema.string().describe("Rule ID to install"),
          version: tool.schema.string().optional().describe("Specific version (optional)"),
          languages: tool.schema.array(tool.schema.string()).optional().describe("Languages to apply this rule to (e.g., ['typescript', 'javascript']) - if not specified, will be auto-detected from tags and rule name")
        },
        async execute(args) {
          const [rule, content] = await Promise.all([
            request<Rule>("/rules/getByPath", {
              method: "POST",
              body: JSON.stringify({ id: args.id })
            }),
            request<RuleContent>("/rules/getContent", {
              method: "POST",
              body: JSON.stringify({ id: args.id, version: args.version })
            })
          ])

          const rulesDir = `${process.env.HOME}/.config/opencode/rules`
          await Bun.$`mkdir -p ${rulesDir}`

          let ruleContent = content.content

          if (args.languages && args.languages.length > 0) {
            const languageTags = args.languages.map(lang => `@${lang}`).join("\n")
            ruleContent = `${languageTags}\n\n${content.content}`
          }

          const inferredGlobs = args.languages && args.languages.length > 0
            ? args.languages.flatMap(lang => LANGUAGE_MAP[lang] || [`**/*.${lang}`])
            : inferGlobsFromTagsAndName(rule.tags || [], rule.name)

          if (inferredGlobs.length > 0) {
            const globsYaml = inferredGlobs.map(g => `  - '${g}'`).join("\n")
            const yamlFrontMatter = `---\nglobs:\n${globsYaml}\n---\n`
            ruleContent = `${yamlFrontMatter}\n${ruleContent}`
          }

          const rulePath = `${rulesDir}/${content.name}.md`
          await Bun.write(rulePath, ruleContent)

          return JSON.stringify({
            message: `Rule "${content.name}" installed successfully!`,
            path: rulePath,
            version: content.version,
            globs: inferredGlobs.length > 0 ? inferredGlobs : ["**/*"]
          })
        }
      }),

      zxcv_list_installed_rules: tool({
        description: "List all globally installed rules (~/.config/opencode/rules)",
        args: {},
        async execute() {
          try {
            const rulesDir = `${process.env.HOME}/.config/opencode/rules`
            
            const files: string[] = []
            const glob = new (Bun as any).Glob(`${rulesDir}/*.md`)
            for await (const path of glob.scan()) {
              files.push(path as string)
            }

            const rules = await Promise.all(
              files.map(async (filePath: string) => {
                const name = filePath.split("/").pop()?.replace(".md", "") || "unknown"
                const content = await Bun.file(filePath).text()
                const firstLine = content.split("\n")[0]

                return {
                  name,
                  path: filePath,
                  description: firstLine.startsWith("#") ? firstLine.substring(1).trim() : "No description"
                }
              })
            )

            return JSON.stringify({
              message: rules.length > 0 ? `Found ${rules.length} installed rules` : "No rules installed yet",
              rules
            })
          } catch (error) {
            return JSON.stringify({
              message: "No rules directory found",
              rules: []
            })
          }
        }
      }),

      zxcv_uninstall_rule: tool({
        description: "Uninstall a globally installed rule",
        args: {
          name: tool.schema.string().describe("Rule name to uninstall (without .md extension)")
        },
        async execute(args) {
          try {
            const rulesDir = `${process.env.HOME}/.config/opencode/rules`
            const rulePath = `${rulesDir}/${args.name}.md`
            
            // Check if rule exists
            const file = Bun.file(rulePath)
            if (!(await file.exists())) {
              return JSON.stringify({
                message: `Rule "${args.name}" is not installed`,
                installed: false
              })
            }

            // Remove the rule file
            await Bun.$`rm -f ${rulePath}`

            return JSON.stringify({
              message: `Rule "${args.name}" uninstalled successfully!`,
              removed: true,
              path: rulePath
            })
          } catch (error) {
            return JSON.stringify({
              message: `Failed to uninstall rule "${args.name}": ${error}`,
              removed: false
            })
          }
        }
      }),

      zxcv_logout: tool({
        description: "Logout from zxcv platform",
        args: {},
        async execute() {
          if (!refreshToken) {
            return JSON.stringify({ message: "Not logged in" })
          }

          await request<{ success: boolean; message: string }>("/auth/logout", {
            method: "POST",
            body: JSON.stringify({ refreshToken })
          })

          accessToken = null
          refreshToken = null

          const configDir = `${process.env.HOME}/.config/opencode`
          await Bun.$`rm -f ${configDir}/zxcv-auth.json`

          return JSON.stringify({ message: "Successfully logged out" })
        }
      })
    }
  }
}

export default ZxcvPlugin
