import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * macOS `shortcuts` CLI 감싸기.
 *
 * 읽는 주체는 우리가 아니라 **Shortcuts.app**이다. `shortcuts run`은 일을 그쪽에 넘기고,
 * 캘린더·연락처 같은 보호된 데이터를 읽을 권한도 거기 붙어 있다. 그래서 이 프로세스가
 * 따로 권한을 받을 필요가 없다 — 대신 **사용자가 처음 한 번 권한 창을 넘겨 줘야** 한다.
 *
 * 실측 2026-09-19 (macOS 27): 화면을 잠근 채로도 돈다(63회 중 62회).
 * macOS의 화면 잠금은 화면만 잠그는 것이지 데이터를 잠그는 게 아니라 당연한 결과다.
 * **자는 맥에서는 아무것도 못 한다** — 프로세스가 멈추기 때문이다. 이게 이 도구의 상한이다.
 */

const SHORTCUTS = "/usr/bin/shortcuts";

export class ShortcutsError extends Error {
  constructor(message: string, readonly kind: "not_found" | "failed" | "timeout" | "unsupported") {
    super(message);
  }
}

function exec(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    execFile(SHORTCUTS, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0;
      resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/** 한글 이름은 반입 과정에서 자모 분리형(NFD)으로 들어온다. 비교는 항상 NFC로 맞춘다. */
const nfc = (s: string) => s.normalize("NFC");

export type InstalledShortcut = { name: string; id: string };

/** 이 맥에 깔린 단축어 목록. */
export async function list(): Promise<InstalledShortcut[]> {
  const r = await exec(["list", "--show-identifiers"], 15_000);
  if (r.code !== 0) throw new ShortcutsError(`단축어 목록을 읽지 못했어요: ${r.stderr.trim() || r.code}`, "failed");
  const out: InstalledShortcut[] = [];
  for (const raw of r.stdout.split("\n")) {
    const line = nfc(raw).trim();
    const i = line.lastIndexOf(" (");
    if (i <= 0 || !line.endsWith(")")) continue;
    out.push({ name: line.slice(0, i), id: line.slice(i + 2, -1) });
  }
  return out;
}

/**
 * 이름으로 식별자를 찾는다. **이름으로 직접 실행하지 않는다** — NFD/NFC가 어긋나면
 * "단축어를 찾을 수 없음"이 나는데, 원인이 이름 정규화라는 걸 알기 어렵다.
 */
export async function resolve(name: string): Promise<string | null> {
  const want = nfc(name);
  const all = await list();
  return all.find(s => s.name === want)?.id ?? null;
}

/** 식별자(또는 이름)로 실행하고 텍스트 출력을 돌려준다. */
export async function run(idOrName: string, input?: string, timeoutMs = 30_000): Promise<string> {
  const id = /^[0-9A-F-]{36}$/i.test(idOrName) ? idOrName : await resolve(idOrName);
  if (!id) throw new ShortcutsError(`"${idOrName}" 단축어가 이 맥에 없어요. 먼저 설치하세요.`, "not_found");

  const dir = await mkdtemp(join(tmpdir(), "macmcp-"));
  const inPath = join(dir, "in.txt"), outPath = join(dir, "out.txt");
  try {
    await writeFile(inPath, input ?? "", "utf8");
    const r = await exec(["run", id, "-i", inPath, "-o", outPath], timeoutMs);
    if (r.code !== 0) {
      const msg = r.stderr.trim() || `종료 코드 ${r.code}`;
      // 잠금 전환 순간에 한 번 실패하는 걸 실측했다(연락처, 2026-09-19). 호출한 쪽이 재시도할 수 있게 구분해 준다.
      throw new ShortcutsError(`단축어 실행이 실패했어요: ${msg}`, r.code === null ? "timeout" : "failed");
    }
    return await readFile(outPath, "utf8").catch(() => "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 한 번 실패하면 한 번만 다시 해 본다. 잠금 전환 같은 일시적 실패를 위한 것이다. */
export async function runWithRetry(idOrName: string, input?: string, timeoutMs = 30_000): Promise<string> {
  try {
    return await run(idOrName, input, timeoutMs);
  } catch (e) {
    if (e instanceof ShortcutsError && e.kind === "not_found") throw e;
    await new Promise(r => setTimeout(r, 400));
    return await run(idOrName, input, timeoutMs);
  }
}

export function assertMac(): void {
  if (process.platform !== "darwin") {
    throw new ShortcutsError("이 도구는 macOS에서만 동작해요. 단축어 CLI가 맥에만 있어요.", "unsupported");
  }
}
