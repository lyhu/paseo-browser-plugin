import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { connectTestClient } from "./connection";
import { startFixture } from "./fixture";
import { openBrowser, frameBrowser, inputBrowser, navigateBrowser, closeBrowser } from "../shared/browser";

const relay = process.argv.includes("--relay");
const pluginId = process.env.PASEO_TEST_PLUGIN_ID ?? "browser-tab";
const client = await connectTestClient(relay);
const fixture = await startFixture();
let sessionId: string | undefined;
try {
  const invoke = (method: string, value: unknown) => client.invokePluginRpc(pluginId, method, value);
  const session = openBrowser.output.parse(await invoke(openBrowser.name, { workspaceId: "integration-test", url: fixture.url }));
  sessionId = session.sessionId;
  const target = { sessionId, pageId: session.pageId };
  await invoke(inputBrowser.name, { ...target, events: [
    { type: "pointer", action: "down", x: 80, y: 100, button: "left", clicks: 1 },
    { type: "pointer", action: "up", x: 80, y: 100, button: "left", clicks: 1 },
    { type: "text", text: "Paseo RPC 中文验证" },
  ] });
  const frame = frameBrowser.output.parse(await invoke(frameBrowser.name, target));
  assert.match(frame.title, /text:Paseo RPC 中文验证/);
  assert.ok(frame.image);
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/daemon-rpc.jpg", Buffer.from(frame.image, "base64"));
  await invoke(navigateBrowser.name, { ...target, action: "goto", url: `${fixture.url}/noise` });
  const started = performance.now();
  const large = frameBrowser.output.parse(await invoke(frameBrowser.name, target));
  assert.equal(large.title, "Large frame ready");
  assert.ok(large.image);
  const bytes = Buffer.from(large.image, "base64").length;
  assert.ok(bytes > 100_000, "Exercise a frame larger than a simple blank/login page");
  console.log(JSON.stringify({ pass: true, largeFrameBytes: bytes, largeFrameRoundTripMs: Math.round(performance.now() - started), transport: relay ? "public relay with E2EE" : "daemon plugin RPC", width: frame.width, height: frame.height, title: frame.title }));
} finally {
  if (sessionId) await client.invokePluginRpc(pluginId, closeBrowser.name, { sessionId }).catch(() => {});
  await client.close(); await fixture.close();
}
