import { randomUUID } from "node:crypto";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { parseRelayConnectionUri, buildRelayWebSocketUrl } from "@getpaseo/protocol/daemon-endpoints";

export async function connectTestClient(relay = false) {
  const config = { clientId: randomUUID(), clientType: "cli" as const, appVersion: "0.10.3", reconnect: { enabled: false }, connectTimeoutMs: 20_000 };
  const local = new DaemonClient({ ...config, url: process.env.PASEO_TEST_URL ?? "ws://127.0.0.1:6767/ws" });
  await local.connect();
  if (!relay) return local;
  let client: DaemonClient | undefined;
  try {
    const result = await local.getDaemonPairingOffer();
    const offer = parseConnectionOfferFromUrl(result.url) ?? parseRelayConnectionUri(result.url).offer;
    client = new DaemonClient({
      ...config, clientId: randomUUID(),
      url: buildRelayWebSocketUrl({ endpoint: offer.relay.endpoint, useTls: offer.relay.useTls ?? true, serverId: offer.serverId, role: "client" }),
      e2ee: { enabled: true, daemonPublicKeyB64: offer.daemonPublicKeyB64 },
    });
    await client.connect();
    return client;
  } catch (error) {
    await client?.close(); throw error;
  } finally { await local.close(); }
}
