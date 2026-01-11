/**
 * Vercel serverless function for Discord interaction webhooks.
 * Handles all Discord slash commands and interactions.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Effect } from "effect";
import { processWebhook } from "../src/core/discord-webhook.ts";

/**
 * Main handler for Discord webhook interactions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
	// Log that the handler was called
	console.log("[INTERACTIONS] Handler called", {
		method: req.method,
		url: req.url,
		headers: Object.keys(req.headers || {}),
		timestamp: new Date().toISOString(),
	});

	// Only accept POST requests
	if (req.method !== "POST") {
		console.log("[INTERACTIONS] Method not allowed:", req.method);
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		console.log("[INTERACTIONS] Processing webhook request...");
		// Get the body string for signature verification
		// Vercel automatically parses JSON bodies, so we stringify it back
		// This is necessary because Discord signature verification needs the raw body string
		const bodyString = typeof req.body === "string" 
			? req.body 
			: JSON.stringify(req.body || {});

		console.log("[INTERACTIONS] Body prepared, processing with Effect...");

		// Process the webhook request using Effect runtime
		const response = await Effect.runPromise(
			processWebhook({
				headers: req.headers as Record<string, string | string[] | undefined>,
				body: bodyString,
			}),
		);

		console.log("[INTERACTIONS] Response generated successfully");
		
		// Return interaction response
		return res.status(200).json(response);
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
		if (
			errorMessage.includes("signature") ||
			errorMessage.includes("verification") ||
			errorMessage.includes("Invalid request signature")
		) {
			console.error("Webhook verification failed:", error);
			return res.status(401).json({ error: "Invalid signature" });
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
			return res.status(500).json({ 
				error: "Configuration error - check environment variables" 
			});
		}

		// Generic error response - always return something to Discord
		return res.status(500).json({ 
			error: "Internal server error",
			message: process.env.NODE_ENV === "development" ? errorMessage : undefined
		});
	}
}
