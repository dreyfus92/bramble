import { Data, Effect, Redacted } from 'effect';
import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsBase } from 'groq-sdk/resources/chat/completions.mjs';
import { groqApiKey } from '../static/env.ts';

/**
 * Groq chat message type.
 */
type GroqMessage = {
	role: 'system' | 'user' | 'assistant';
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
 * Groq AI operation error.
 */
export class GroqAiError extends Data.TaggedError('GroqAiError')<{
	readonly cause: unknown;
}> {}

const tryCatch = <T>(_try: () => Promise<T>) =>
	Effect.tryPromise({
		try: _try,
		catch: (error) => new GroqAiError({ cause: error }),
	});

/**
 * Groq AI helper service.
 * Provides chat completion capabilities for book club Q&A.
 */
export class GroqAiHelpers extends Effect.Service<GroqAiHelpers>()('app/GroqAiHelpers', {
	effect: Effect.gen(function* () {
		const groq = yield* getGroqInstance();

		/**
		 * Create a chat completion.
		 */
		const makeCompletion = (
			messages: GroqMessage[],
			options?: Pick<
				Partial<ChatCompletionCreateParamsBase>,
				'temperature' | 'max_completion_tokens' | 'model'
			>
		) =>
			tryCatch(() =>
				groq.chat.completions.create({
					messages,
					model: options?.model ?? 'llama-3.1-8b-instant',
					temperature: options?.temperature ?? 0.7,
					max_completion_tokens: options?.max_completion_tokens ?? 1024,
					top_p: 1,
					stream: false,
					stop: null,
				})
			);

		return { makeCompletion } as const;
	}),
}) {}

