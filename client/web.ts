import { Platform } from "react-native";
import type { BrowserInput } from "../shared/browser";

// DOM access is confined to this web-only adapter; native clients render the same
// screenshots and can use the explicit text/scroll controls in the panel.
type WebEvent = {
  type: string; clientX: number; clientY: number; button: number; buttons: number;
  detail: number; pointerId: number; deltaX: number; deltaY: number; deltaMode: number;
  key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean;
  isComposing: boolean; data: string | null; inputType: string;
  clipboardData?: { getData(type: string): string };
  preventDefault(): void; stopPropagation(): void;
};
type WebNode = {
  addEventListener(type: string, listener: (event: WebEvent) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: WebEvent) => void): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  setPointerCapture?(id: number): void;
  releasePointerCapture?(id: number): void;
  appendChild(node: WebNode): void;
  remove(): void; focus(options?: unknown): void;
  setAttribute(name: string, value: string): void;
  value: string; style: { cssText: string };
  ownerDocument: { createElement(tag: string): WebNode };
};

export function attachWebInput(node: unknown, send: (input: BrowserInput) => void, getSize: () => { width: number; height: number }): () => void {
  if (Platform.OS !== "web" || !node || typeof (node as WebNode).addEventListener !== "function") return () => {};
  const root = node as WebNode;
  const editor = root.ownerDocument.createElement("textarea");
  editor.style.cssText = "position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;resize:none;pointer-events:none;";
  editor.setAttribute("aria-label", "Remote browser keyboard input");
  editor.setAttribute("autocomplete", "off");
  root.appendChild(editor);
  const removers: (() => void)[] = [];
  const listen = (target: WebNode, type: string, fn: (event: WebEvent) => void) => {
    target.addEventListener(type, fn, { passive: false });
    removers.push(() => target.removeEventListener(type, fn));
  };
  let composing = false;
  const held = new Set<string>();
  let heldButton: "left" | "middle" | "right" | null = null;
  let lastPoint = { x: 0, y: 0 };
  let lastMove = 0;
  let lastClick = { time: 0, x: 0, y: 0, button: -1, count: 0 };
  let clickCount = 1;
  const point = (event: WebEvent) => {
    const bounds = root.getBoundingClientRect();
    const size = getSize();
    return {
      x: Math.max(0, Math.min(size.width - 1, (event.clientX - bounds.left) * size.width / bounds.width)),
      y: Math.max(0, Math.min(size.height - 1, (event.clientY - bounds.top) * size.height / bounds.height)),
    };
  };
  const button = (n: number) => n === 2 ? "right" as const : n === 1 ? "middle" as const : "left" as const;
  listen(root, "pointerdown", (e) => {
    e.preventDefault(); editor.focus({ preventScroll: true });
    root.setPointerCapture?.(e.pointerId);
    heldButton = button(e.button); lastPoint = point(e);
    const now = Date.now();
    clickCount = now - lastClick.time < 500 && Math.abs(lastPoint.x - lastClick.x) < 5 && Math.abs(lastPoint.y - lastClick.y) < 5 && e.button === lastClick.button && lastClick.count === 1 ? 2 : 1;
    lastClick = { time: now, ...lastPoint, button: e.button, count: clickCount };
    send({ type: "pointer", action: "down", ...lastPoint, button: heldButton, clicks: clickCount });
  });
  listen(root, "pointermove", (e) => {
    // Preserve drag motion while bounding idle hover RPCs.
    if (Date.now() - lastMove < 50) return;
    lastMove = Date.now(); lastPoint = point(e);
    send({ type: "pointer", action: "move", ...lastPoint, button: heldButton ?? "left", clicks: 1 });
  });
  const releasePointer = (e: WebEvent) => {
    if (!heldButton) return;
    lastPoint = point(e);
    send({ type: "pointer", action: "up", ...lastPoint, button: heldButton, clicks: clickCount });
    heldButton = null;
    try { root.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
  };
  listen(root, "pointerup", releasePointer);
  listen(root, "pointercancel", releasePointer);
  listen(root, "contextmenu", (e) => e.preventDefault());
  listen(root, "wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? getSize().height : 1;
    send({ type: "wheel", x: e.deltaX * factor, y: e.deltaY * factor });
  });
  const keyName = (key: string) => key === " " ? "Space" : key;
  listen(editor, "keydown", (e) => {
    if (e.isComposing || composing || ["Process", "Dead", "Unidentified"].includes(e.key)) return;
    // Let the local clipboard generate a paste event; the text goes to mini.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") return;
    e.preventDefault(); e.stopPropagation();
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      send({ type: "text", text: e.key });
    } else {
      const key = keyName(e.key); held.add(key);
      send({ type: "key", action: "down", key });
    }
  });
  listen(editor, "keyup", (e) => {
    const key = keyName(e.key);
    if (held.delete(key)) { e.preventDefault(); send({ type: "key", action: "up", key }); }
  });
  listen(editor, "compositionstart", () => { composing = true; });
  listen(editor, "compositionend", (e) => {
    composing = false;
    if (e.data) send({ type: "text", text: e.data });
    editor.value = "";
  });
  listen(editor, "beforeinput", (e) => {
    if (!composing && !e.isComposing && e.inputType === "insertText" && e.data) {
      e.preventDefault(); send({ type: "text", text: e.data });
    }
  });
  listen(editor, "paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain");
    if (text) send({ type: "text", text: text.slice(0, 16000) });
  });
  const releaseKeys = () => {
    for (const key of held) send({ type: "key", action: "up", key });
    held.clear();
    if (heldButton) send({ type: "pointer", action: "up", ...lastPoint, button: heldButton, clicks: clickCount });
    heldButton = null;
  };
  listen(editor, "blur", releaseKeys);
  return () => { releaseKeys(); removers.forEach((remove) => remove()); editor.remove(); };
}
