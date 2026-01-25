import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

interface Config {
  apiUrl: string
}

let accessToken: string | null = null
let refreshToken: string | null = null

const config: Config = {
  apiUrl:
    process.env.ZXCV_RPC_URL ||
    process.env.OPENCODE_ZXCV_RPC_URL ||
    "https://zxcv-lite.nanasi-apps.xyz/api"
}

const getConfigDir = (): string => join(process.env.HOME ?? "", ".config", "opencode")
const getRulesDir = (): string => join(getConfigDir(), "rules")

const buildApiUrl = (path: string): string => {
  const baseUrl = config.apiUrl.replace(/\/$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

const apiRequest = async <T = unknown>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> => {
  const headers = new Headers()
  headers.set("Content-Type", "application/json")
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)

  const response = await fetch(buildApiUrl(path), {
    method: options.method ?? "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`)
    ;(error as { status?: number }).status = response.status
    throw error
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

const isUnauthorizedError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false

  if ("status" in error && (error as { status?: number }).status === 401) {
    return true
  }

  if ("code" in error && (error as { code?: string }).code === "UNAUTHORIZED") {
    return true
  }

  if (
    "response" in error &&
    (error as { response?: unknown }).response instanceof Response
  ) {
    return (error as { response: Response }).response.status === 401
  }

  return false
}

async function executeWithRefresh<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (refreshToken && isUnauthorizedError(error)) {
      await refreshTokens()
      return await action()
    }
    throw error
  }
}

async function refreshTokens(): Promise<void> {
  if (!refreshToken) return

  try {
    const result = await apiRequest<{ accessToken: string; refreshToken: string }>(
      "/auth/refresh",
      { body: { refreshToken } }
    )
    accessToken = result.accessToken
    refreshToken = result.refreshToken
    await saveTokens()
  } catch (error) {
    accessToken = null
    refreshToken = null
    throw error
  }
}

async function saveTokens(): Promise<void> {
  const configDir = getConfigDir()
  await mkdir(configDir, { recursive: true })
  await writeFile(
    join(configDir, "zxcv-auth.json"),
    JSON.stringify({ accessToken, refreshToken })
  )
}

async function loadTokens(): Promise<void> {
  try {
    const configDir = getConfigDir()
    const data = await readFile(join(configDir, "zxcv-auth.json"), "utf8")
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

type OAuthDeviceInitResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

type OAuthDeviceCallbackResponse =
  | {
      error: string
      error_description?: string
    }
  | {
      tempToken: string
      provider: string
      requiresUsername: true
    }
  | {
      accessToken: string
      refreshToken: string
      user: User
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
        description: "Login to zxcv platform using OAuth (GitHub) via device flow",
        args: {
          provider: tool.schema.enum(["github"]).describe("OAuth provider to use")
        },
        async execute(args) {
          const provider = args.provider
          // GitHub Device Flow (required)
          try {
            const deviceResult = await executeWithRefresh(() =>
              apiRequest<OAuthDeviceInitResponse>("/auth/oauthDeviceInitialize", {
                body: { provider }
              })
            )

            return JSON.stringify({
              message: "🚀 GitHub Device Flow Authentication",
              instructions: [
                "📱 1. Open GitHub in your browser and go to:",
                `   ${deviceResult.verification_uri}`,
                "",
                "🔑 2. Enter this one-time code:",
                `   ${deviceResult.user_code}`,
                "",
                `⏰ 3. The code expires in ${deviceResult.expires_in} seconds (${Math.floor(deviceResult.expires_in / 60)} minutes)`,
                "",
                "🔄 4. After completing authentication, the system will automatically detect it and complete the login"
              ].join("\n"),
              userCode: deviceResult.user_code,
              verificationUri: deviceResult.verification_uri,
              deviceCode: deviceResult.device_code,
              expiresIn: deviceResult.expires_in,
              interval: deviceResult.interval,
              flow: "device"
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error"
            throw new Error(`Device flow initialization failed: ${message}`)
          }
        }
      }),

      zxcv_device_poll: tool({
        description: "Poll for device flow authentication completion",
        args: {
          deviceCode: tool.schema.string().describe("Device code from zxcv_login"),
          interval: tool.schema.number().optional().describe("Polling interval in seconds (default: 5)"),
          maxAttempts: tool.schema.number().optional().describe("Maximum polling attempts (default: 30)")
        },
        async execute(args) {
          const deviceCode = args.deviceCode
          const interval = args.interval || 5
          const maxAttempts = args.maxAttempts || 30

          return JSON.stringify({
            message: `Polling for authentication completion every ${interval} seconds...`,
            instructions: "Please complete the authentication in your browser by visiting the URL and entering the code provided by zxcv_login.",
            deviceCode,
            interval,
            maxAttempts
          })
        }
      }),

      zxcv_device_callback: tool({
        description: "Complete OAuth device flow authentication (internal use)",
        args: {
          deviceCode: tool.schema.string().describe("Device code")
        },
        async execute(args) {
          try {
            const result = await executeWithRefresh(() =>
              apiRequest<OAuthDeviceCallbackResponse>("/auth/oauthDeviceCallback", {
                body: { deviceCode: args.deviceCode }
              })
            )

            if ("error" in result) {
              if (result.error === "authorization_pending") {
                return JSON.stringify({
                  status: "pending",
                  message: "Authorization pending - please complete authentication in your browser"
                })
              } else if (result.error === "slow_down") {
                return JSON.stringify({
                  status: "slow_down",
                  message: "Please slow down polling - authentication still pending"
                })
              } else if (result.error === "access_denied") {
                return JSON.stringify({
                  status: "denied",
                  message: "Access denied - user declined the authorization request"
                })
              } else if (result.error === "expired_token") {
                return JSON.stringify({
                  status: "expired",
                  message: "Device code has expired - please start a new login"
                })
              } else {
                return JSON.stringify({
                  status: "error",
                  message: result.error_description || result.error
                })
              }
            }

            if ("requiresUsername" in result) {
              return JSON.stringify({
                status: "username_required",
                message: "Username required for new account",
                tempToken: result.tempToken,
                instructions: "Please use the zxcv_complete_registration tool with your desired username."
              })
            }

            accessToken = result.accessToken
            refreshToken = result.refreshToken
            await saveTokens()

            return JSON.stringify({
              status: "success",
              message: "Successfully authenticated!",
              user: result.user
            })
          } catch (error) {
            return JSON.stringify({
              status: "error",
              message: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          }
        }
      }),

      zxcv_get_user: tool({
        description: "Get current user information",
        args: {},
        async execute() {
          if (!accessToken) {
            throw new Error("Not authenticated. Please login first using zxcv_login.")
          }

          const user = await executeWithRefresh(() =>
            apiRequest<User>("/auth/me", { method: "GET" })
          )
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

          const result = await executeWithRefresh(() =>
            apiRequest<{ rules: Rule[]; total: number; page: number; limit: number }>(
              "/rules/search",
              { body }
            )
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
          const rule = await executeWithRefresh(() =>
            apiRequest<Rule>("/rules/getByPath", { body: { path: args.path } })
          )

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
          const body: { id: string; version?: string } = { id: args.id }
          if (args.version) body.version = args.version

          const content = await executeWithRefresh(() =>
            apiRequest<RuleContent>("/rules/getContent", { body })
          )

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
            executeWithRefresh(() => apiRequest<Rule>("/rules/get", { body: { id: args.id } })),
            executeWithRefresh(() =>
              apiRequest<RuleContent>("/rules/getContent", {
                body: { id: args.id, version: args.version }
              })
            )
          ])

          const rulesDir = getRulesDir()
          await mkdir(rulesDir, { recursive: true })

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

          const rulePath = join(rulesDir, `${content.name}.md`)
          await writeFile(rulePath, ruleContent)

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
          const rulesDir = getRulesDir()
          try {
            await access(rulesDir)
          } catch {
            return JSON.stringify({
              message: "No rules directory found",
              rules: []
            })
          }

          const entries = await readdir(rulesDir, { withFileTypes: true })
          const files = entries
            .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
            .map(entry => join(rulesDir, entry.name))

          const rules = await Promise.all(
            files.map(async (filePath: string) => {
              const name = basename(filePath).replace(".md", "")
              const content = await readFile(filePath, "utf8")
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
        }
      }),

      zxcv_uninstall_rule: tool({
        description: "Uninstall a globally installed rule",
        args: {
          name: tool.schema.string().describe("Rule name to uninstall (without .md extension)")
        },
        async execute(args) {
          const rulesDir = getRulesDir()
          const rulePath = join(rulesDir, `${args.name}.md`)

          try {
            await access(rulePath)
          } catch {
            return JSON.stringify({
              message: `Rule "${args.name}" is not installed`,
              installed: false
            })
          }

          try {
            await unlink(rulePath)
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

          await executeWithRefresh(() =>
            apiRequest("/auth/logout", { body: { refreshToken } })
          )

          accessToken = null
          refreshToken = null

          const configDir = getConfigDir()
          try {
            await unlink(join(configDir, "zxcv-auth.json"))
          } catch {
            // ignore
          }

          return JSON.stringify({ message: "Successfully logged out" })
        }
      })
    }
  }
}

export default ZxcvPlugin
