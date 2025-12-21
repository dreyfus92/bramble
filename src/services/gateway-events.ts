import { Ix } from 'dfx';
import { InteractionsRegistry } from 'dfx/gateway';
import { Effect, Layer } from 'effect';

/**
 * Gateway events service.
 * Handles Discord gateway events and interaction registration.
 */
const make = Effect.gen(function* () {
	const registry = yield* InteractionsRegistry;

	// Build the interactions definition
	const interactions = Ix.builder
		.add(
			Ix.global(
				{
					name: 'ping',
					description: 'Check if the bot is alive',
				},
				Effect.succeed({
					type: 4 as const,
					data: { content: 'Pong! 🏓 Book Club Bot is running.' },
				})
			)
		)
		.catchAllCause(Effect.logError);

	// Register all commands
	yield* registry.register(interactions);

	// TODO: Add more slash commands:
	// - /poll create [question] [options...]
	// - /poll end [poll_id]
	// - /question submit [question]
	// - /question list
	// - /meeting schedule [date] [time]
	// - /meeting list
	// - /ask [question]
	// - /export [type]

	yield* Effect.log('Gateway events service initialized');
});

/**
 * Live gateway events layer.
 */
export const GatewayEventsLive = Layer.effectDiscard(make);
