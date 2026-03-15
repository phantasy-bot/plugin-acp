import { BasePlugin, type PluginTool } from "@phantasy/agent/plugins";

export class AcpPlugin extends BasePlugin {
  name = "acp";
  version = "2.0.0";
  description = "Autonomous commerce protocol plugin for Phantasy.";

  protected displayName = "ACP";
  protected category = "commerce";
  protected tags = ["acp","commerce","jobs","offerings"];
  protected permissions = ["internet"];
  protected workspace = "business" as const;
  protected extensionKind = "capability" as const;
  protected adminSurface =   {
    "tabId": "acp",
    "label": "ACP",
    "section": "business",
    "workspace": "business",
    "kind": "generic",
    "keywords": [
      "acp",
      "commerce",
      "jobs",
      "offerings"
    ]
  } as const;
  protected configSchema =   {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": true
      }
    }
  };

  getTools(): PluginTool[] {
    return [];
  }
}

export default AcpPlugin;
