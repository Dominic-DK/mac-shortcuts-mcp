import { execFile } from "node:child_process";
import { mkdtemp, copyFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { list, resolve } from "./shortcuts.js";

/**
 * 레시피를 이 맥에 깐다 — **서명은 여기서, 사용자 맥에서** 한다.
 *
 * 패키지에는 **읽을 수 있는 XML plist**만 들어 있다. 오픈소스 도구가 남의 맥에 서명된 바이너리를
 * 내려받아 까는 건 "읽을 수 있다"는 말과 안 맞는다. `recipes/*.plist`를 열어 보면 무엇을 하는지 다 보인다.
 *
 * 반입은 사용자가 "단축어 추가"를 눌러야 끝난다. macOS 27에서는 접근성 API로 그 버튼을 누를 수 있지만
 * (2026-09-19 실측 5/5) **접근성 권한이 필요**하므로 기본값으로 삼지 않는다 — 권한을 조용히 요구하는
 * 도구가 되면 안 된다. `--auto` 를 준 사람에게만 시도하고, 아니면 창을 띄우고 안내한다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPES = join(HERE, "..", "recipes");

export type RecipeMeta = {
  id: string; shortcutName: string; file: string; title: string; oneLine: string;
  verified: boolean; actions: string[]; inputExample: string | null; outputExample: string | null;
};

export async function bundledRecipes(): Promise<RecipeMeta[]> {
  const m = JSON.parse(await readFile(join(RECIPES, "manifest.json"), "utf8"));
  return m.recipes as RecipeMeta[];
}

function run(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ code: number; stderr: string }> {
  return new Promise(res => execFile(cmd, args, { timeout: timeoutMs }, (err, _o, stderr) =>
    res({ code: err ? ((err as any).code ?? 1) : 0, stderr: stderr ?? "" })));
}

export type InstallResult = { id: string; shortcutName: string; status: "already" | "opened" | "installed" | "failed"; detail?: string };

/**
 * 한 레시피를 서명해 단축어 앱에 넘긴다.
 * 파일명이 곧 단축어 이름이 되고, 서명 CLI가 한글 파일명을 **NFD로 적는다**.
 * 그래서 ASCII 임시 이름으로 서명한 뒤 NFC 이름으로 복사해 이름 형태를 고정한다 —
 * 안 그러면 나중에 이름으로 못 찾는다(저장소의 gen.py가 같은 이유로 같은 짓을 한다).
 */
export async function installOne(r: RecipeMeta, auto = false): Promise<InstallResult> {
  if (await resolve(r.shortcutName)) return { id: r.id, shortcutName: r.shortcutName, status: "already" };

  const dir = await mkdtemp(join(tmpdir(), "macmcp-inst-"));
  try {
    const unsigned = join(dir, "u.shortcut");
    const signedAscii = join(dir, "s.shortcut");
    await copyFile(join(RECIPES, r.file), unsigned);
    const sign = await run("/usr/bin/shortcuts", ["sign", "--mode", "anyone", "--input", unsigned, "--output", signedAscii]);
    if (sign.code !== 0) return { id: r.id, shortcutName: r.shortcutName, status: "failed", detail: `서명 실패: ${sign.stderr.trim()}` };

    const final = join(dir, r.shortcutName.normalize("NFC") + ".shortcut");
    await copyFile(signedAscii, final);
    const open = await run("/usr/bin/open", ["-g", final], 15_000);
    if (open.code !== 0) return { id: r.id, shortcutName: r.shortcutName, status: "failed", detail: `열기 실패: ${open.stderr.trim()}` };

    if (auto) {
      await new Promise(res => setTimeout(res, 1200));
      await run("/usr/bin/osascript", ["-e",
        `tell application "System Events" to tell process "Shortcuts" to click button 2 of scroll area 1 of group 1 of window 1`], 10_000);
      await new Promise(res => setTimeout(res, 1200));
      if (await resolve(r.shortcutName)) return { id: r.id, shortcutName: r.shortcutName, status: "installed" };
    }
    return { id: r.id, shortcutName: r.shortcutName, status: "opened" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function installAll(auto = false): Promise<InstallResult[]> {
  const out: InstallResult[] = [];
  for (const r of await bundledRecipes()) out.push(await installOne(r, auto));
  return out;
}

/** 어떤 레시피가 이미 깔려 있나. */
export async function installed(): Promise<Record<string, boolean>> {
  const have = new Set((await list()).map(s => s.name));
  const out: Record<string, boolean> = {};
  for (const r of await bundledRecipes()) out[r.id] = have.has(r.shortcutName.normalize("NFC"));
  return out;
}
