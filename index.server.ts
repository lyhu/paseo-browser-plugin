import type { PluginServerContext } from "@getpaseo/plugin/server";
import { BrowserManager } from "./server/browser";
import { openBrowser, frameBrowser, navigateBrowser, inputBrowser, closeBrowser } from "./shared/browser";

export default function contribute(server: PluginServerContext) {
  const manager = new BrowserManager();
  server.handle(openBrowser, (input) => manager.open(input));
  server.handle(frameBrowser, (input) => manager.frame(input));
  server.handle(navigateBrowser, (input) => manager.navigate(input));
  server.handle(inputBrowser, (input) => manager.input(input));
  server.handle(closeBrowser, (input) => manager.close(input));
  return () => manager.dispose();
}
