// Turns dist/index.html into dist/artifact.html for publishing as a claude.ai
// Artifact: the host adds its own <html>/<head>/<body>, so we keep only the
// title, styles, script and page markup. Run after `npm run build`.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head
  .split("\n")
  .filter((line) => /<title>|<link rel="stylesheet"|<script/.test(line))
  .join("\n");
const fix = "<style>:root{padding:0!important;color-scheme:dark}html,body{height:100%}</style>";
writeFileSync("dist/artifact.html", `${keep}\n${fix}\n${body}`);
console.log("wrote dist/artifact.html");
