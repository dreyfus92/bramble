import { FetchHttpClient } from "@effect/platform";
import { DiscordREST, DiscordRESTMemoryLive } from "dfx";
import { Effect, Layer } from "effect";
import { DiscordConfigLayer } from "./discord-config.ts";

/**
 * Discord REST API layer with HTTP client and config dependencies.
 */
const DiscordLayer = DiscordRESTMemoryLive.pipe(
	Layer.provide(FetchHttpClient.layer),
	Layer.provide(DiscordConfigLayer),
);

/**
 * Service that provides access to Discord application metadata.
 */
export class DiscordApplication extends Effect.Service<DiscordApplication>()(
	"app/DiscordApplication",
	{
		effect: DiscordREST.pipe(
			Effect.flatMap((_) => _.getMyApplication()),
			Effect.orDie,
		),
		dependencies: [DiscordLayer],
	},
) {}

/**
 * Combined Discord REST layer for API interactions.
 */
export const DiscordRestLayer = Layer.merge(DiscordLayer, DiscordApplication.Default);
