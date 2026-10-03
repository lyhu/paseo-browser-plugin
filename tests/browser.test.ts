import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { BrowserManager } from "../server/browser";
import { httpUrl, inputBrowser } from "../shared/browser";
import { startFixture } from "./fixture";

test("only HTTP(S) navigation and bounded finite input are accepted", () => {
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,test", "not a URL"]) assert.equal(httpUrl.safeParse(url).success, false);
  assert.equal(httpUrl.safeParse("http://172.29.227.37:8048/#claude-configs").success, true);
  assert.equal(inputBrowser.input.safeParse({ sessionId: "s", pageId: "p", events: [{ type: "pointer", action: "down", x: Infinity, y: 1 }] }).success, false);
});

test("macOS Chrome: frames, pointer, Chinese text, keys, wheel, WebSocket/SSE, tabs and persistent isolated profiles", { timeout: 90_000 }, async () => {
  await mkdir(".runtime", { recursive: true });
  const root = await mkdtemp(join(".runtime", "browser-test-"));
  const fixture = await startFixture();
  const manager = new BrowserManager({ profileRoot: root });
  const waitTitle = async (sessionId: string, pageId: string, pattern: RegExp) => {
    const end = Date.now() + 10_000;
    let lastTitle = "";
    while (Date.now() < end) {
      const frame = await manager.frame({ sessionId, pageId });
      lastTitle = frame.title;
      if (pattern.test(frame.title)) return frame;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Remote browser did not reach ${pattern}; last title: ${lastTitle}`);
  };
  try {
    const session = await manager.open({ workspaceId: "test-one", url: fixture.url });
    const target = { sessionId: session.sessionId, pageId: session.pageId };
    const first = await waitTitle(target.sessionId, target.pageId, /ws:echo\|sse:ready/);
    assert.equal(first.width, 1280); assert.equal(first.height, 800);
    assert.ok(first.image);
    assert.equal(Buffer.from(first.image, "base64").subarray(0, 3).toString("hex"), "ffd8ff");
    const click = (x: number, y: number) => manager.input({ ...target, events: [
      { type: "pointer", action: "down", x, y, button: "left", clicks: 1 },
      { type: "pointer", action: "up", x, y, button: "left", clicks: 1 },
    ] });
    await click(80, 40);
    await waitTitle(target.sessionId, target.pageId, /click:1/);
    await click(80, 100);
    await manager.input({ ...target, events: [{ type: "text", text: "内网 Chrome 验证" }] });
    await waitTitle(target.sessionId, target.pageId, /text:内网 Chrome 验证/);
    await manager.input({ ...target, events: [{ type: "key", action: "down", key: "Backspace" }, { type: "key", action: "up", key: "Backspace" }] });
    await waitTitle(target.sessionId, target.pageId, /text:内网 Chrome 验\|/);
    await click(80, 160);
    const popupFrame = await manager.frame(target);
    assert.equal(popupFrame.tabs.length, 2);
    await manager.input({ ...target, events: [{ type: "pointer", action: "move", x: 400, y: 400, button: "left", clicks: 1 }, { type: "wheel", x: 0, y: 500 }] });
    await waitTitle(target.sessionId, target.pageId, /scroll:500/);
    const other = await manager.open({ workspaceId: "test-two", url: fixture.url });
    const otherFrame = await manager.frame({ sessionId: other.sessionId, pageId: other.pageId });
    assert.match(otherFrame.title, /saved:null/);
    await manager.close({ sessionId: other.sessionId });
    await manager.close({ sessionId: target.sessionId });
    await assert.rejects(manager.frame(target), /expired/);
    const reopened = await manager.open({ workspaceId: "test-one", url: fixture.url });
    const persisted = await manager.frame({ sessionId: reopened.sessionId, pageId: reopened.pageId });
    assert.match(persisted.title, /saved:yes/);
    const reopenedTarget = { sessionId: reopened.sessionId, pageId: reopened.pageId };
    await manager.navigate({ ...reopenedTarget, action: "goto", url: `${fixture.url}/broken` });
    const broken = await manager.frame(reopenedTarget);
    assert.ok(broken.warnings.some((warning) => warning.includes("fixture application failed")));
    await manager.navigate({ ...reopenedTarget, action: "back" });
    const restored = await manager.frame(reopenedTarget);
    assert.equal(restored.url, `${fixture.url}/`);
    assert.deepEqual(restored.warnings, []);
    const unchanged = await manager.frame({ ...reopenedTarget, lastHash: restored.hash });
    assert.equal(unchanged.image, null);
    await manager.navigate({ ...reopenedTarget, action: "close-tab" });
    const live = await manager.open({ workspaceId: "test-one" });
    assert.equal(live.tabs.length, 1);
    await manager.frame({ sessionId: live.sessionId, pageId: live.pageId });
    await assert.rejects(manager.navigate({ sessionId: reopened.sessionId, pageId: reopened.pageId, action: "goto", url: "file:///etc/passwd" }));
  } finally {
    await manager.dispose(); await fixture.close(); await rm(root, { recursive: true, force: true });
  }
});
