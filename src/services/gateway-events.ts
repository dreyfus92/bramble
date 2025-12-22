import { Ix } from 'dfx';
import { InteractionsRegistry } from 'dfx/gateway';
import { Effect, Layer } from 'effect';
import { DrizzleDBClientService } from '../core/db-client.ts';
import * as schema from '../core/db-schema.ts';
import { like } from 'drizzle-orm';

/**
 * Gateway events service.
 * Handles Discord gateway events and interaction registration.
 */
const make = Effect.gen(function* () {
	const registry = yield* InteractionsRegistry;
	const db = yield* DrizzleDBClientService;

	// /ping command
	const ping = Ix.global(
		{
			name: 'ping',
			description: 'Check if the bot is alive',
		},
		Effect.succeed({
			type: 4 as const,
			data: { content: 'Pong! 🏓 Book Club Bot is running.' },
		})
	);

	// /submitquestion command
	const submitQuestion = Ix.global(
		{
			name: 'submitquestion',
			description: 'Submit a question for the book club meetup discussion',
			options: [
				{
					type: 3, // STRING
					name: 'book',
					description: 'The book title this question is about',
					required: true,
				},
				{
					type: 3, // STRING
					name: 'question',
					description: 'Your question for the meetup discussion',
					required: true,
				},
			],
		},
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !('options' in data) || !data.options) {
						return {
							type: 4 as const,
							data: { content: '❌ Invalid interaction data' },
						};
					}

					const options = data.options as Array<{ name: string; value: string }>;
					const book = options.find((opt) => opt.name === 'book')?.value;
					const question = options.find((opt) => opt.name === 'question')?.value;

					if (!book || !question) {
						return {
							type: 4 as const,
							data: { content: '❌ Please provide both book and question.' },
						};
					}

					const user = interaction.member?.user || interaction.user;
					if (!user) {
						return {
							type: 4 as const,
							data: { content: '❌ Could not identify user.' },
						};
					}

					const guildId = interaction.guild_id || 'DM';

					// Save to database
					yield* db.execute((client) =>
						client.insert(schema.bookQuestions).values({
							guildId,
							oderId: user.id,
							userTag: user.username,
							book: book.trim(),
							question: question.trim(),
							submittedAt: new Date().toISOString(),
						})
					);

					return {
						type: 4 as const,
						data: {
							content: `✅ **Question submitted!**\n\n📚 **Book:** ${book}\n❓ **Question:** ${question}\n👤 **By:** ${user.username}`,
						},
					};
				})
			)
		)
	);

	// /listquestions command
	const listQuestions = Ix.global(
		{
			name: 'listquestions',
			description: 'List all submitted questions for a book',
			options: [
				{
					type: 3, // STRING
					name: 'book',
					description: 'The book title to list questions for',
					required: true,
				},
			],
		},
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !('options' in data) || !data.options) {
						return {
							type: 4 as const,
							data: { content: '❌ Invalid interaction data' },
						};
					}

					const options = data.options as Array<{ name: string; value: string }>;
					const book = options.find((opt) => opt.name === 'book')?.value;

					if (!book) {
						return {
							type: 4 as const,
							data: { content: '❌ Please provide a book title.' },
						};
					}

					const guildId = interaction.guild_id || 'DM';

					// Get questions from database
					const questions = yield* db.execute((client) =>
						client
							.select()
							.from(schema.bookQuestions)
							.where(like(schema.bookQuestions.book, `%${book.trim()}%`))
					);

					// Filter by guild
					const guildQuestions = questions.filter((q) => q.guildId === guildId);

					if (guildQuestions.length === 0) {
						return {
							type: 4 as const,
							data: { content: `📚 No questions found for "${book}".` },
						};
					}

					// Formatted list for display
					const questionList = guildQuestions
						.map((q, i) => `**${i + 1}.** ${q.question}\n   _— ${q.userTag}_`)
						.join('\n\n');

					// Encode book name in button custom_id for the plain text handler
					const encodedBook = encodeURIComponent(book.trim());

					return {
						type: 4 as const,
						data: {
							content: `📚 **Questions for "${book}"** (${guildQuestions.length} total)\n\n${questionList}`,
							components: [
								{
									type: 1, // Action Row
									components: [
										{
											type: 2, // Button
											style: 2, // Secondary (gray)
											label: '📋 Plain Text (Copy)',
											custom_id: `plaintext_questions:${encodedBook}`,
										},
									],
								},
							],
						},
					};
				})
			)
		)
	);

	// Button handler for "Plain Text" copy
	const plainTextButton = Ix.messageComponent(
		Ix.idStartsWith('plaintext_questions:'),
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !('custom_id' in data)) {
						return {
							type: 4 as const,
							data: { content: '❌ Invalid interaction', flags: 64 },
						};
					}

					// Extract book name from custom_id
					const customId = data.custom_id;
					const encodedBook = customId.replace('plaintext_questions:', '');
					const book = decodeURIComponent(encodedBook);

					const guildId = interaction.guild_id || 'DM';

					// Get questions from database
					const questions = yield* db.execute((client) =>
						client
							.select()
							.from(schema.bookQuestions)
							.where(like(schema.bookQuestions.book, `%${book}%`))
					);

					// Filter by guild
					const guildQuestions = questions.filter((q) => q.guildId === guildId);

					if (guildQuestions.length === 0) {
						return {
							type: 4 as const,
							data: {
								content: `No questions found for "${book}".`,
								flags: 64, // Ephemeral
							},
						};
					}

					// Plain text format for easy copy-paste
					const plainList = guildQuestions
						.map((q, i) => `${i + 1}. ${q.question} (${q.userTag})`)
						.join('\n');

					const plainText = `Questions for "${book}":\n\n${plainList}`;

					return {
						type: 4 as const,
						data: {
							content: `**📋 Plain text (easy to copy):**\n\`\`\`\n${plainText}\n\`\`\``,
							flags: 64, // Ephemeral - only visible to the user who clicked
						},
					};
				})
			)
		)
	);

	// Build and register all commands
	const interactions = Ix.builder
		.add(ping)
		.add(submitQuestion)
		.add(listQuestions)
		.add(plainTextButton)
		.catchAllCause(Effect.logError);

	yield* registry.register(interactions);

	// TODO: Add more slash commands:
	// - /poll create [question] [options...]
	// - /poll end [poll_id]
	// - /meeting schedule [date] [time]
	// - /meeting list
	// - /ask [question] (Groq LLM)
	// - /export [type] (Google Sheets)
	//
	// DONE:
	// ✅ /ping
	// ✅ /submitquestion [book] [question]
	// ✅ /listquestions [book] (with Plain Text button)

	yield* Effect.log('Gateway events service initialized');
});

/**
 * Live gateway events layer.
 */
export const GatewayEventsLive = Layer.effectDiscard(make);
