import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const httpUrl = z.string().max(8192).refine((value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Enter an absolute HTTP or HTTPS URL");
const id = z.string().min(1).max(200);
const tab = z.object({ id, title: z.string(), url: z.string() });
const session = z.object({ sessionId: id, pageId: id, tabs: z.array(tab) });
const target = z.object({ sessionId: id, pageId: id });

export const openBrowser = defineRpc({
  name: "browser-tab.open",
  input: z.object({ workspaceId: id, url: httpUrl.optional() }),
  output: session,
});
export const frameBrowser = defineRpc({
  name: "browser-tab.frame",
  input: target.extend({ lastHash: z.string().max(100).optional() }),
  output: z.object({
    image: z.string().nullable(), hash: z.string(), width: z.number(), height: z.number(),
    url: z.string(), title: z.string(), tabs: z.array(tab), warnings: z.array(z.string()),
  }),
});
export const navigateBrowser = defineRpc({
  name: "browser-tab.navigate",
  input: target.extend({
    action: z.enum(["goto", "back", "forward", "reload", "new-tab", "close-tab"]),
    url: httpUrl.optional(),
  }),
  output: session,
});
export const browserInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(16000) }),
  z.object({ type: z.literal("key"), action: z.enum(["down", "up"]), key: z.string().min(1).max(80) }),
  z.object({ type: z.literal("pointer"), action: z.enum(["move", "down", "up"]),
    x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
    button: z.enum(["left", "middle", "right"]).default("left"), clicks: z.number().int().min(1).max(2).default(1) }),
  z.object({ type: z.literal("wheel"), x: z.number().finite(), y: z.number().finite() }),
]);
export type BrowserInput = z.infer<typeof browserInput>;
export const inputBrowser = defineRpc({
  name: "browser-tab.input",
  input: target.extend({ events: z.array(browserInput).min(1).max(64) }),
  output: z.object({ ok: z.boolean() }),
});
export const closeBrowser = defineRpc({
  name: "browser-tab.close", input: z.object({ sessionId: id }),
  output: z.object({ ok: z.boolean() }),
});
