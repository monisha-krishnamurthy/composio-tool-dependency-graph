import "dotenv/config";
import { writeFile } from "fs/promises";
import { Composio } from "@composio/core";

const composio = new Composio();

const TOOLKITS = ["googlesuper", "github"];

for (const toolkit of TOOLKITS) {
  const tools = await composio.tools.getRawComposioTools({
    toolkits: [toolkit],
    limit: 1000,
  });

  console.log(`${toolkit}: fetched ${tools.length} tools`);

  await writeFile(
    `data/${toolkit}_tools.json`,
    JSON.stringify(tools, null, 2),
    "utf-8"
  );
}

console.log("Done.");
