/**
 * Question commands - submitQuestion, listQuestions, and related handlers
 */
import { Discord, Ix } from "dfx";
import { eq, like } from "drizzle-orm";
import { Effect } from "effect";
import type { DrizzleDBClientService } from "../core/db-client.ts";
import * as schema from "../core/db-schema.ts";

type DbService = typeof DrizzleDBClientService.Service;

/**
 * Create question commands.
 */
export const createQuestionCommands = (db: DbService) => {
	// Helper: Save question to database
	const saveQuestion = (
		guildId: string,
		oderId: string,
		userTag: string,
		book: string,
		question: string,
	) =>
		db.execute((client) =>
			client.insert(schema.bookQuestions).values({
				guildId,
				oderId,
				userTag,
				book: book.trim().toLowerCase(),
				question: question.trim(),
				submittedAt: new Date().toISOString(),
			}),
		);

	// Helper: Create response with "Add Another" / "Done" buttons
	const createSubmitResponse = (book: string, question: string, username: string) => {
		const encodedBook = encodeURIComponent(book.trim());
		return {
			type: 4 as const,
			data: {
				content: `✅ **Question submitted!**\n\n📚 **Book:** ${book}\n❓ **Question:** ${question}\n👤 **By:** ${username}\n\n_Want to add another question for this book?_`,
				components: [
					{
						type: 1 as const, // Action Row
						components: [
							{
								type: 2 as const, // Button
								style: 1 as const, // Primary (blue)
								label: "➕ Add Another",
								custom_id: `add_another_q:${encodedBook}`,
							},
							{
								type: 2 as const, // Button
								style: 2 as const, // Secondary (gray)
								label: "✅ Done",
								custom_id: "done_adding_q",
							},
						],
					},
				],
			},
		};
	};

	// /submitquestion command
	const submitQuestion = Ix.global(
		{
			name: "submitquestion",
			description: "Submit a question for the book club meetup discussion",
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: "book",
					description: "The book title this question is about",
					required: true,
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: "question",
					description: "Your question for the meetup discussion",
					required: true,
				},
			],
		},
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !("options" in data) || !data.options) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction data" },
						};
					}

					const options = data.options as Array<{ name: string; value: string }>;
					const book = options.find((opt) => opt.name === "book")?.value;
					const question = options.find((opt) => opt.name === "question")?.value;

					if (!book || !question) {
						return {
							type: 4 as const,
							data: { content: "❌ Please provide both book and question." },
						};
					}

					const user = interaction.member?.user || interaction.user;
					if (!user) {
						return {
							type: 4 as const,
							data: { content: "❌ Could not identify user." },
						};
					}

					const guildId = interaction.guild_id || "DM";

					// Save to database
					yield* saveQuestion(guildId, user.id, user.username, book, question);

					return createSubmitResponse(book, question, user.username);
				}),
			),
		),
	);

	// Button handler: "Add Another" - Opens modal
	const addAnotherButton = Ix.messageComponent(
		Ix.idStartsWith("add_another_q:"),
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.sync(() => {
					const data = interaction.data;
					if (!data || !("custom_id" in data)) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction", flags: 64 },
						};
					}

					// Extract book name from custom_id
					const customId = data.custom_id;
					const encodedBook = customId.replace("add_another_q:", "");

					// Return modal response
					return {
						type: 9 as const, // MODAL
						data: {
							custom_id: `submit_q_modal:${encodedBook}`,
							title: "Add Another Question",
							components: [
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 4 as const, // Text Input
											custom_id: "question_input",
											label: "Your Question",
											style: 2 as const, // Paragraph (multi-line)
											placeholder: "Enter your question for the book discussion...",
											required: true,
											min_length: 5,
											max_length: 500,
										},
									],
								},
							],
						},
					};
				}),
			),
		),
	);

	// Modal submit handler
	const questionModal = Ix.modalSubmit(
		Ix.idStartsWith("submit_q_modal:"),
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !("custom_id" in data) || !("components" in data)) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid modal data", flags: 64 },
						};
					}

					// Extract book name from custom_id
					const customId = data.custom_id;
					const encodedBook = customId.replace("submit_q_modal:", "");
					const book = decodeURIComponent(encodedBook);

					// Extract question from modal components
					const components = data.components as Array<{
						type: number;
						components: Array<{ custom_id: string; value: string }>;
					}>;
					const questionInput = components
						.flatMap((row) => row.components)
						.find((c) => c.custom_id === "question_input");

					const question = questionInput?.value;
					if (!question) {
						return {
							type: 4 as const,
							data: { content: "❌ No question provided", flags: 64 },
						};
					}

					const user = interaction.member?.user || interaction.user;
					if (!user) {
						return {
							type: 4 as const,
							data: { content: "❌ Could not identify user.", flags: 64 },
						};
					}

					const guildId = interaction.guild_id || "DM";

					// Save to database
					yield* saveQuestion(guildId, user.id, user.username, book, question);

					return createSubmitResponse(book, question, user.username);
				}),
			),
		),
	);

	// Button handler: "Done"
	const doneButton = Ix.messageComponent(
		Ix.id("done_adding_q"),
		Effect.succeed({
			type: 4 as const,
			data: {
				content: "✅ **All questions submitted!** Thanks for contributing to the discussion. 📚",
				flags: 64, // Ephemeral
			},
		}),
	);

	// /listquestions command
	const listQuestions = Ix.global(
		{
			name: "listquestions",
			description: "List all submitted questions for a book",
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: "book",
					description: "The book title to list questions for",
					required: true,
				},
			],
		},
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !("options" in data) || !data.options) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction data" },
						};
					}

					const options = data.options as Array<{ name: string; value: string }>;
					const book = options.find((opt) => opt.name === "book")?.value;

					if (!book) {
						return {
							type: 4 as const,
							data: { content: "❌ Please provide a book title." },
						};
					}

					const guildId = interaction.guild_id || "DM";

					// Get questions from database
					const questions = yield* db.execute((client) =>
						client
							.select()
							.from(schema.bookQuestions)
							.where(eq(schema.bookQuestions.book, book.trim().toLowerCase())),
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
						.join("\n\n");

					// Encode book name in button custom_id for the plain text handler
					const encodedBook = encodeURIComponent(book.trim());

					return {
						type: 4 as const,
						data: {
							content: `📚 **Questions for "${book}"** (${guildQuestions.length} total)\n\n${questionList}`,
							components: [
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 2 as const, // Button
											style: 2 as const, // Secondary (gray)
											label: "📋 Plain Text (Copy)",
											custom_id: `plaintext_questions:${encodedBook}`,
										},
									],
								},
							],
						},
					};
				}),
			),
		),
	);

	// Button handler for "Plain Text" copy
	const plainTextButton = Ix.messageComponent(
		Ix.idStartsWith("plaintext_questions:"),
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					if (!data || !("custom_id" in data)) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction", flags: 64 },
						};
					}

					// Extract book name from custom_id
					const customId = data.custom_id;
					const encodedBook = customId.replace("plaintext_questions:", "");
					const book = decodeURIComponent(encodedBook);

					const guildId = interaction.guild_id || "DM";

					// Get questions from database
					const questions = yield* db.execute((client) =>
						client
							.select()
							.from(schema.bookQuestions)
							.where(like(schema.bookQuestions.book, `%${book}%`)),
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
						.join("\n");

					const plainText = `Questions for "${book}":\n\n${plainList}`;

					return {
						type: 4 as const,
						data: {
							content: `**📋 Plain text (easy to copy):**\n\`\`\`\n${plainText}\n\`\`\``,
							flags: 64, // Ephemeral - only visible to the user who clicked
						},
					};
				}),
			),
		),
	);

	return {
		submitQuestion,
		addAnotherButton,
		questionModal,
		doneButton,
		listQuestions,
		plainTextButton,
	};
};
