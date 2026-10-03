import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { openBrowser, frameBrowser, inputBrowser, navigateBrowser, closeBrowser, type BrowserInput } from "../shared/browser";
import { attachWebInput } from "./web";

export function BrowserTabPanel({ theme, workspaceId }: PluginWorkspacePanelProps) {
  const open = useRpc(openBrowser), frame = useRpc(frameBrowser), input = useRpc(inputBrowser);
  const navigate = useRpc(navigateBrowser), close = useRpc(closeBrowser);
  const [session, setSession] = useState<RpcOutput<typeof openBrowser> | null>(null);
  const [url, setUrl] = useState("http://172.29.227.37:8048/#claude-configs");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [area, setArea] = useState({ width: 1000, height: 600 });
  const [node, setNode] = useState<unknown>(null);
  const size = useRef({ width: 1280, height: 800 });
  const sessionRef = useRef(session); sessionRef.current = session;
  const mounted = useRef(true);
  type Target = { sessionId: string; pageId: string };
  const queue = useRef<{ event: BrowserInput; target: Target }[]>([]);
  const sending = useRef(false);
  const rpcRef = useRef({ input, frame }); rpcRef.current = { input, frame };
  const target = session ? `${session.sessionId}:${session.pageId}` : null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const send = useCallback((event: BrowserInput, destination?: Target) => {
    const currentTarget = destination ?? sessionRef.current;
    if (!currentTarget) return;
    const pending = queue.current;
    // Coalesce hover movement, but never discard button/key transitions.
    const previous = pending[pending.length - 1];
    if (event.type === "pointer" && event.action === "move" && previous?.event.type === "pointer" && previous.event.action === "move" && previous.target.pageId === currentTarget.pageId) pending.pop();
    if (pending.length >= 256) { setError("Input queue is full. Wait for the connection to catch up."); return; }
    pending.push({ event, target: { sessionId: currentTarget.sessionId, pageId: currentTarget.pageId } });
    if (sending.current) return;
    sending.current = true;
    void (async () => {
      try {
        while (queue.current.length) {
          const first = queue.current[0];
          let count = 1;
          while (count < Math.min(64, queue.current.length) && queue.current[count].target.sessionId === first.target.sessionId && queue.current[count].target.pageId === first.target.pageId) count++;
          await rpcRef.current.input({ ...first.target, events: queue.current.splice(0, count).map((item) => item.event) });
        }
      } catch (e) { queue.current = []; if (mounted.current) setError(String(e)); }
      finally { sending.current = false; }
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hash: string | undefined;
    setImage(null);
    const poll = async () => {
      let delay = 120;
      try {
        const result = await rpcRef.current.frame({ sessionId: session.sessionId, pageId: session.pageId, lastHash: hash });
        if (cancelled) return;
        hash = result.hash; size.current = { width: result.width, height: result.height };
        if (result.image) setImage(`data:image/jpeg;base64,${result.image}`);
        setRemoteUrl(result.url); setWarnings(result.warnings);
        setSession((current) => current && current.pageId === session.pageId ? { ...current, tabs: result.tabs } : current);
        setPollError(null);
      } catch (e) { if (!cancelled) setPollError(String(e)); delay = 1500; }
      if (!cancelled) timer = setTimeout(() => void poll(), delay);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
    // A tab switch owns exactly one polling loop. RPC functions are read via ref.
  }, [target]);

  useEffect(() => {
    if (!session) return;
    const destination = { sessionId: session.sessionId, pageId: session.pageId };
    return attachWebInput(node, (event) => send(event, destination), () => size.current);
  }, [node, send, target]);

  const start = async () => {
    if (busy) return;
    setBusy(true); setError(null); setPollError(null);
    try { setSession(await open({ workspaceId, url })); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const nav = async (action: "goto" | "back" | "forward" | "reload" | "new-tab" | "close-tab") => {
    if (!session || busy) return;
    setBusy(true); setError(null); setPollError(null);
    try { setSession(await navigate({ sessionId: session.sessionId, pageId: session.pageId, action, ...(action === "goto" || action === "new-tab" ? { url } : {}) })); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const closeSession = async () => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try {
      await close({ sessionId: session.sessionId });
      setSession(null); setImage(null); setRemoteUrl(""); setWarnings([]); setPollError(null);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const scale = Math.min(area.width / size.current.width, area.height / size.current.height);
  const colors = theme.colors;
  const button = (label: string, onPress: () => void, disabled = busy) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
      style={{ padding: 8, borderRadius: 4, backgroundColor: colors.surface0, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: colors.foreground }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, padding: 8, gap: 6, backgroundColor: colors.surface0 }}>
      <Text style={{ color: colors.foregroundMuted }}>Remote Browser · 页面和登录状态保存在远程主机</Text>
      <View style={{ flexDirection: "row", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {button("←", () => void nav("back"), busy || !session)}
        {button("→", () => void nav("forward"), busy || !session)}
        {button("刷新", () => void nav("reload"), busy || !session)}
        <TextInput accessibilityLabel="Remote URL" value={url} onChangeText={setUrl} onSubmitEditing={() => void (session ? nav("goto") : start())}
          autoCapitalize="none" autoCorrect={false}
          style={{ flex: 1, minWidth: 180, color: colors.foreground, borderWidth: 1, borderColor: colors.foregroundMuted, padding: 8 }} />
        {button(session ? "打开" : "连接", () => void (session ? nav("goto") : start()))}
        {button("重新连接", () => void start())}
        {button("新标签", () => void nav("new-tab"), busy || !session)}
        {button("关闭会话", () => void closeSession(), busy || !session)}
      </View>
      {session && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {session.tabs.map((tab) => <Pressable key={tab.id} accessibilityRole="button" accessibilityLabel={`Tab: ${tab.title || "新标签"}`} onPress={() => { setSession({ ...session, pageId: tab.id }); setUrl(tab.url === "about:blank" ? url : tab.url); }}
          style={{ padding: 6, borderBottomWidth: tab.id === session.pageId ? 2 : 0, borderColor: colors.accent }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, maxWidth: 240 }}>{tab.title || "新标签"}</Text>
        </Pressable>)}
        {button("关闭标签", () => void nav("close-tab"), busy)}
      </View>}
      {!!remoteUrl && <Text numberOfLines={1} style={{ color: colors.foregroundMuted }}>{remoteUrl}</Text>}
      {!!(error || pollError) && <Text selectable style={{ color: colors.statusDanger }}>{error || pollError}</Text>}
      {warnings.map((warning, i) => <Text key={i} selectable numberOfLines={2} style={{ color: colors.statusDanger }}>{warning}</Text>)}
      <View style={{ flex: 1, minHeight: 180, justifyContent: "center", alignItems: "center" }}
        onLayout={(event) => setArea({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
        {image ? <View ref={setNode} testID="remote-browser-viewer" style={{ width: size.current.width * scale, height: size.current.height * scale, overflow: "hidden" }}>
          <Image accessibilityLabel="Remote browser screen" source={{ uri: image }} resizeMode="stretch" style={{ width: "100%", height: "100%" }} />
        </View> : <Text style={{ color: colors.foregroundMuted }}>{session ? "正在获取远程画面…" : "输入地址并连接远程浏览器"}</Text>}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        <TextInput accessibilityLabel="Text to remote browser" placeholder="中文输入 / 粘贴文字到远程焦点" placeholderTextColor={colors.foregroundMuted}
          value={text} onChangeText={setText} style={{ flex: 1, color: colors.foreground, borderWidth: 1, borderColor: colors.foregroundMuted, padding: 6 }} />
        {button("发送文字", () => { if (text) { send({ type: "text", text }); setText(""); } }, !session)}
        {Platform.OS !== "web" && button("向下滚动", () => send({ type: "wheel", x: 0, y: 500 }), !session)}
      </View>
    </View>
  );
}
