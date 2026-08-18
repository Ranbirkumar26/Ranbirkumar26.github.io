// Single source of truth for the RAG corpus is knowledge/*.json.
// The Node backend reads those files at runtime; the Supabase edge function
// cannot read the repo, so it embeds a generated copy. This script keeps the
// two coherent: it normalizes every item (stamping a default `visibility`) and
// regenerates supabase/functions/portfolio-chat/knowledge.ts. Run after any
// knowledge edit: `npm run build:knowledge`.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const OUT = join(ROOT, "supabase/functions/portfolio-chat/knowledge.ts");

// visibility taxonomy (see server/index.js retrieveContext):
//   public       answerable normally (default)
//   resume_only  surfaced only when role-relevant or asked by name
//   deprecated   surfaced only when asked by name
//   private      never retrieved
const VALID_VISIBILITY = new Set(["public", "resume_only", "deprecated", "private"]);

function loadItems() {
  const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".json")).sort();
  const items = [];
  const seen = new Set();
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${file} is not a JSON array`);
    let changed = false;
    for (const item of parsed) {
      if (!item.id) throw new Error(`${file} has an item without an id`);
      if (seen.has(item.id)) throw new Error(`duplicate knowledge id: ${item.id}`);
      seen.add(item.id);
      if (!item.visibility) {
        item.visibility = "public";
        changed = true;
      }
      if (!VALID_VISIBILITY.has(item.visibility)) {
        throw new Error(`${item.id} has invalid visibility: ${item.visibility}`);
      }
      items.push(item);
    }
    if (changed) writeFileSync(join(KNOWLEDGE_DIR, file), `${JSON.stringify(parsed, null, 2)}\n`);
  }
  return items;
}

function generate(items) {
  const body = items.map((item) => "  " + JSON.stringify(item, null, 2).replace(/\n/g, "\n  ")).join(",\n");
  return `export type KnowledgeItem = {
  id: string;
  title: string;
  tags: string[];
  roleTags: string[];
  priority: number;
  visibility: "public" | "resume_only" | "deprecated" | "private";
  content: string;
  evidence: string[];
};

// GENERATED FILE. Do not edit by hand. Source: knowledge/*.json.
// Regenerate with: npm run build:knowledge
export const knowledgeItems: KnowledgeItem[] = [
${body},
];
`;
}

const items = loadItems();
writeFileSync(OUT, generate(items));
console.log(`build-knowledge: ${items.length} items -> ${OUT.replace(ROOT + "/", "")}`);
