import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 단축어 **동작 카탈로그** — 동작마다 어떤 매개변수를 받는지.
 *
 * 애플이 문서로 공개하지 않는 값이다. 살아 있는 `WFActionRegistry`에서 뽑았다
 * (2026-09-19, macOS 27). 동작 식별자만 알고 매개변수 키를 모르면 단축어를 조립해도
 * **오류 없이 조용히 틀린 답**이 나온다 — 틀린 키는 그냥 무시되기 때문이다.
 *
 * 이 파일을 같이 푸는 게 이 패키지의 알맹이다. 실행은 누구나 `shortcuts run`으로 할 수 있지만,
 * 만드는 건 이 표가 있어야 한다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

export type ActionParam = { key: string; type?: string | null; label?: string | null; description?: string | null; in_summary?: boolean };
export type ActionDef = {
  id: string; name?: string | null; params?: ActionParam[];
  output?: string | null; permissions?: string[]; confidence: "harvested" | "inferred" | "unknown";
};

let cache: ActionDef[] | null = null;

export async function actions(): Promise<ActionDef[]> {
  if (!cache) {
    const raw = JSON.parse(await readFile(join(HERE, "..", "action-catalog.json"), "utf8"));
    cache = raw.actions as ActionDef[];
  }
  return cache;
}

/** 식별자·이름·매개변수 키 어디든 걸리면 찾는다. */
export async function search(q: string, limit = 25): Promise<ActionDef[]> {
  const needle = q.toLowerCase().trim();
  if (!needle) return [];
  const all = await actions();
  const score = (a: ActionDef) => {
    const id = a.id.toLowerCase(), name = (a.name ?? "").toLowerCase();
    if (id === needle) return 0;
    if (id.endsWith("." + needle)) return 1;
    if (id.includes(needle)) return 2;
    if (name.includes(needle)) return 3;
    if ((a.params ?? []).some(p => p.key.toLowerCase().includes(needle))) return 4;
    return 99;
  };
  return all.map(a => [score(a), a] as const).filter(([s]) => s < 99)
            .sort((x, y) => x[0] - y[0]).slice(0, limit).map(([, a]) => a);
}

export function render(a: ActionDef): string {
  const lines = [`${a.id}${a.name ? `  — ${a.name}` : ""}  [${a.confidence}]`];
  if (a.output) lines.push(`  출력: ${a.output}`);
  if (a.permissions?.length) lines.push(`  권한: ${a.permissions.join(", ")}`);
  for (const p of a.params ?? []) {
    lines.push(`  · ${p.key}${p.type ? ` (${p.type})` : ""}${p.label ? ` — ${p.label}` : ""}${p.in_summary ? " *" : ""}`);
  }
  if (!a.params?.length) lines.push("  (매개변수 없음)");
  return lines.join("\n");
}
