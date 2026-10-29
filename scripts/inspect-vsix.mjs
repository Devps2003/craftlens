import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const vsix = "craftlens.vsix";
if (!existsSync(vsix)) {
  console.error("craftlens.vsix is missing. Run npm run package first.");
  process.exit(1);
}
const listing = execFileSync("unzip", ["-l", vsix], { encoding: "utf8" });
const blocked = [".env", "id_rsa", ".map", "node_modules/", "sk-live", "/Users/"];
const problems = blocked.filter((token) => listing.includes(token));
if (problems.length > 0) {
  console.error(`vsix contains blocked tokens: ${problems.join(", ")}`);
  process.exit(1);
}
console.log("vsix inspection passed");
console.log(listing.split("\n").slice(0, 40).join("\n"));
