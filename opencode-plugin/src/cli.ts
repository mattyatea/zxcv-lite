const message = `
opencode-rules-plugin is an OpenCode plugin and is not meant to be run directly.

To use it, add both packages to your OpenCode config plugin list:

{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-rules-plugin", "opencode-rules"]
}
`

process.stdout.write(message.trimStart() + "\n")
