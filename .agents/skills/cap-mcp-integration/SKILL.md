---
name: cap-mcp-integration
description: >-
  Instructions for configuring Model Context Protocol (MCP) server capabilities in SAP CAP Node.js applications.
  Use when adding @gavdi/cap-mcp, @cap-js/mcp, or @cap-js/mcp-server, or annotating CDS services for AI agent consumption.
---

# SAP CAP Model Context Protocol (MCP) Integration Skill

This skill provides the standard procedure for exposing SAP Cloud Application Programming Model (CAP) Node.js services as Model Context Protocol (MCP) servers for consumption by AI agents (e.g. Claude, Gemini, custom agents).

---

## 📦 Required NPM Packages

Add the official and community CAP MCP plugins to `package.json`:

```bash
npm add @gavdi/cap-mcp @cap-js/mcp @cap-js/mcp-server --legacy-peer-deps
```

* **`@gavdi/cap-mcp`**: CAP runtime plugin (`cds-plugin.js`) that automatically wraps CDS entities into MCP resources and tools.
* **`@cap-js/mcp`**: Official SAP CAP MCP protocol handler plugin.
* **`@cap-js/mcp-server`**: Standard CLI server (`cds-mcp`) for inspecting and hosting CAP MCP endpoints.

---

## ⚙️ Package Configuration (`package.json`)

Configure global MCP server options under the `cds` block:

```json
{
  "cds": {
    "mcp": {
      "name": "cf-log-trace-agent-mcp",
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": [
        "query",
        "get",
        "create",
        "update",
        "delete"
      ],
      "instructions": "MCP Server instructions for AI agents operating on CAP services."
    }
  }
}
```

---

## 🏷️ CDS Model Annotations (`srv/*.cds`)

Annotate services and entities to expose them to AI agents with specific CRUD capabilities:

```cds
service Logservice {
    @mcp: {
        name       : 'Logs',
        description: 'Cloud Foundry log & trace Logs with root cause analysis',
        resource   : true
    }
    @Capabilities : { Insertable : true, Updatable : true, Deletable : true }
    entity Logs as projection on sch.Logs;
}

// Enable wrapper tools for MCP AI Agent CRUD operations
annotate Logservice.Logs with @mcp.wrap: {
    tools: true,
    modes: ['query', 'get', 'create', 'update', 'delete'],
    hint: 'Use to query, create, update, or delete incident records'
};
```

---

## 🌐 Endpoints & Verification

When running `cds watch` or `cds serve`:
* **MCP Endpoint:** `http://localhost:4004/mcp`
* **MCP Health Endpoint:** `http://localhost:4004/mcp/health`
* **Inspector CLI:** `npx @modelcontextprotocol/inspector`
