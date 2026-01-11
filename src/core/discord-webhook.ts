/**
 * Discord webhook handler for serverless deployment.
 * Handles Discord interaction webhooks using dfx.
 */

import { makeSimpleHandler, webhookLayerConfig } from "dfx/webhooks";
import { Config, Effect } from "effect";
import { buildInteractions } from "../services/interactions.ts";
import { discordApplicationId, discordPublicKey } from "../static/env.ts";
import { DrizzleDBClientService } from "./db-client.ts";

/**
 * Type for webhook request input.
 */
export interface WebhookRequest {
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

/**
 * Get crypto implementation for Node.js/Edge runtime environment.
 * Works in both Node.js (18+) and Edge Functions (Web Crypto API).
 */
const getCrypto = () => {
	// Web Crypto API is available in both Node.js 18+ and Edge Functions
	if (globalThis.crypto?.subtle) {
		return globalThis.crypto.subtle;
	}
	// Fallback for older Node.js (shouldn't be needed for Node.js 18+ or Edge Functions)
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { webcrypto } = require("node:crypto");
	return webcrypto.subtle;
};

/**
 * Builds and executes the webhook handler for a given request.
 *
 * This function handles the entire webhook processing flow:
 * 1. Builds the interaction handlers
 * 2. Configures webhook verification
 * 3. Processes the incoming request
 * 4. Returns the interaction response
 */
export const processWebhook = (request: WebhookRequest) =>
	Effect.gen(function* () {
		const publicKey = yield* discordPublicKey;
		const appId = yield* discordApplicationId;
		const interactions = yield* buildInteractions;

		// Get crypto implementation for Node.js
		const cryptoImpl = getCrypto();

		// Configure webhook with public key and application ID
		const webhookConfig = webhookLayerConfig(
			Config.succeed({
				applicationId: appId,
				publicKey: publicKey,
				crypto: cryptoImpl,
				algorithm: "NewNode" as const,
			}),
		);

		// Create the webhook handler from interactions
		const handler = makeSimpleHandler(interactions);

		// Process the request and return response
		return yield* handler({
			headers: request.headers as Record<string, string>,
			body: request.body,
		}).pipe(Effect.provide(webhookConfig));
	}).pipe(Effect.provide(DrizzleDBClientService.Default));
