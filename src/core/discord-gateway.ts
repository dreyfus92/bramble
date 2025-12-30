import { NodeHttpClient, NodeSocket } from "@effect/platform-node";
import { DiscordIxLive } from "dfx/gateway";
import { Layer } from "effect";
import { DiscordConfigLayer } from "./discord-config.ts";
import { DiscordApplication } from "./discord-rest.ts";

/**
 * Discord gateway layer with WebSocket and HTTP client configuration.
 *
 * Composes the Discord gateway by:
 * - Merging Node HTTP client (using Undici)
 * - Providing WebSocket constructor for Node environments
 * - Injecting Discord configuration
 */
const DiscordLayer = DiscordIxLive.pipe(
	Layer.provideMerge(NodeHttpClient.layerUndici),
	Layer.provide(NodeSocket.layerWebSocketConstructor),
	Layer.provide(DiscordConfigLayer),
);

/**
 * Combined Discord gateway layer for bot operations.
 * Includes gateway connection and application metadata.
 */
export const DiscordGatewayLayer = Layer.merge(DiscordLayer, DiscordApplication.Default);
