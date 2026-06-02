import {
  createPluginModuleLogger,
  createRuntimeId,
  fetchWithTimeout,
  getSkillLoader,
  type Skill,
} from "@phantasy/agent/plugin-runtime";

export { createRuntimeId, fetchWithTimeout, getSkillLoader, type Skill };

export function createACPModuleLogger(name: string) {
  return createPluginModuleLogger(name);
}
