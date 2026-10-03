import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BrowserTabPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "browser-tab", title: "Remote Browser", icon: "Globe", context: "workspace",
    locations: ["workspace"], Component: BrowserTabPanel,
  });
  client.addCommandCenterItem({
    id: "open-browser-tab", title: "Open remote browser", icon: "Globe",
    keywords: ["browser", "remote", "内网", "浏览器"], context: "workspace",
    onSelect({ openPanel }) { openPanel("browser-tab"); },
  });
  return () => {};
}
