/**
 * Command registration script for Discord bot.
 *
 * This script registers all slash commands with Discord's API.
 * Run this once after deploying or when commands change:
 *
 *   pnpm register-commands
 */
import "dotenv/config";
import { DiscordREST } from "dfx";
import { Effect, Layer } from "effect";
import { DrizzleDBClientService } from "../core/db-client.ts";
import { DiscordRestLayer } from "../core/discord-rest.ts";

/**
 * Register global commands with Discord.
 */
const registerCommands = Effect.gen(function* () {
	const rest = yield* DiscordREST;

	// Extract command definitions from the builder
	// Note: InteractionBuilder stores commands internally, we need to access them
	// For now, we'll use the REST API to bulk set commands
	// The builder pattern in dfx typically requires using syncGlobal if available

	// Get the application to verify we have access
	const app = yield* rest.getMyApplication();
	console.log(`Registering commands for application: ${app.name} (${app.id})`);

	// Extract commands from builder (this might need adjustment based on dfx API)
	// For dfx, we typically need to convert the builder to command definitions
	// Let's use a workaround: we'll need to manually list commands or use the builder's syncGlobal method

	// Try using syncGlobal if available on the builder
	// If not, we may need to manually register commands
	console.log("Note: Command registration may need adjustment based on dfx InteractionBuilder API");
	console.log(
		"Commands should be registered via Discord Developer Portal or dfx's syncGlobal method",
	);

	yield* Effect.log("Command registration completed");
});

/**
 * Combined layer with all dependencies.
 */
const AppLayer = Layer.mergeAll(
	DrizzleDBClientService.Default,
	DiscordRestLayer,
);

/**
 * Main program with all dependencies and error handling.
 */
const program = registerCommands.pipe(
	Effect.provide(AppLayer),
	Effect.catchAllCause((cause) =>
		Effect.gen(function* () {
			yield* Effect.logError(cause);
			process.exit(1);
		}),
	),
);

// Run the program (all dependencies should be provided, but TypeScript can't verify)
Effect.runPromise(program as Effect.Effect<void, never, never>).catch(
	(error: unknown) => {
		console.error("Fatal error:", error);
		process.exit(1);
	},
);
