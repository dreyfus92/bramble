import { Context, Effect, Fiber, Layer, Queue, Scope } from 'effect';

/**
 * Available application events with their payloads.
 */
type AvailableAppEvents = {
	'poll.created': { pollId: number; guildId: string; channelId: string };
	'poll.voted': { pollId: number; userId: string; optionIndex: number };
	'poll.ended': { pollId: number; guildId: string };
	'session.created': { sessionId: number; bookTitle: string; guildId: string };
	'session.ended': { sessionId: number; guildId: string };
	'question.submitted': { questionId: number; sessionId: number; userId: string };
	'meeting.scheduled': { meetingId: number; guildId: string; scheduledAt: string };
	'meeting.reminder': { meetingId: number; guildId: string };
};

/**
 * Discriminated union of all application events.
 */
export type AppEvents = {
	[K in keyof AvailableAppEvents]: { type: K; payload: AvailableAppEvents[K] };
}[keyof AvailableAppEvents];

/**
 * Event bus interface for publishing and subscribing to events.
 */
export interface EventBus {
	readonly publish: <E extends AppEvents>(event: E) => Effect.Effect<void>;
	readonly subscribe: <E extends AppEvents['type']>(
		eventType: E,
		handler: (event: Extract<AppEvents, { type: E }>) => Effect.Effect<void>
	) => Effect.Effect<void>;
}

/**
 * Event bus context tag.
 */
export const EventBus = Context.GenericTag<EventBus>('EventBus');

/**
 * Creates an event bus with async queue processing.
 */
const makeEventBus = Effect.gen(function* () {
	const [queue, listeners, scope] = yield* Effect.all([
		Queue.unbounded<AppEvents>(),
		Effect.sync(() => new Map<string, Array<(event: AppEvents) => Effect.Effect<void>>>()),
		Effect.scope,
	]);

	// Start the event processor fiber
	const processorFiber = yield* Effect.fork(
		Effect.forever(
			Effect.gen(function* () {
				const event = yield* Queue.take(queue);
				const handlers = listeners.get(event.type) || [];

				yield* Effect.all(
					handlers.map((handler) =>
						Effect.catchAll(handler(event), (error) =>
							Effect.logError(`Event handler error for ${event.type}`, error)
						)
					),
					{ concurrency: 'unbounded' }
				);
			})
		)
	);

	// Cleanup when scope closes
	yield* Scope.addFinalizer(
		scope,
		Fiber.interrupt(processorFiber).pipe(
			Effect.flatMap(() => Effect.log('EventBus processor stopped'))
		)
	);

	return {
		publish: <E extends AppEvents>(event: E) => Queue.offer(queue, event),
		subscribe: <E extends AppEvents['type']>(
			eventType: E,
			handler: (event: Extract<AppEvents, { type: E }>) => Effect.Effect<void>
		) =>
			Effect.sync(() => {
				const handlers = listeners.get(eventType) || [];
				handlers.push(handler as (event: AppEvents) => Effect.Effect<void>);
				listeners.set(eventType, handlers);
			}),
	};
});

/**
 * Live event bus layer.
 */
export const EventBusLive = Layer.scoped(EventBus, makeEventBus);

