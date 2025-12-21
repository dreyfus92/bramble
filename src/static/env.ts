import { Config } from 'effect';

// Node Environment Configuration
export const nodeEnv = Config.withDefault(Config.string('NODE_ENV'), 'development');

// Discord configuration
export const discordBotToken = Config.redacted('DISCORD_BOT_TOKEN');

// Database configuration (Turso)
export const databaseUrl = Config.redacted('TURSO_DATABASE_URL');
export const databaseAuthToken = Config.redacted('TURSO_AUTH_TOKEN');

// Groq configuration
export const groqApiKey = Config.redacted('GROQ_API_KEY');

// HTTP configuration
export const httpHost = Config.withDefault(Config.string('HTTP_HOST'), '0.0.0.0');
export const httpPort = Config.withDefault(Config.number('HTTP_PORT'), 3000);

// Rate limiting configuration
export const llmRateLimitRequests = Config.withDefault(
	Config.number('LLM_RATE_LIMIT_REQUESTS'),
	10
);
export const llmRateLimitWindowMinutes = Config.withDefault(
	Config.number('LLM_RATE_LIMIT_WINDOW_MINUTES'),
	60
);

