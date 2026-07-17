import { readFile, writeFile } from "fs/promises";

// ---------------------------------------------------------------------------
// Load raw tool schemas fetched from Composio (see fetch-tools.ts)
// ---------------------------------------------------------------------------

const TOOLKITS = ["googlesuper", "github"];

async function loadTools() {
  const all = [];
  for (const toolkit of TOOLKITS) {
    const raw = JSON.parse(
      await readFile(`data/${toolkit}_tools.json`, "utf-8")
    );
    for (const tool of raw) all.push({ ...tool, toolkit });
  }
  return all;
}

// ---------------------------------------------------------------------------
// Resource vocabulary: canonical resource name -> synonyms seen in
// param names / def names / field descriptions across both toolkits.
// ---------------------------------------------------------------------------

// synonyms are written as space/underscore-separated word sequences — they
// are matched as whole-token sequences (see tokenize/containsSeq below), not
// raw substrings, so e.g. "pr" never matches inside "projects".
const CANONICAL_LIST = [
  ["issue", ["issue"]],
  ["pull", ["pull"]],
  ["repo", ["repo", "repository"]],
  ["org", ["org", "organization"]],
  ["user", ["user", "owner", "account", "assignee", "reviewer", "collaborator", "author", "committer"]],
  ["milestone", ["milestone"]],
  ["label", ["label"]],
  ["comment", ["comment"]],
  ["review", ["review"]],
  ["release", ["release"]],
  ["gist", ["gist"]],
  ["branch", ["branch", "ref"]],
  ["commit", ["commit", "sha"]],
  ["workflow", ["workflow"]],
  ["run", ["run"]],
  ["job", ["job"]],
  ["check_run", ["check run", "check suite"]],
  ["deployment", ["deployment"]],
  ["environment", ["environment"]],
  ["team", ["team"]],
  ["hook", ["hook", "webhook"]],
  ["installation", ["installation"]],
  ["invitation", ["invitation"]],
  ["discussion", ["discussion"]],
  ["project", ["project"]],
  ["card", ["card"]],
  ["column", ["column"]],
  ["tag", ["tag"]],
  ["asset", ["asset"]],
  ["event", ["event"]],
  ["calendar", ["calendar"]],
  ["thread", ["thread"]],
  ["message", ["message"]],
  ["draft", ["draft"]],
  ["file", ["file", "folder"]],
  ["spreadsheet", ["spreadsheet"]],
  ["sheet", ["sheet"]],
  ["document", ["document", "doc"]],
  ["presentation", ["presentation", "slide"]],
  ["contact", ["contact", "person", "people"]],
  ["permission", ["permission"]],
  ["rule", ["rule", "acl"]],
  ["filter", ["filter"]],
  ["task", ["task"]],
  ["tasklist", ["tasklist"]],
  ["form", ["form"]],
  ["site", ["site"]],
  ["revision", ["revision"]],
  ["reply", ["reply"]],
  ["attachment", ["attachment"]],
  ["delegate", ["delegate"]],
  ["alias", ["alias", "send as"]],
  ["group", ["group"]],
  ["domain", ["domain"]],
  ["channel", ["channel"]],
  ["subscription", ["subscription"]],
];

const SYNONYM_TO_CANON = new Map();
for (const [canonName, syns] of CANONICAL_LIST) {
  for (const s of syns) SYNONYM_TO_CANON.set(s.replace(/\s+/g, ""), canonName);
}

function canon(word) {
  if (!word) return null;
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("es")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return SYNONYM_TO_CANON.get(w) || w;
}

// split camelCase/snake_case/free text into lowercase word tokens
function tokenize(text) {
  return (text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function containsSeq(tokens, seq) {
  for (let i = 0; i <= tokens.length - seq.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) {
      if (tokens[i + j] !== seq[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// find the first canonical resource keyword mentioned in a blob of text,
// matching whole word-token sequences only (never mid-word substrings)
function findResourceInText(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  let best = null;
  let bestIdx = Infinity;
  for (const [canonName, syns] of CANONICAL_LIST) {
    for (const syn of syns) {
      const seq = tokenize(syn);
      // find earliest starting index where seq occurs
      for (let i = 0; i <= tokens.length - seq.length; i++) {
        let ok = true;
        for (let j = 0; j < seq.length; j++) {
          if (tokens[i + j] !== seq[j]) {
            ok = false;
            break;
          }
        }
        if (ok && i < bestIdx) {
          bestIdx = i;
          best = canonName;
        }
        if (ok) break;
      }
    }
  }
  return best;
}

function slugNamesResource(slug, resource) {
  const tokens = tokenize(slug);
  const syns = CANONICAL_LIST.find(([c]) => c === resource)?.[1] || [resource];
  return syns.some((syn) => containsSeq(tokens, tokenize(syn)));
}

// ---------------------------------------------------------------------------
// Flatten a tool's outputParameters JSON-schema into a list of candidate
// "producible fields": { defName, fieldName, description, path }
// ---------------------------------------------------------------------------

function resolveRef(ref, defs) {
  const m = /^#\/\$defs\/(.+)$/.exec(ref || "");
  if (!m) return null;
  return defs[m[1]] ? { name: m[1], schema: defs[m[1]] } : null;
}

function flattenOutput(tool) {
  const out = tool.outputParameters;
  if (!out || !out.properties || !out.properties.data) return [];
  const defs = out.$defs || {};
  const fields = [];
  const seen = new Set();

  function walk(schema, path, depth) {
    if (!schema) return;
    // $ref/array unwrapping is transparent — it doesn't count as descending a
    // level, otherwise the extremely common `items: [{$ref: Thing}]` list
    // shape gets cut off before ever reaching Thing's own fields.
    if (schema.$ref) {
      const resolved = resolveRef(schema.$ref, defs);
      if (resolved) walk(resolved.schema, path, depth);
      return;
    }
    if (schema.type === "array" && schema.items) {
      walk(schema.items, path, depth);
      return;
    }
    if (depth > 3) return;
    if (schema.properties) {
      const defName = schema.title || "";
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const fieldPath = `${path}.${propName}`;
        let target = propSchema;
        let targetDefName = defName;
        if (propSchema.$ref) {
          const resolved = resolveRef(propSchema.$ref, defs);
          if (resolved) targetDefName = resolved.name;
        }
        const key = `${targetDefName}::${propName}`;
        if (!seen.has(key)) {
          seen.add(key);
          fields.push({
            defName,
            fieldName: propName,
            description: propSchema.description || "",
            path: fieldPath,
          });
        }
        // recurse into nested objects/arrays (bounded depth)
        if (propSchema.$ref || propSchema.type === "array" || propSchema.properties) {
          walk(propSchema, fieldPath, depth + 1);
        }
      }
    }
  }

  walk(out.properties.data, "data", 0);
  return fields;
}

// Google's own APIs (Drive/Sheets/Docs/Slides) name params in camelCase
// (fileId, spreadsheetId) while Gmail/Calendar/GitHub use snake_case
// (thread_id, issue_number) — normalize to snake_case before matching.
function toSnake(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

// classify an output field into a suffix type, used to match against
// the shape of input param names (e.g. "*_id" wants suffix 'id')
function fieldSuffixType(fieldName) {
  const f = toSnake(fieldName);
  if (f === "id" || f === "node_id" || f === "gid") return "id";
  if (f === "number") return "number";
  if (f === "sha") return "sha";
  if (f === "login" || f === "username") return "login";
  if (f === "name" || f === "full_name" || f === "display_name") return "name";
  if (f === "slug") return "slug";
  if (f === "email" || f === "email_address" || f.endsWith("email")) return "email";
  if (f === "resource_name" || f === "resourcename") return "resource_name";
  if (f === "owner") return "ownerobj";
  return null;
}

const SUFFIX_COMPAT = {
  id: ["id"],
  number: ["number"],
  sha: ["sha"],
  login: ["login", "ownerobj", "name"],
  name: ["name", "slug", "login"],
  resource_name: ["resource_name"],
};

// ---------------------------------------------------------------------------
// Classify an input param name into a { resource, suffix } concept
// ---------------------------------------------------------------------------

function paramConcept(name) {
  const n = toSnake(name);
  if (["to", "cc", "bcc"].includes(n) || n.endsWith("_email") || n === "email")
    return { category: "email" };
  if (n === "owner") return { resource: "user", suffix: "login" };
  if (["assignee", "reviewer", "collaborator", "creator", "mentioned", "requested_reviewer", "committer", "author", "username", "sender"].includes(n))
    return { resource: "user", suffix: "login" };
  if (n === "repo" || n === "repository") return { resource: "repo", suffix: "name" };
  if (n === "org" || n === "organization") return { resource: "org", suffix: "login" };
  if (["branch", "base", "head"].includes(n)) return { resource: "branch", suffix: "name" };
  if (n === "tag_name" || n === "tag") return { resource: "tag", suffix: "name" };
  if (n === "team_slug") return { resource: "team", suffix: "name" };

  let m;
  if ((m = n.match(/^(.*)_id$/))) return { resource: canon(m[1]), suffix: "id" };
  if ((m = n.match(/^(.*)_number$/))) return { resource: canon(m[1]), suffix: "number" };
  if (n === "sha" || (m = n.match(/^(.*)_sha$/)))
    return { resource: m ? canon(m[1]) : "commit", suffix: "sha" };
  if ((m = n.match(/^(.*)_resource_name$/)))
    return { resource: canon(m[1]), suffix: "resource_name" };
  if (n === "resource_name" || n === "resourcename")
    return { resource: "contact", suffix: "resource_name" };
  if ((m = n.match(/^(.*)_slug$/))) return { resource: canon(m[1]), suffix: "name" };
  return null;
}

// ---------------------------------------------------------------------------
// Build per-tool metadata: required/optional inputs + flattened output fields
// ---------------------------------------------------------------------------

function buildToolMeta(tool) {
  const props = tool.inputParameters?.properties || {};
  const required = new Set(tool.inputParameters?.required || []);
  const inputs = Object.entries(props).map(([name, schema]) => ({
    name,
    required: required.has(name),
    description: schema.description || "",
    type: schema.type,
    concept: paramConcept(name),
  }));
  const outputFields = flattenOutput(tool);
  return {
    slug: tool.slug,
    toolkit: tool.toolkit,
    name: tool.name,
    description: tool.description || "",
    inputs,
    outputFields,
  };
}

// ---------------------------------------------------------------------------
// Matching: for a given required input concept, score an output field
// ---------------------------------------------------------------------------

function scoreField(concept, field) {
  const suffix = fieldSuffixType(field.fieldName);
  if (!suffix) return 0;
  if (!SUFFIX_COMPAT[concept.suffix]?.includes(suffix)) return 0;

  const text = `${field.defName} ${field.description}`;
  const resourceWord = findResourceInText(text);
  if (!resourceWord) return 0;

  const exactSuffix = suffix === concept.suffix;
  if (resourceWord === concept.resource) return exactSuffix ? 1.0 : 0.75;

  // "owner" field name itself is a strong direct signal regardless of resource text
  if (field.fieldName.toLowerCase() === "owner" && concept.resource === "user") return 0.8;

  return 0;
}

// action verbs appear either prefix-first (LIST_THREADS) or, for some
// googlesuper tools, noun-first (ACL_LIST, VALUES_GET) — check the verb as a
// token anywhere in the slug rather than anchoring to a fixed position.
function slugHasVerb(slug, verbs) {
  const tokens = tokenize(slug);
  return verbs.some((v) => tokens.includes(v));
}

function isListOrSearchTool(slug) {
  return slugHasVerb(slug, ["list", "search", "find"]);
}

// "user"/"org" identity fields show up incidentally (nested owner/assignee
// blobs) in almost every response — only trust a small set of tools that
// actually exist to *discover* users/orgs/contacts as producers for them.
const GENERIC_IDENTITY_ALLOWLIST = new Set([
  "GITHUB_GET_A_USER",
  "GITHUB_GET_THE_AUTHENTICATED_USER",
  "GOOGLESUPER_GET_CONTACTS",
  "GOOGLESUPER_GET_PEOPLE",
  "GOOGLESUPER_SEARCH_PEOPLE",
]);

// these entities get embedded as incidental foreign-key references inside
// nearly every response (an issue's assignee, a codespace's repo, a
// deployment's org, ...) — trust only genuine discovery tools for them,
// otherwise almost every tool "produces" almost every other tool's owner/repo.
const HUB_CONCEPTS = new Set(["user", "org", "repo"]);

function isTrustedProducerForConcept(concept, producerSlug) {
  if (HUB_CONCEPTS.has(concept.resource)) {
    return isListOrSearchTool(producerSlug) || GENERIC_IDENTITY_ALLOWLIST.has(producerSlug);
  }
  return true;
}

function isCreateTool(slug) {
  return slugHasVerb(slug, ["create", "insert", "add"]);
}

function producerRank(slug) {
  // true "discovery" tools (list/search/find a collection) are the best,
  // most natural precursor actions
  if (isListOrSearchTool(slug)) return 0;
  // single-item accessors can incidentally carry the right field, but are
  // usually not the tool you'd call *just* to discover that id
  if (slugHasVerb(slug, ["get", "fetch", "query"])) return 2;
  // creating a resource legitimately hands back its own id/number
  if (isCreateTool(slug)) return 1;
  return 3;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rawTools = await loadTools();
  const metas = rawTools.map(buildToolMeta);
  const byToolkit = new Map();
  for (const m of metas) {
    if (!byToolkit.has(m.toolkit)) byToolkit.set(m.toolkit, []);
    byToolkit.get(m.toolkit).push(m);
  }

  const edges = [];
  const edgeKeys = new Set();

  function addEdge(from, to, param, field, score, type, note) {
    const key = `${from}->${to}:${param}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, param, field, score, type, note });
  }

  // --- structural (schema field) matching, scoped per toolkit ---
  for (const [toolkit, tools] of byToolkit) {
    for (const consumer of tools) {
      for (const input of consumer.inputs) {
        if (!input.required || !input.concept || input.concept.category === "email") continue;
        const concept = input.concept;
        // owner/repo/org are near-universally supplied directly by the caller
        // (you already know which repo you mean); chaining them through a
        // "list users/repos" call produces technically-true but useless noise.
        // The genuine "I only have a name, not the exact login" case is
        // covered separately by the resolve-identity edges below.
        if (HUB_CONCEPTS.has(concept.resource)) continue;

        const candidates = [];
        for (const producer of tools) {
          if (producer.slug === consumer.slug) continue;
          if (!isTrustedProducerForConcept(concept, producer.slug)) continue;
          // skip producers that themselves require the same concept (would be circular)
          const producerNeedsSame = producer.inputs.some(
            (pi) =>
              pi.required &&
              pi.concept &&
              pi.concept.resource === concept.resource &&
              pi.concept.suffix === concept.suffix
          );
          if (producerNeedsSame) continue;

          let bestField = null;
          let bestScore = 0;
          for (const field of producer.outputFields) {
            const s = scoreField(concept, field);
            if (s > bestScore) {
              bestScore = s;
              bestField = field;
            }
          }
          if (bestField && bestScore >= 0.75) {
            candidates.push({ producer, field: bestField, score: bestScore });
          }
        }

        // prefer producers whose own slug names the resource (e.g.
        // LIST_PULL_REQUESTS for a pull_number) over ones that only carry it
        // incidentally (e.g. LIST_CHECK_RUNS_FOR_A_REF, which nests a
        // pull_requests[] array but isn't "about" pull requests)
        candidates.sort((a, b) => {
          const rankDiff = producerRank(a.producer.slug) - producerRank(b.producer.slug);
          if (rankDiff !== 0) return rankDiff;
          const nameBonus =
            Number(slugNamesResource(b.producer.slug, concept.resource)) -
            Number(slugNamesResource(a.producer.slug, concept.resource));
          if (nameBonus !== 0) return nameBonus;
          return b.score - a.score;
        });

        for (const c of candidates.slice(0, 3)) {
          addEdge(
            c.producer.slug,
            consumer.slug,
            input.name,
            c.field.fieldName,
            c.score,
            isCreateTool(c.producer.slug) ? "creates" : "lookup",
            `${consumer.slug} needs '${input.name}' (${concept.resource}/${concept.suffix}), supplied by ${c.producer.slug}.${c.field.fieldName}`
          );
        }
      }
    }
  }

  // --- curated identity-resolution edges (README's "name -> email" pattern) ---
  const IDENTITY_RESOLVERS = {
    googlesuper: [
      { slug: "GOOGLESUPER_SEARCH_PEOPLE", label: "search contacts by name/query" },
      { slug: "GOOGLESUPER_GET_CONTACTS", label: "list contacts" },
      { slug: "GOOGLESUPER_GET_PEOPLE", label: "get people directory" },
    ],
    github: [{ slug: "GITHUB_SEARCH_USERS", label: "search users by name" }],
  };

  for (const [toolkit, tools] of byToolkit) {
    const resolvers = IDENTITY_RESOLVERS[toolkit] || [];
    if (!resolvers.length) continue;
    for (const consumer of tools) {
      const wantsEmail = consumer.inputs.some((i) => i.concept?.category === "email");
      const wantsUserLogin =
        toolkit === "github" &&
        consumer.inputs.some(
          (i) => i.concept?.resource === "user" && i.concept?.suffix === "login"
        );
      if (!wantsEmail && !wantsUserLogin) continue;
      for (const r of resolvers) {
        if (r.slug === consumer.slug) continue;
        if (!tools.some((t) => t.slug === r.slug)) continue;
        addEdge(
          r.slug,
          consumer.slug,
          wantsEmail ? "recipient_email" : "assignee/reviewer",
          wantsEmail ? "email" : "login",
          0.6,
          "resolve-identity",
          `If only a name is known (not the ${wantsEmail ? "email address" : "exact username"}), ${r.label} first via ${r.slug}, then use the result to call ${consumer.slug}.`
        );
      }
    }
  }

  // --- assemble node list (only tools that participate in >=1 edge) ---
  const involved = new Set();
  for (const e of edges) {
    involved.add(e.from);
    involved.add(e.to);
  }
  const nodesBySlug = new Map(metas.map((m) => [m.slug, m]));
  const nodes = [...involved].map((slug) => {
    const m = nodesBySlug.get(slug);
    return {
      slug,
      toolkit: m.toolkit,
      name: m.name,
      description: m.description,
      requiredInputs: m.inputs.filter((i) => i.required).map((i) => i.name),
      family: findResourceInText(`${m.slug} ${m.name}`) || "other",
    };
  });

  const graph = {
    generatedFrom: TOOLKITS,
    totalToolsScanned: metas.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };

  await writeFile("data/graph.json", JSON.stringify(graph, null, 2), "utf-8");
  console.log(
    `Scanned ${metas.length} tools. Graph: ${nodes.length} nodes, ${edges.length} edges.`
  );
  console.log(
    `googlesuper tools: ${byToolkit.get("googlesuper")?.length}, github tools: ${byToolkit.get("github")?.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
