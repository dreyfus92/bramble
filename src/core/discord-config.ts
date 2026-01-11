import { DiscordConfig } from "dfx";
import { discordBotToken } from "../static/env.ts";

/**
 * Discord bot configuration layer.
 *
 * Configures the bot token for REST API operations (command registration).
 * Gateway configuration removed for serverless webhook-based deployment.
 */
export const DiscordConfigLayer = DiscordConfig.layerConfig({
	token: discordBotToken,
});
