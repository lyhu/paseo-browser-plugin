import { mkdir, writeFile } from "node:fs/promises";
import { connectTestClient } from "./connection";
import { openBrowser, frameBrowser, closeBrowser } from "../shared/browser";

const url = process.argv[2];
if (!url) throw new Error("Usage: tsx tests/probe.ts <HTTP(S) URL>");
const client = await connectTestClient(true);
let sessionId: string | undefined;
try {
  const session = openBrowser.output.parse(await client.invokePluginRpc("browser-tab", openBrowser.name, { workspaceId: "private-site-probe", url }));
  sessionId = session.sessionId;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const result = frameBrowser.output.parse(await client.invokePluginRpc("browser-tab", frameBrowser.name, { sessionId, pageId: session.pageId }));
  if (!result.image) throw new Error("No browser image returned");
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/private-site.jpg", Buffer.from(result.image, "base64"));
  console.log(JSON.stringify({ transport: "public relay with E2EE", url: result.url, title: result.title, warnings: result.warnings, imageBytes: Buffer.from(result.image, "base64").length }));
} finally {
  if (sessionId) await client.invokePluginRpc("browser-tab", closeBrowser.name, { sessionId }).catch(() => {});
  await client.close();
}
