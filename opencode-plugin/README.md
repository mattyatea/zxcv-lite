# OpenCode Plugin for Zxcv

An OpenCode plugin that integrates with the Zxcv AI Coding Rules platform.

## Features

- **Authentication**: Login to Zxcv using GitHub OAuth
- **Rule Search**: Search for public and private rules
- **Rule Installation**: Install rules to your project with language-specific targeting
- **Rule Management**: List and manage installed rules

## Installation

### Using npm (Recommended)

1. Install the package globally or locally:
   ```bash
   npm install -g zxcv-opencode-plugin
   ```

   Or install in your project:
   ```bash
   npm install zxcv-opencode-plugin
   ```

2. Create or update `opencode.json` in your project root:
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": ["zxcv-opencode-plugin"]
   }
   ```

3. Restart OpenCode, the plugin will be automatically loaded.

### Local Installation

1. Build the plugin:
   ```bash
   cd opencode-plugin
   npm install
   npm run build
   ```

2. Copy the built plugin to your OpenCode plugins directory:
   ```bash
   cp -r . ~/.config/opencode/plugins/zxcv
   ```

3. Restart OpenCode, the plugin will be automatically loaded.

### Using with OpenCode

The plugin will be automatically loaded when you start OpenCode. All tools will be prefixed with `zxcv_`.

## Available Tools

### Authentication

#### `zxcv_login`
Login to Zxcv platform using OAuth (GitHub).

#### `zxcv_oauth_callback`
Complete OAuth authentication with callback code.

#### `zxcv_get_user`
Get current user information.

#### `zxcv_logout`
Logout from Zxcv platform.

### Rule Management

#### `zxcv_search_rules`
Search for rules on the Zxcv platform.

**Arguments:**
- `query` (string): Search query
- `tags` (array, optional): Filter by tags
- `author` (string, optional): Filter by author username
- `type` (enum, optional): Filter by type ("rule" or "ccsubagents")
- `visibility` (string, optional): Filter by visibility ("public" or "private")
- `sortBy` (string, optional): Sort field (e.g., "createdAt", "stars", "views")
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20)

**Example:**
```
Search for TypeScript testing rules with the "testing" tag
```

#### `zxcv_get_rule_by_path`
Get a rule by its path (@owner/rulename).

**Arguments:**
- `path` (string): Rule path in format @owner/rulename

#### `zxcv_get_rule_content`
Get the content of a rule by ID.

**Arguments:**
- `id` (string): Rule ID
- `version` (string, optional): Specific version

#### `zxcv_install_rule`
Install a rule to the current project.

**Arguments:**
- `id` (string): Rule ID to install
- `version` (string, optional): Specific version
- `languages` (array, optional): Languages to apply this rule to (e.g., ["typescript", "javascript"]) - if not specified, rule applies to all files

**Example:**
```
Install a TypeScript rule that only applies to TypeScript and JavaScript files
```

The plugin will prepend language tags to the rule file:
```
@typescript
@javascript

# Rule Content...
```

#### `zxcv_uninstall_rule`
Uninstall a rule from the current project.

**Arguments:**
- `name` (string): Name of the rule to uninstall (without .md extension)

**Example:**
```
Uninstall rule named "typescript-best-practices"
```

#### `zxcv_list_installed_rules`
List all installed rules in current project.

## Usage Example

1. **Login to Zxcv:**
   ```
   Use zxcv_login with provider "github"
   ```

2. **Search for rules:**
   ```
   Search for testing rules using zxcv_search_rules
   ```

3. **View rule details:**
   ```
   Get rule content for the rule you want to install
   ```

4. **Install rule:**
   ```
   Install the rule to your project using zxcv_install_rule
   ```

5. **List installed rules:**
   ```
   Check all installed rules using zxcv_list_installed_rules
   ```

6. **Uninstall a rule:**
   ```
   Remove a rule using zxcv_uninstall_rule
   ```

## Language-Specific Rules

When installing a rule, you can specify which languages it should apply to:

```json
{
  "id": "rule-id",
  "languages": ["typescript", "javascript"]
}
```

This will create a rule file with language tags at the top:

```markdown
@typescript
@javascript

# My TypeScript Rule

Rule content here...
```

OpenCode will only apply this rule when working with TypeScript or JavaScript files.

## Configuration

The plugin uses the default API URL: `http://localhost:5144/api`

To change this, modify the `config.apiUrl` variable in `src/index.ts` and rebuild.

## Token Storage

Authentication tokens are stored in `~/.config/opencode/zxcv-auth.json`.

Tokens are automatically refreshed when needed.

## Development

1. Install dependencies:
   ```bash
   cd opencode-plugin
   npm install
   ```

2. Build the plugin:
   ```bash
   npm run build
   ```

3. Copy to OpenCode plugins directory:
   ```bash
   cp -r . ~/.config/opencode/plugins/zxcv
   ```

## License

MIT
