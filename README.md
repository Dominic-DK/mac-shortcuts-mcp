# mac-shortcuts-mcp

**Let any AI agent read your Mac.** Calendar, Reminders, Notes, Contacts, Clipboard, Location, Weather, now playing — through Apple Shortcuts. Read-only, local, no account, no server.

Works with Claude Code, Claude Desktop, Cursor, Codex, or any MCP client.

```bash
npx -y mac-shortcuts-mcp setup      # install the read recipes (once)
```

```json
{
  "mcpServers": {
    "mac": { "command": "npx", "args": ["-y", "mac-shortcuts-mcp"] }
  }
}
```

Then ask your agent: *"What's on my calendar this week?"* · *"Find the note about the lease."* · *"What's Jane's number?"*

## Why this exists

Your agent cannot read Apple's first-party apps. It has no permission to, and there is no API.
**Shortcuts can.** This server hands the job to `Shortcuts.app`, which does have those permissions, and gives you back the text.

That is the whole trick. Nothing here is clever — it is just wired up.

## What it can do

| Tool | Reads |
|---|---|
| `mac_calendar` | Events in the next N days |
| `mac_reminders` | Reminders, optionally one list |
| `mac_notes` | Notes matching a search, with body text |
| `mac_contacts` | Contacts by name |
| `mac_clipboard` | Current clipboard |
| `mac_location` | Address and coordinates |
| `mac_weather` | Weather where this Mac is |
| `mac_device` | Machine name and battery |
| `mac_now_playing` | Currently playing track |
| `mac_shortcuts_list` | Every shortcut on this Mac |
| `mac_run_shortcut` | Run a shortcut **you** made, by name |
| `mac_action_catalog` | **Search the Shortcuts action catalog** — see below |
| `mac_setup` / `mac_status` | Install the read recipes, check what's ready |

**The bundled recipes are read-only.** `mac_run_shortcut` can run any installed Shortcut, including one that writes data or sends messages. Its description asks the agent to check with you when the behavior is unknown; this is not an enforced read-only sandbox.

Everything read from your Mac comes back tagged as *data, not instructions*, so a note that says "ignore your previous instructions" is handed to the agent as text rather than as a command.

## The action catalog

`action-catalog.json` in this package documents **539 Shortcuts actions** — for each one, the parameter keys it accepts, their types, labels, output type and required permissions.

Apple does not publish this. It was extracted from the live `WFActionRegistry` on macOS 27.

It matters because **a wrong parameter key does not raise an error — it is silently ignored**, and your shortcut returns a confident wrong answer. We measured exactly that: a composed shortcut with a plausible-but-wrong key returned `0` instead of `3`, with no warning.

Use `mac_action_catalog` to look up a key, or just read the JSON. MIT, take it.

```
is.workflow.actions.addnewevent  — 새로운 이벤트  [harvested]
  출력: EKEvent
  권한: calendar, contacts, needs-interaction
  · WFCalendarItemTitle (text) — 제목
  · WFCalendarItemStartDate (date) — 시작일
  …
```

Coverage: 497 harvested from the registry, 9 inferred from cached definition strings, 33 not present on macOS (iOS-only actions, plus a few strings that are not actions at all — including one Apple typo).

## Setup, honestly

`mac-shortcuts-mcp setup` signs the bundled recipes on **your** Mac and opens each in the Shortcuts app. You click **Add Shortcut** once per recipe.

The package ships **readable XML plists**, not signed binaries. Open `recipes/*.plist` and see exactly what you are installing. An open-source tool that asks you to install opaque blobs is not really open.

Pass `--auto` and it will click **Add Shortcut** for you using the Accessibility API. That needs Accessibility permission, so it is off by default — a tool should not quietly ask for that.

The first time a recipe touches Contacts or Calendar, macOS asks for permission. That prompt belongs to Shortcuts, not to this server.

## Limits

**This does nothing while your Mac is asleep.** Processes are stopped; there is nothing to talk to. Screen lock is fine — we measured 62 of 63 calls succeeding with the screen locked, at the same speed as unlocked. Sleep is the real wall.

The bundled recipes read data; arbitrary installed Shortcuts may have side effects. macOS only. Results go to the agent you connected.

## When you need a device that is never asleep

A Mac in a bag cannot answer. A phone in your pocket can.

[**Askew**](https://askew.my) does the same thing for a **locked iPhone** — your agent runs a Shortcut on the phone and gets the result back in about three seconds, screen off, phone in your pocket. That one is not free, and it is a different problem: it needs a push relay, end-to-end encryption and an app. This tool is the part that does not.

## License

MIT. Issues and pull requests welcome.

---

## 한국어

**에이전트가 내 맥을 읽게 해 줍니다.** 일정·미리 알림·메모·연락처·클립보드·위치·날씨를 애플 단축어로 읽습니다. **읽기 전용, 로컬, 계정 없음, 서버 없음.**

```bash
npx -y mac-shortcuts-mcp setup      # 읽기 레시피 설치 (처음 한 번)
```

에이전트가 퍼스트파티 앱을 못 읽는 건 권한이 없어서고 API도 없기 때문입니다. **단축어는 읽을 수 있습니다.** 이 서버는 일을 `Shortcuts.app`에 넘기고 결과 텍스트만 받아 옵니다.

**기본 레시피는 읽기 전용입니다.** 다만 `mac_run_shortcut`은 쓰기·메시지 발송을 포함한 설치된 단축어도 실행할 수 있습니다. 동작을 모르면 사용자에게 먼저 묻도록 안내하지만, 읽기 전용을 강제하는 격리 환경은 아닙니다. 맥에서 읽어 온 내용은 전부 *지시가 아니라 자료*라는 꼬리표를 달고 갑니다.

**동작 카탈로그 539종**을 같이 공개합니다. 동작마다 어떤 매개변수 키를 받는지, 애플이 문서로 내지 않는 값입니다. 키가 틀리면 **오류 없이 조용히 무시되고 틀린 답이 옵니다** — 실제로 그렇게 재 봤습니다. 실행은 누구나 할 수 있지만 만드는 건 이 표가 있어야 합니다.

**한계: 맥이 자면 아무것도 못 합니다.** 화면 잠금은 괜찮습니다(잠근 채로 63회 중 62회 성공, 속도도 같음). 자는 게 벽입니다.

자지 않는 기기가 필요하면 그건 폰입니다. [**Askew**](https://askew.my)가 **잠긴 아이폰**에 같은 일을 합니다. 화면을 켜지 않고 3초쯤에 결과가 돌아옵니다. 그건 무료가 아니고 다른 문제입니다 — 푸시 릴레이와 종단 암호화와 앱이 필요합니다. 이 도구는 그게 필요 없는 부분입니다.
