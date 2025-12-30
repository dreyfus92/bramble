import { Layer } from "effect";
import { GatewayEventsLive } from "./gateway-events.ts";

/**
 * Combined service layer for the Book Club bot.
 * Merges all service layers into a single layer.
 */
export const BookClubServiceLayer = Layer.mergeAll(
	GatewayEventsLive,
	// Additional services will be added here:
	// PollServiceLive,
	// BookClubServiceLive,
	// MeetingSchedulerLive,
	// LLMServiceLive,
);

/**
 * Builds the live service layer with all dependencies.
 */
export const buildBookClubLiveLayer = <A, R>(deps: Layer.Layer<A, R>) =>
	BookClubServiceLayer.pipe(Layer.provide(deps));
