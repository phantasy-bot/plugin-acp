import { BasePlugin, PluginManifest, PluginTool } from "@phantasy/core";

export class UacpPlugin extends BasePlugin {
  readonly name = "acp";
  readonly version = "1.0.0";

  getManifest(): PluginManifest {
    return {
      name: this.name,
      version: this.version,
      description: "acp plugin for Phantasy",
      author: "Phantasy",
      license: "BUSL-1.1",
      repository: "https://github.com/phantasy-bot/plugin-acp",
    };
  }

  getTools(): PluginTool[] {
    return [];
  }

  async initialize(): Promise<void> {
    console.log("[UacpPlugin] Initialized");
  }
}

export default UacpPlugin;
