import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setInterval, clearInterval } from "node:timers";
import puppeteer, { type Browser, type Page, type KeyInput, type CDPSession } from "puppeteer-core";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { openBrowser, frameBrowser, navigateBrowser, inputBrowser, closeBrowser, httpUrl } from "../shared/browser";

type Session = {
  id: string; workspaceId: string; context: Browser; pages: Map<string, Page>;
  tail: Promise<unknown>; lastUsed: number;
};
export type BrowserManagerOptions = { profileRoot?: string; executablePath?: string; headless?: boolean; idleMs?: number };

export class BrowserManager {
  private sessions = new Map<string, Session>();
  private opening = new Map<string, Promise<RpcOutput<typeof openBrowser>>>();
  private readonly timer: ReturnType<typeof setInterval>;
  private stopping = false;
  private diagnostics = new WeakMap<Page, string[]>();
  private pointers = new WeakMap<Page, { x: number; y: number; buttons: number; cdp: CDPSession }>();
  constructor(private options: BrowserManagerOptions = {}) {
    this.timer = setInterval(() => {
      for (const s of this.sessions.values()) {
        if (Date.now() - s.lastUsed > (options.idleMs ?? 30 * 60_000)) void this.close({ sessionId: s.id }).catch((error) => console.error("Browser idle cleanup failed", error));
      }
    }, 60_000);
  }

  private executable(): string {
    const requested = this.options.executablePath ?? process.env.PASEO_BROWSER_EXECUTABLE;
    if (requested) {
      if (!existsSync(requested)) throw new Error("PASEO_BROWSER_EXECUTABLE does not exist");
      return requested;
    }
    if (process.platform === "darwin") {
      const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      if (existsSync(chrome)) return chrome;
    }
    for (const path of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
      if (existsSync(path)) return path;
    }
    throw new Error("Chrome/Chromium not found. Install Chrome or set PASEO_BROWSER_EXECUTABLE.");
  }

  private addPage(s: Session, page: Page): string {
    for (const [id, existing] of s.pages) if (existing === page) return id;
    const id = randomUUID();
    s.pages.set(id, page);
    const warnings: string[] = [];
    this.diagnostics.set(page, warnings);
    const warn = (message: string) => { warnings.push(message.slice(0, 1000)); if (warnings.length > 4) warnings.shift(); };
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText;
      if (reason && !reason.includes("ERR_ABORTED")) warn(`${reason}: ${request.url()}`);
    });
    page.on("pageerror", (error) => warn(String(error)));
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) warnings.length = 0; });
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(20_000);
    page.on("close", () => s.pages.delete(id));
    // Native Chrome dialogs cannot be rendered in page screenshots; prevent them from stalling RPCs.
    page.on("dialog", (dialog) => void (dialog.type() === "alert" ? dialog.accept() : dialog.dismiss()).catch(() => {}));
    return id;
  }

  private async info(s: Session, pageId: string): Promise<RpcOutput<typeof openBrowser>> {
    const tabs = await Promise.all([...s.pages].filter(([, p]) => !p.isClosed()).map(async ([id, p]) => ({
      id, url: p.url(), title: await p.title().catch(() => ""),
    })));
    return { sessionId: s.id, pageId, tabs };
  }

  private get(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Browser session expired. Reconnect to open it again.");
    s.lastUsed = Date.now();
    return s;
  }

  private page(s: Session, id: string): Page {
    const p = s.pages.get(id);
    if (!p || p.isClosed()) throw new Error("Browser tab closed. Select another tab or reconnect.");
    return p;
  }

  private enqueue<T>(s: Session, fn: () => Promise<T>): Promise<T> {
    const result = s.tail.then(fn);
    s.tail = result.catch(() => {});
    return result;
  }

  async open(input: RpcInput<typeof openBrowser>): Promise<RpcOutput<typeof openBrowser>> {
    if (this.stopping) throw new Error("Browser plugin is stopping");
    if (input.url) httpUrl.parse(input.url);
    const pending = this.opening.get(input.workspaceId);
    if (pending) {
      await pending;
      return this.open(input);
    }
    const existing = [...this.sessions.values()].find((s) => s.workspaceId === input.workspaceId);
    if (existing) {
      const pageId = existing.pages.keys().next().value ?? this.addPage(existing, await existing.context.newPage());
      if (input.url) return this.navigate({ sessionId: existing.id, pageId, action: "goto", url: input.url });
      existing.lastUsed = Date.now();
      return this.info(existing, pageId);
    }
    if (this.sessions.size + this.opening.size >= 4) throw new Error("Four browser sessions are already active. Close one before opening another.");
    const work = this.create(input);
    this.opening.set(input.workspaceId, work);
    try { return await work; } finally { this.opening.delete(input.workspaceId); }
  }

  private async create(input: RpcInput<typeof openBrowser>): Promise<RpcOutput<typeof openBrowser>> {
    const root = this.options.profileRoot ?? process.env.PASEO_BROWSER_PROFILE_ROOT ??
      join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "browser-tab", "profiles");
    const profile = join(root, createHash("sha256").update(input.workspaceId).digest("hex"));
    await mkdir(profile, { recursive: true, mode: 0o700 });
    const context = await puppeteer.launch({
      userDataDir: profile,
      executablePath: this.executable(),
      headless: this.options.headless ?? process.env.PASEO_BROWSER_HEADLESS !== "false",
      defaultViewport: { width: 1280, height: 800 },
      protocolTimeout: 15_000,
      timeout: 20_000,
    });
    const s: Session = { id: randomUUID(), workspaceId: input.workspaceId, context, pages: new Map(), tail: Promise.resolve(), lastUsed: Date.now() };
    this.sessions.set(s.id, s);
    context.on("targetcreated", (target) => {
      void target.page().then((page) => { if (page) this.addPage(s, page); }).catch(() => {});
    });
    context.on("disconnected", () => this.sessions.delete(s.id));
    const pages = await context.pages();
    const page = pages[0] ?? await context.newPage();
    for (const p of pages) this.addPage(s, p);
    const pageId = this.addPage(s, page);
    try {
      if (input.url) await page.goto(input.url, { waitUntil: "domcontentloaded" });
      return await this.info(s, pageId);
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async frame(input: RpcInput<typeof frameBrowser>): Promise<RpcOutput<typeof frameBrowser>> {
    const s = this.get(input.sessionId);
    return this.enqueue(s, async () => {
      const page = this.page(s, input.pageId);
      await page.bringToFront();
      const bytes = await page.screenshot({ type: "jpeg", quality: 45 });
      const hash = createHash("sha256").update(bytes).digest("hex");
      const viewport = page.viewport() ?? { width: 1280, height: 800 };
      return {
        image: hash === input.lastHash ? null : Buffer.from(bytes).toString("base64"), hash, width: viewport.width, height: viewport.height,
        url: page.url(), title: await page.title(), tabs: (await this.info(s, input.pageId)).tabs, warnings: this.diagnostics.get(page) ?? [],
      };
    });
  }

  async navigate(input: RpcInput<typeof navigateBrowser>): Promise<RpcOutput<typeof navigateBrowser>> {
    if (input.action === "goto" || input.action === "new-tab") httpUrl.parse(input.url);
    const s = this.get(input.sessionId);
    return this.enqueue(s, async () => {
      let page = this.page(s, input.pageId);
      let pageId = input.pageId;
      switch (input.action) {
        case "goto": await page.goto(input.url!, { waitUntil: "domcontentloaded" }); break;
        case "reload": await page.reload({ waitUntil: "domcontentloaded" }); break;
        case "back": await page.goBack({ waitUntil: "domcontentloaded" }); break;
        case "forward": await page.goForward({ waitUntil: "domcontentloaded" }); break;
        case "new-tab":
          page = await s.context.newPage(); pageId = this.addPage(s, page);
          await page.goto(input.url!, { waitUntil: "domcontentloaded" }); break;
        case "close-tab":
          // Keep a live page so a workspace never becomes an unusable viewer.
          if (s.pages.size === 1) {
            pageId = this.addPage(s, await s.context.newPage());
          }
          await page.close(); pageId = s.pages.keys().next().value!; break;
      }
      return this.info(s, pageId);
    });
  }

  async input(input: RpcInput<typeof inputBrowser>): Promise<RpcOutput<typeof inputBrowser>> {
    const s = this.get(input.sessionId);
    return this.enqueue(s, async () => {
      const page = this.page(s, input.pageId);
      await page.bringToFront();
      const viewport = page.viewport()!;
      let pointer = this.pointers.get(page);
      if (!pointer) {
        pointer = { x: 0, y: 0, buttons: 0, cdp: await page.createCDPSession() };
        this.pointers.set(page, pointer);
      }
      for (const event of input.events) {
        switch (event.type) {
          case "text": await page.keyboard.sendCharacter(event.text); break;
          case "key":
            if (event.action === "down") await page.keyboard.down(event.key as KeyInput);
            else await page.keyboard.up(event.key as KeyInput);
            break;
          case "wheel":
            await pointer.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: pointer.x, y: pointer.y, deltaX: event.x, deltaY: event.y });
            break;
          case "pointer":
            pointer.x = Math.min(viewport.width - 1, event.x); pointer.y = Math.min(viewport.height - 1, event.y);
            const mask = event.button === "left" ? 1 : event.button === "right" ? 2 : 4;
            if (event.action === "down") pointer.buttons |= mask;
            if (event.action === "up") pointer.buttons &= ~mask;
            await pointer.cdp.send("Input.dispatchMouseEvent", {
              type: event.action === "move" ? "mouseMoved" : event.action === "down" ? "mousePressed" : "mouseReleased",
              x: pointer.x, y: pointer.y, button: event.action === "move" ? "none" : event.button,
              buttons: pointer.buttons, clickCount: event.action === "move" ? 0 : event.clicks,
            });
            break;
        }
      }
      return { ok: true };
    });
  }

  async close(input: RpcInput<typeof closeBrowser>): Promise<RpcOutput<typeof closeBrowser>> {
    const s = this.sessions.get(input.sessionId);
    if (s) {
      this.sessions.delete(s.id);
      await s.tail;
      await s.context.close();
    }
    return { ok: true };
  }

  async dispose(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await Promise.allSettled([...this.opening.values()]);
    await Promise.allSettled([...this.sessions.keys()].map((sessionId) => this.close({ sessionId })));
  }
}
