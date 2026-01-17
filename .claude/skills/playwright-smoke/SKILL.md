---
name: playwright-smoke
description: Run Playwright smoke tests for this project. Use when the user asks to run smoke tests, Playwright E2E, browser tests, or wants a quick confidence check before/after pushing.
allowed-tools: RunCommand
---

# Playwright Smoke

Run this project's Playwright smoke suite (Chromium) and report results.

## When to use this Skill

Use this Skill when the user mentions:
- Playwright / E2E / 浏览器测试 / smoke test / 冒烟测试
- “上线前跑一下测试”“回归一下”“确认没有 runtime error”

## What to run (default)

Run the Chromium-only smoke suite:

```bash
npx playwright test tests/browsers.test.js --project=chromium
```

## Workflow

1. Run the default command above from the project root:
   - `d:\Code\Shan_Hai_Jing\might-magic_mc_new`
2. If the run fails due to missing Playwright browsers, install Chromium only, then rerun:
   - `npx playwright install chromium`
3. Report:
   - number of tests passed/failed
   - any console/page errors surfaced by the tests (if present)
   - the exact failing test name(s) and the first relevant error block (if failing)

## Notes

- This project’s Playwright config starts the dev server automatically.
- Prefer Chromium-only for smoke unless the user explicitly asks for Firefox/WebKit.
