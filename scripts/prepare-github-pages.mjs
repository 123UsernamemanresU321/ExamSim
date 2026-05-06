import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(process.cwd(), "out");

if (!existsSync(outDir)) {
  throw new Error("out directory does not exist. Run the static export build first.");
}

writeFileSync(resolve(outDir, ".nojekyll"), "");

const notFound = resolve(outDir, "404.html");
const index = resolve(outDir, "index.html");

if (!existsSync(notFound) && existsSync(index)) {
  copyFileSync(index, notFound);
}
