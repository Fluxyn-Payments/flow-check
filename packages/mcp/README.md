# Flow Check MCP server

Gives any MCP client (Claude Desktop, Claude Code, Bedrock AgentCore Gateway) the checks an agent must pass before it pays.

| Tool | What it does |
|---|---|
| `verify_agent` | Know Your Agent on the XRP Ledger: attested by its business's issuer, delegated, bound by the current Mandate |
| `verify_pass` | Does an account hold a Fluxyn Pass from an issuer on the network? |
| `check_mandate` | ALLOW / NEEDS_APPROVAL / DENY for a payment, with every failed check |
| `pay_with_pass` | Pays through Flow Check as a delegate of the business (only when `FLOWCHECK_AGENT_SEED` is set) |

```json
{
  "mcpServers": {
    "flow-check": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": {
        "FLOWCHECK_ISSUERS": "rIssuer1...,rIssuer2...",
        "FLOWCHECK_API": "https://your-flow-check-api"
      }
    }
  }
}
```
