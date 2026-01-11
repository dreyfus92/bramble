/**
 * Vercel Edge Function for Discord interaction webhooks.
 * Handles all Discord slash commands and interactions.
 * Uses Edge Functions to access raw body for signature verification.
 */
import { Effect } from "effect";
import { processWebhook } from "../src/core/discord-webhook.ts";

export const config = {
	runtime: "edge",
};

/**
 * Convert Headers object to a plain record
 */
function headersToRecord(headers: Headers): Record<string, string> {
	const record: Record<string, string> = {};
	headers.forEach((value, key) => {
		record[key] = value;
	});
	return record;
}

/**
 * Main handler for Discord webhook interactions (Edge Function).
 */
export default async function handler(request: Request): Promise<Response> {
	// Log that the handler was called
	console.log("[INTERACTIONS] Handler called", {
		method: request.method,
		url: request.url,
		headers: Array.from(request.headers.keys()),
		timestamp: new Date().toISOString(),
	});

	// Only accept POST requests
	if (request.method !== "POST") {
		console.log("[INTERACTIONS] Method not allowed:", request.method);
		return new Response(
			JSON.stringify({ error: "Method not allowed" }),
			{
				status: 405,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		console.log("[INTERACTIONS] Processing webhook request...");
		
		// Get the raw body string for signature verification
		// Edge Functions allow us to access the raw body, which is required for Discord signature verification
		const bodyString = await request.text();

		console.log("[INTERACTIONS] Body prepared, processing with Effect...");

		// Convert headers to plain record for compatibility
		const headers = headersToRecord(request.headers);

		// Process the webhook request using Effect runtime
		const response = await Effect.runPromise(
			processWebhook({
				headers,
				body: bodyString,
			}),
		);

		console.log("[INTERACTIONS] Response generated successfully");
		
		// Return interaction response
		return new Response(JSON.stringify(response), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error: unknown) {
		// Log the full error for debugging
		console.error("Error processing webhook:", error);
		
		// Handle specific error types
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		
		// Log stack trace if available
		if (errorStack) {
			console.error("Error stack:", errorStack);
		}

		// Stringify error for logging
		console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));

		// Check for signature verification errors
		const isSignatureError =
			errorMessage.includes("signature") ||
			errorMessage.includes("verification") ||
			errorMessage.includes("Invalid request signature") ||
			errorMessage.includes("BadWebhookSignature") ||
			(error &&
				typeof error === "object" &&
				"_tag" in error &&
				(error as { _tag: string })._tag === "BadWebhookSignature");

		if (isSignatureError) {
			console.error("Webhook verification failed:", error);
			return new Response(JSON.stringify({ error: "Invalid signature" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Check for configuration errors (missing env vars)
		if (
			errorMessage.includes("ConfigError") ||
			errorMessage.includes("Environment") ||
			errorMessage.includes("missing") ||
			errorMessage.includes("DISCORD") ||
			errorMessage.includes("TURSO")
		) {
			console.error("Configuration error:", error);
			return new Response(
				JSON.stringify({ error: "Configuration error - check environment variables" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Generic error response - always return something to Discord
		const responseBody: { error: string; message?: string } = {
			error: "Internal server error",
		};
		
		// Only include message in development
		if (process.env.NODE_ENV === "development") {
			responseBody.message = errorMessage;
		}

		return new Response(JSON.stringify(responseBody), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
