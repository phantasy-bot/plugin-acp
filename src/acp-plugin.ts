import { BasePlugin, type PluginTool } from "@phantasy/agent/plugins";
import { forwardLegacyCorePluginRoute } from "@phantasy/agent/plugin-runtime";

export class ACPPlugin extends BasePlugin {
  name = "acp";
  version = "0.1.0";
  description = "Autonomous commerce protocol operations for Phantasy.";

  protected displayName = "ACP";
  protected category = "commerce";
  protected tags = ["acp", "commerce", "jobs", "offerings"];
  protected permissions = ["internet"];
  protected workspace = "business" as const;
  protected extensionKind = "capability" as const;
  protected adminSurface = {
    tabId: "acp",
    label: "ACP",
    section: "business",
    workspace: "business",
    kind: "generic",
    advancedModule: "agent-commerce",
    keywords: ["acp", "commerce", "jobs", "offerings"],
  } as const;
  protected configSchema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true },
    },
  };

  getTools(): PluginTool[] {
    return [];
  }

  async handleCustomEndpoint(
    request: Request,
    path: string,
  ): Promise<Response | null> {
    return forwardLegacyCorePluginRoute("acp", request, path);
  }
}

export default ACPPlugin;
