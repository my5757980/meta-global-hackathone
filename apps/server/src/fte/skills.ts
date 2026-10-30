import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { skillsDir } from "../env";

/**
 * Sora's know-how lives in Skills: one folder per capability with a SKILL.md (frontmatter `name` +
 * `description`, then instructions). Only the index (name + description) is always in Sora's prompt;
 * the body is loaded on demand with the `load_skill` tool — progressive disclosure.
 */
export interface Skill {
  name: string;
  description: string;
  body: string;
}

let cache: Skill[] | null = null;

function parse(md: string, fallbackName: string): Skill {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const front = m?.[1] ?? "";
  const body = (m?.[2] ?? md).trim();
  const get = (k: string) => front.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return { name: get("name") || fallbackName, description: get("description"), body };
}

export function loadSkills(force = false): Skill[] {
  if (cache && !force) return cache;
  const out: Skill[] = [];
  if (existsSync(skillsDir)) {
    for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const f = resolve(skillsDir, dir.name, "SKILL.md");
      if (existsSync(f)) out.push(parse(readFileSync(f, "utf8"), dir.name));
    }
  }
  cache = out.sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

export function getSkill(name: string): Skill | undefined {
  return loadSkills().find((s) => s.name === name);
}

export function skillIndex(): string {
  return loadSkills()
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");
}
