# composio-tool-dependency-graph

A dependency graph over [Composio](https://composio.dev)'s **Google Super** and **GitHub** toolkits: for every tool, which *other* tools can supply the inputs it needs before it can run.

Some tools need precursor actions before they can execute. A couple of concrete examples:

- `GMAIL_REPLY_TO_THREAD` needs a `thread_id` — which `GMAIL_LIST_THREADS` can supply (there can be other ways to get one too).
- The send-email tool needs an email address — if you only have a person's *name*, you'd first search contacts to resolve it to an email, then send.

When agentically executing actions, you need to know either what to ask the user for, or what other action to run first. This project builds that dependency graph automatically from the tools' own input/output JSON schemas, and renders it as an interactive, explorable graph.

**[Open `graph.html`](./graph.html) directly in a browser to see the result** — no server or build step needed.

## how it works

1. **Fetch** (`src/fetch-tools.ts`) — pulls raw tool schemas (`inputParameters`/`outputParameters` JSON
   Schema, including `$defs`) for every `googlesuper` and `github` tool via the Composio SDK into
   `data/*.json` (467 googlesuper tools, 893 github tools as of writing).
2. **Analyze** (`src/build-graph.js`) — for every tool's *required* input param, infers a
   `{resource, suffix}` concept from its name (e.g. `thread_id` → thread/id, `pull_number` →
   pull/number; camelCase params like `fileId` are normalized too), flattens every other tool's output
   schema (resolving `$ref`/`$defs`, bounded to real object-nesting depth so array-of-`$ref` list
   responses are still reachable), and scores candidate producer fields by matching resource keyword
   (found in the field's def name/description) against suffix shape. The top 3 producers per
   (tool, param) become edges, tagged:
   - `lookup` — a list/search/find tool naturally returns this id
   - `creates` — the id comes back from creating the resource
   - `resolve-identity` — a curated pattern for the "name → email/username" case: if you only have a
     name, search people/users first to resolve it, then call the target tool

   `owner`/`repo`/`org` are deliberately excluded from generic id-chaining — in practice you already
   know which repo/user you mean, so chaining them through a "list users" call produces technically
   true but useless noise. Only genuine discovery tools (`SEARCH_USERS`, `SEARCH_PEOPLE`, ...) get an
   edge for those, via `resolve-identity`. Output: `data/graph.json` — 800 nodes with ≥1 edge, 1725
   edges, out of 1360 tools scanned.
3. **Visualize** (`src/build-viz.js`) — generates a single self-contained `graph.html`. Nodes are
   clustered by toolkit + inferred resource family, colored by toolkit, sized by degree; edges are
   colored/dashed by type. Supports pan/zoom, toolkit/edge-type filters, text search, and a
   click-through detail panel listing a tool's required inputs and everything that depends on / is
   depended on by it.

## setup

1. Get a Composio API key at [dashboard.composio.dev](https://dashboard.composio.dev).
2. Run `COMPOSIO_API_KEY=<your key> sh scaffold.sh` — writes a `.env` with your Composio key and an
   OpenRouter key.
3. Install dependencies and regenerate everything:

   ```sh
   npm install
   npx tsx src/fetch-tools.ts
   node src/build-graph.js
   node src/build-viz.js
   open graph.html
   ```

## project structure

```
src/fetch-tools.ts   fetch raw tool schemas from Composio -> data/*_tools.json
src/build-graph.js    infer dependency edges from the schemas -> data/graph.json
src/build-viz.js      render data/graph.json -> graph.html (self-contained)
graph.html            the generated visualization (open this to see the result)
```

## before you push this publicly

If you're cloning this pattern for your own repo: make sure `.env` and any local agent-harness config
(e.g. `.claude/`) are gitignored — they can end up holding a raw API key. Rotate any key that was ever
committed or shared.
