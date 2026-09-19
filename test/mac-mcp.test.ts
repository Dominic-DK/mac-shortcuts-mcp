import { test } from "node:test";
import assert from "node:assert/strict";
import { search, render, actions } from "../src/catalog.js";
import { bundledRecipes } from "../src/install.js";
import { list, resolve } from "../src/shortcuts.js";
import { readFile } from "node:fs/promises";

/**
 * 맥에서만 도는 도구라 테스트도 맥을 전제한다. 서버도 계정도 없으니 네트워크는 안 쓴다.
 */
const onMac = process.platform === "darwin";

test("동작 카탈로그: 표본이 실제 키를 준다", async () => {
  const all = await actions();
  assert.ok(all.length > 400, `동작이 ${all.length}개뿐이다`);
  const ev = all.find(a => a.id === "is.workflow.actions.addnewevent");
  assert.ok(ev, "캘린더 추가 동작이 카탈로그에 없다");
  const keys = (ev!.params ?? []).map(p => p.key);
  // 우리 템플릿이 실제로 쓰는 키다. 이게 어긋나면 조립이 조용히 틀린다.
  assert.ok(keys.includes("WFCalendarItemTitle"), `제목 키가 없다: ${keys.join(",")}`);
  assert.ok(keys.includes("WFCalendarItemStartDate"));
  assert.equal(ev!.confidence, "harvested", "표본 동작은 추측이 아니라 수확본이어야 한다");
});

test("카탈로그 검색: 식별자·이름·매개변수 키 어디로든 걸린다", async () => {
  assert.ok((await search("addnewevent")).some(a => a.id.endsWith("addnewevent")));
  assert.ok((await search("WFCalendarItemTitle")).length > 0, "매개변수 키로 못 찾는다");
  assert.equal((await search("")).length, 0, "빈 검색어는 아무것도 안 준다");
  const one = (await search("getipaddress"))[0];
  assert.ok(render(one).includes("is.workflow.actions.getipaddress"));
});

test("번들 레시피: 전부 읽기 전용이고 자동화가 없다", async () => {
  const rs = await bundledRecipes();
  assert.ok(rs.length >= 8, `레시피가 ${rs.length}개뿐이다`);
  // 쓰기 레시피가 섞여 들어오면 이 도구의 약속이 깨진다.
  const writes = rs.filter(r => /\.(add|send|set|open)$/.test(r.id));
  assert.deepEqual(writes, [], `쓰기 레시피가 섞였다: ${writes.map(w => w.id).join(",")}`);
  for (const r of rs) {
    const plist = await readFile(new URL(`../recipes/${r.file}`, import.meta.url), "utf8");
    assert.ok(!plist.includes("WFWorkflowTriggers") || !plist.includes("WFNotificationTrigger"),
      `${r.id}에 알림 트리거가 있다 — 읽기 도구는 자동화를 깔지 않는다`);
  }
});

test("번들 레시피 plist가 사람이 읽을 수 있는 XML이다", async () => {
  const rs = await bundledRecipes();
  const plist = await readFile(new URL(`../recipes/${rs[0].file}`, import.meta.url), "utf8");
  assert.ok(plist.startsWith("<?xml"), "서명된 바이너리를 넣으면 '읽을 수 있다'는 약속이 깨진다");
  assert.ok(plist.includes("WFWorkflowActions"));
});

test("이름 정규화: 한글 단축어를 NFC로 찾는다", { skip: !onMac }, async () => {
  const all = await list();
  assert.ok(all.length > 0, "이 맥에 단축어가 하나도 없다");
  const ko = all.find(s => /[가-힣]/.test(s.name));
  if (!ko) return;                                   // 한글 단축어가 없는 맥이면 건너뛴다
  assert.equal(ko.name, ko.name.normalize("NFC"), "목록이 NFC로 정규화돼 나와야 한다");
  assert.equal(await resolve(ko.name), ko.id, "NFC 이름으로 식별자를 못 찾는다");
});
