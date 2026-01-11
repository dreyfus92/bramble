import { Data, Effect, Redacted } from "effect";
import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsBase } from "groq-sdk/resources/chat/completions.mjs";
import { groqApiKey } from "../static/env.ts";

/**
 * Groq chat message type.
 */
type GroqMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

/** Singleton Groq SDK instance. */
let groqInstance: Groq | undefined;

const getGroqInstance = () =>
	Effect.gen(function* () {
		const apiKey = yield* groqApiKey;
		if (!groqInstance) {
			groqInstance = new Groq({ apiKey: Redacted.value(apiKey) });
		}
		return groqInstance;
	});

/**
 * Structured error response format from Groq API.
 */
type GroqErrorResponse = {
	error?: string;
	details?: {
		title?: string;
		detail?: string;
		additionalInfo?: Record<string, unknown>;
	};
	isExpected?: boolean;
};

/**
 * Groq AI operation error with parsed error details.
 */
export class GroqAiError extends Data.TaggedError("GroqAiError")<{
	readonly cause: unknown;
	readonly message: string;
	readonly title?: string;
	readonly detail?: string;
	readonly isExpected?: boolean;
}> {}

/**
 * Parse error from various formats and extract meaningful information.
 */
const parseError = (error: unknown): GroqAiError => {
	// Handle structured error response format
	if (error && typeof error === "object") {
		// Check if it's the structured error format
		if ("error" in error || "details" in error) {
			const structuredError = error as GroqErrorResponse;
			const message =
				structuredError.details?.detail ||
				structuredError.details?.title ||
				structuredError.error ||
				"Unknown Groq API error";
			
			return new GroqAiError({
				cause: error,
				message,
				title: structuredError.details?.title,
				detail: structuredError.details?.detail,
				isExpected: structuredError.isExpected,
			});
		}

		// Handle Groq SDK APIError format
		if ("message" in error && typeof (error as { message: unknown }).message === "string") {
			const apiError = error as { message: string; status?: number; code?: string };
			return new GroqAiError({
				cause: error,
				message: apiError.message,
				detail: apiError.code ? `Error code: ${apiError.code}` : undefined,
			});
		}

		// Handle standard Error objects
		if (error instanceof Error) {
			return new GroqAiError({
				cause: error,
				message: error.message,
			});
		}
	}

	// Fallback for unknown error formats
	return new GroqAiError({
		cause: error,
		message: typeof error === "string" ? error : "Unknown error occurred",
	});
};

const tryCatch = <T>(_try: () => Promise<T>) =>
	Effect.tryPromise({
		try: _try,
		catch: parseError,
	});

/**
 * Get a user-friendly error message from a GroqAiError.
 * Useful for displaying errors to Discord users.
 */
export const getGroqErrorMessage = (error: GroqAiError): string => {
	// Handle specific error types with user-friendly messages
	if (error.title?.toLowerCase().includes("unable to reach")) {
		return "⚠️ **AI Service Temporarily Unavailable**\n\nI'm having trouble connecting to the AI service. This might be temporary - please try again in a moment.";
	}

	if (error.message.toLowerCase().includes("rate limit")) {
		return "⏱️ **Rate Limit Exceeded**\n\nToo many requests! Please wait a moment before trying again.";
	}

	if (error.message.toLowerCase().includes("authentication") || error.message.toLowerCase().includes("api key")) {
		return "🔐 **Authentication Error**\n\nThere's an issue with the API configuration. Please contact the bot administrator.";
	}

	if (error.message.toLowerCase().includes("timeout")) {
		return "⏰ **Request Timeout**\n\nThe AI service took too long to respond. Please try again.";
	}

	// Use the detail if available, otherwise fall back to message
	const displayMessage = error.detail || error.message || "An unexpected error occurred";
	
	return `❌ **AI Service Error**\n\n${displayMessage}\n\nPlease try again later.`;
};

/**
 * Groq AI helper service.
 * Provides chat completion capabilities for book club Q&A.
 */
export class GroqAiHelpers extends Effect.Service<GroqAiHelpers>()("app/GroqAiHelpers", {
	effect: Effect.gen(function* () {
		const groq = yield* getGroqInstance();

		/**
		 * Create a chat completion.
		 * Returns an Effect that either succeeds with the completion response or fails with GroqAiError.
		 */
		const makeCompletion = (
			messages: GroqMessage[],
			options?: Pick<
				Partial<ChatCompletionCreateParamsBase>,
				"temperature" | "max_completion_tokens" | "model"
			>,
		) =>
			tryCatch(() =>
				groq.chat.completions.create({
					messages,
					model: options?.model ?? "llama-3.1-8b-instant",
					temperature: options?.temperature ?? 0.7,
					max_completion_tokens: options?.max_completion_tokens ?? 1024,
					top_p: 1,
					stream: false,
					stop: null,
				}),
			);

		return { makeCompletion } as const;
	}),
}) {}
