#!/usr/bin/env node
import { main, VERSION } from "./index.js";
import { installAll, installed, bundledRecipes } from "./install.js";
import { assertMac } from "./shortcuts.js";

const cmd = process.argv[2];

if (cmd === "--version" || cmd === "-v") {
  console.log(VERSION);
} else if (cmd === "setup") {
  assertMac();
  const auto = process.argv.includes("--auto");
  for (const r of await installAll(auto)) {
    console.log(`${r.status.padEnd(10)} ${r.shortcutName}${r.detail ? " · " + r.detail : ""}`);
  }
  console.log("\n창이 뜬 것은 단축어 앱에서 '단축어 추가'를 눌러 주세요.");
} else if (cmd === "status") {
  assertMac();
  const have = await installed();
  for (const r of await bundledRecipes()) console.log(`${have[r.id] ? "O" : "X"}  ${r.shortcutName}`);
} else if (cmd === "--help" || cmd === "-h") {
  console.log(`mac-shortcuts-mcp ${VERSION} — 에이전트가 이 맥을 읽게 해 주는 MCP 서버 (읽기 전용)

  mac-shortcuts-mcp            MCP 서버로 실행 (stdio)
  mac-shortcuts-mcp setup      읽기 레시피를 이 맥에 설치 (--auto 로 '추가' 자동 클릭)
  mac-shortcuts-mcp status     무엇이 깔려 있는지

맥이 깨어 있을 때만 동작합니다. 항상 깨어 있는 기기가 필요하면 https://askew.my`);
} else {
  await main();
}
