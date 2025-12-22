/**
 * Book Club Bot - Main Entry Point
 *
 * A Discord bot for managing book club activities:
 * - Custom polls with button voting
 * - Book session management
 * - Question submission for discussions
 * - Meeting scheduling
 * - Groq-powered Q&A with rate limiting
 */

import 'dotenv/config';
import { NodeRuntime } from '@effect/platform-node';
import { Config, Effect, Layer, Logger, LogLevel, RuntimeFlags } from 'effect';
import { DiscordGatewayLayer } from './core/discord-gateway.ts';
import { DrizzleDBClientService } from './core/db-client.ts';
import { buildBookClubLiveLayer } from './services/index.ts';

const BRAND_ART = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   📚  BOOK CLUB BOT  📚                                      ║
║                                                              ║
║   Polls • Meetings • Discussions • Q&A                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

/**
 * Log level configuration based on DEBUG environment variable.
 */
const LogLevelLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const debug = yield* Config.withDefault(Config.boolean('DEBUG'), false);
		const level = debug ? LogLevel.All : LogLevel.Info;
		return Logger.minimumLogLevel(level);
	})
);

/**
 * Combined bot dependencies layer.
 */
const BotDependenciesLive = Layer.mergeAll(
	DiscordGatewayLayer,
	LogLevelLive,
	RuntimeFlags.disableRuntimeMetrics,
	DrizzleDBClientService.Default
);

/**
 * Complete bot live layer with all services.
 */
const BookClubBotLive = buildBookClubLiveLayer(BotDependenciesLive);

// Print brand art on startup
console.log(BRAND_ART);

// Launch the bot
NodeRuntime.runMain(Layer.launch(BookClubBotLive));
