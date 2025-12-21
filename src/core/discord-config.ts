import { DiscordConfig, Intents } from 'dfx';
import { Config } from 'effect';
import { discordBotToken } from '../static/env.ts';

/**
 * Discord bot configuration layer.
 *
 * Configures the bot token and gateway intents for book club functionality.
 * Intents enabled:
 * - GuildMessages: Access to guild message events
 * - MessageContent: Access to message content
 * - Guilds: Access to basic guild information
 * - GuildMembers: Access to member events (for user info)
 */
export const DiscordConfigLayer = DiscordConfig.layerConfig({
	token: discordBotToken,
	gateway: {
		intents: Config.succeed(
			Intents.fromList([
				'GuildMessages',
				'MessageContent',
				'Guilds',
				'GuildMembers',
			])
		),
	},
});

