#!/usr/bin/env python3
"""맥용 읽기 레시피를 **서명하지 않은 XML plist**로 뽑는다.

왜 서명을 안 하나: 이건 오픈소스 도구다. 사용자가 **자기 맥에 뭘 까는지 읽을 수 있어야** 한다.
바이너리 서명본을 npm으로 내려받아 깔라고 하면 "읽을 수 있다"는 말이 무의미해진다.
서명은 설치 시점에 사용자 맥에서 한다(`shortcuts sign --mode anyone`) — 어차피 맥에서만 되는 일이다.

정본은 저장소의 `tools/shortcut-gen/`이다. 여기서는 **읽기 전용 레시피만** 골라 온다.
"""
import json, pathlib, plistlib, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[2]
GEN = ROOT / "tools/shortcut-gen"
sys.path.insert(0, str(GEN))
OUT = pathlib.Path(__file__).resolve().parents[1] / "recipes"

# 맥에서 반입·실행이 확인된 읽기 전용 레시피만. 쓰기(추가·발송)는 이 도구의 범위가 아니다.
READ_ONLY = ["calendar.list", "reminders.list", "notes.find", "contacts.find",
             "clipboard.get", "device.status", "location.get", "weather.now", "music.now"]

spec = json.load(open(GEN / "recipes.json"))
by_id = {r["id"]: r for r in spec["recipes"]}
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob("*.plist"): f.unlink()

manifest = []
for rid in READ_ONLY:
    r = by_id.get(rid)
    if not r:
        print(f"  건너뜀 {rid}: recipes.json에 없음"); continue
    if r.get("template"):
        d = plistlib.load(open(GEN / "templates" / r["template"], "rb"))
    else:
        import compose; d = compose.build(rid, r.get("glyph"))
    if d.get("WFWorkflowTriggers"):
        # 읽기 도구는 자동화를 깔지 않는다. 트리거가 붙어 있으면 그건 디스패처용이라 여기 오면 안 된다.
        raise SystemExit(f"{rid}에 트리거가 있다 — 읽기 전용 도구에 자동화를 깔면 안 된다")
    name = unicodedata.normalize("NFC", r["shortcutName"])
    fn = rid.replace(".", "-") + ".plist"
    plistlib.dump(d, open(OUT / fn, "wb"), fmt=plistlib.FMT_XML)
    manifest.append({
        "id": rid, "shortcutName": name, "file": fn,
        "title": r.get("title") or name, "oneLine": r.get("oneLine", ""),
        "verified": bool(r.get("verified")),
        "actions": [a["WFWorkflowActionIdentifier"] for a in d.get("WFWorkflowActions", [])],
        "inputExample": r.get("inputExample"), "outputExample": r.get("outputExample"),
    })
    print(f"  {rid:<16} → {fn} · 동작 {len(manifest[-1]['actions'])}개 · 검증 {manifest[-1]['verified']}")

json.dump({"version": 1, "recipes": manifest}, open(OUT / "manifest.json", "w"), ensure_ascii=False, indent=1)
print(f"레시피 {len(manifest)}개 → {OUT}")
