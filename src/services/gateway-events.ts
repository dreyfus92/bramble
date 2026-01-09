import { Discord, Ix } from "dfx";
import { InteractionsRegistry } from "dfx/gateway";
import { eq, like } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { DrizzleDBClientService } from "../core/db-client.ts";
import * as schema from "../core/db-schema.ts";

/**
 * Gateway events service.
 * Handles Discord gateway events and interaction registration.
 */

const make = Effect.gen(function* () {
	const registry = yield* InteractionsRegistry;
	const db = yield* DrizzleDBClientService;

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
		console.log("[DEBUG] createSubmitResponse called with book:", book, "question:", question);
		const encodedBook = encodeURIComponent(book.trim());
		console.log("[DEBUG] Creating button with custom_id: add_another_q:" + encodedBook);
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

	// /ping command
	const ping = Ix.global(
		{
			name: "ping",
			description: "Check if the bot is alive",
		},
		Effect.succeed({
			type: 4 as const,
			data: { content: "Pong! 🏓 Book Club Bot is running." },
		}),
	);

	// /submitquestion command
	const submitQuestion = Ix.global(
		{
			name: "submitquestion",
			description: "Submit a question for the book club meetup discussion",
			options: [
				{
					type: 3, // STRING
					name: "book",
					description: "The book title this question is about",
					required: true,
				},
				{
					type: 3, // STRING
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
					console.log(data);
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
					console.log("[DEBUG] Button custom_id:", customId);
					const encodedBook = customId.replace("add_another_q:", "");
					console.log("[DEBUG] Encoded book from button:", encodedBook);

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

	const bookOptions = Ix.messageComponent(
		Ix.idStartsWith("book-select"),
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					// based on unique Key

					if (!data || !("custom_id" in data) || !("values" in data)) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction", flags: 64 },
						};
					}

					const bookKey = Number(data.values[0]);
					console.log(bookKey);
					const Bookchoice = yield* db.execute((client) =>
						client
							.select({
								title: schema.bookSelection.bookTitle,
								id: schema.bookSelection.id,
								meetingdate: schema.bookSelection.meetingDate,
							})
							.from(schema.bookSelection)
							.where(eq(schema.bookSelection.id, bookKey)),
					);
					console.log(Bookchoice[0]);

					// Return modal response
					return {
						type: 9 as const, // MODAL
						data: {
							custom_id: `submit`,
							title: "Modify book attributes",
							components: [
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 4 as const, // Text Input
											custom_id: "book_name",
											label: "Rename",
											style: 1 as const, // Paragraph (multi-line)
											placeholder: Bookchoice[0]["title"],
											required: false,
											min_length: 0,
											max_length: 100,
										},
									],
								},
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 4 as const, // Text Input
											custom_id: "book_link",
											label: "Link",
											style: 1 as const, // Paragraph (multi-line)
											placeholder: "",
											required: false,
											min_length: 0,
											max_length: 20,
										},
									],
								},
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 4 as const, // Text Input
											custom_id: "meeting_date",
											label: "meeting date",
											style: 1 as const, // Paragraph (multi-line)
											placeholder: Bookchoice[0]["meetingdate"],
											required: true,
											min_length: 0,
											max_length: 200,
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

	// create Book

	const getbook = Ix.global(
		{
			name: "getbook",
			description: "Create a new book entry",
		},
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const choices = yield* db.execute((client) =>
						client
							.select({
								label: schema.bookSelection.bookTitle,
								value: schema.bookSelection.id,
							})
							.from(schema.bookSelection),
					);

					return {
						type: 4,
						data: {
							content: "",
							components: [
								{
									type: 1, // ACTION_ROW
									components: [
										{
											type: 3, // STRING_SELECT
											custom_id: "book-select",
											options: choices.map((choice) => ({
												label: choice.label,
												value: String(choice.value),
											})),
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

	const createbook = Ix.global(
		{
			name: "createbook",
			description: "Create a new book entry",
			options: [
				{
					type: 3, // STRING
					name: "title",
					description: "The book title",
					required: true,
				},
			],
		},
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;
					console.log(data);
					if (!data || !("options" in data) || !data.options) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction data" },
						};
					}

					const options = data.options as Array<{ name: string; value: string }>;
					const book = options.find((opt) => opt.name === "title")?.value;
					if (!book)
						return {
							type: 4 as const,
							data: { content: "failed to register book" },
						};

					const date = new Date();
					const defaultoffset = date.getTime() + 1814400000;
					const defaultoffsettimestamp = new Date(defaultoffset).toISOString();
					const timestamp = date.toISOString();

					yield* db.execute((client) =>
						client.insert(schema.bookSelection).values({
							bookTitle: book,
							submittedAt: timestamp,
							meetingDate: defaultoffsettimestamp,
						}),
					);
					return {
						type: 4 as const,
						data: { content: " book submitted" },
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
					console.log("[DEBUG] Modal custom_id:", customId);
					const encodedBook = customId.replace("submit_q_modal:", "");
					console.log("[DEBUG] Encoded book:", encodedBook);
					const book = decodeURIComponent(encodedBook);
					console.log("[DEBUG] Decoded book:", book);

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
					type: Discord.ApplicationCommandOptionType.STRING, // STRING
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

	// Types for Open Library API
	type OpenLibrarySearchResult = {
		numFound: number;
		docs: Array<{
			title: string;
			author_name?: string[];
			first_publish_year?: number;
			subject?: string[];
			cover_i?: number;
			ratings_average?: number;
			ratings_count?: number;
			key?: string;
		}>;
	};

	type OpenLibraryWork = {
		description?: string | { value: string };
	};

	// Helper to fetch from Open Library
	const fetchOpenLibrary = <T>(url: string) =>
		Effect.tryPromise({
			try: async () => {
				const res = await fetch(url);
				return res.json() as Promise<T>;
			},
			catch: () => new Error("Failed to fetch from Open Library"),
		});

	// /quickcheck command - Search Open Library for book info
	const quickCheck = Ix.global(
		{
			name: "quickcheck",
			description: "Quick lookup of a book's description and rating from Open Library",
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: "book",
					description: "The book title to search for",
					required: true,
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: "author",
					description: "Author name (optional, helps narrow results)",
					required: false,
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
					const bookTitle = options.find((opt) => opt.name === "book")?.value;
					const author = options.find((opt) => opt.name === "author")?.value;

					if (!bookTitle) {
						return {
							type: 4 as const,
							data: { content: "❌ Please provide a book title." },
						};
					}

					// Build Open Library search URL
					let searchUrl = `https://openlibrary.org/search.json?limit=1`;
					if (author) {
						searchUrl += `&title=${encodeURIComponent(bookTitle)}&author=${encodeURIComponent(author)}`;
					} else {
						searchUrl += `&q=${encodeURIComponent(bookTitle)}`;
					}

					// Search for the book
					const searchResult = yield* fetchOpenLibrary<OpenLibrarySearchResult>(searchUrl).pipe(
						Effect.catchAll(() => Effect.succeed({ numFound: 0, docs: [] })),
					);

					if (searchResult.numFound === 0 || !searchResult.docs[0]) {
						return {
							type: 4 as const,
							data: {
								content: `📚 No results found for "${bookTitle}"${author ? ` by ${author}` : ""}.`,
							},
						};
					}

					const book = searchResult.docs[0];

					// Try to get description from works API
					let description = "_No description available_";
					if (book.key) {
						const workResult = yield* fetchOpenLibrary<OpenLibraryWork>(
							`https://openlibrary.org${book.key}.json`,
						).pipe(Effect.catchAll(() => Effect.succeed({} as OpenLibraryWork)));

						if (workResult.description) {
							const rawDesc =
								typeof workResult.description === "string"
									? workResult.description
									: workResult.description.value;
							// Truncate to 500 chars
							description = rawDesc.length > 500 ? rawDesc.substring(0, 497) + "..." : rawDesc;
						}
					}

					// Build rating display
					let ratingDisplay = "_No ratings yet_";
					if (book.ratings_average) {
						const stars = "⭐".repeat(Math.round(book.ratings_average));
						ratingDisplay = `${stars} **${book.ratings_average.toFixed(1)}/5**`;
						if (book.ratings_count) {
							ratingDisplay += ` (${book.ratings_count.toLocaleString()} ratings)`;
						}
					}

					// Build subjects/genres (first 3)
					const genres = book.subject?.slice(0, 3).join(", ") || "_Unknown_";

					// Cover image URL
					const coverUrl = book.cover_i
						? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
						: null;

					// Build embed response
					const embed = {
						title: `📖 ${book.title}`,
						url: book.key ? `https://openlibrary.org${book.key}` : undefined,
						color: 0x3498db, // Blue
						thumbnail: coverUrl ? { url: coverUrl } : undefined,
						fields: [
							{
								name: "✍️ Author",
								value: book.author_name?.join(", ") || "_Unknown_",
								inline: true,
							},
							{
								name: "📅 First Published",
								value: book.first_publish_year?.toString() || "_Unknown_",
								inline: true,
							},
							{
								name: "⭐ Rating",
								value: ratingDisplay,
								inline: true,
							},
							{
								name: "🏷️ Genres",
								value: genres,
								inline: false,
							},
							{
								name: "📝 Description",
								value: description,
								inline: false,
							},
						],
						footer: {
							text: "Data from Open Library",
						},
					};

					return {
						type: 4 as const,
						data: {
							embeds: [embed],
						},
					};
				}),
			),
		),
	);

	// /help command - List all available commands
	const help = Ix.global(
		{
			name: "help",
			description: "List all available Bramble bot commands",
		},
		Effect.succeed({
			type: 4 as const,
			data: {
				embeds: [
					{
						title: "📚 Bramble Book Club Bot",
						description: "Your friendly book club assistant! Here are all available commands:",
						color: 0x2ecc71, // Green
						fields: [
							{
								name: "📖 Book Commands",
								value: [
									"`/quickcheck [book] [author?]` — Look up a book's description & rating",
									"`/createbook [title]` — Add a new book to the club list",
									"`/getbook` — Browse and manage existing books",
								].join("\n"),
								inline: false,
							},
							{
								name: "❓ Question Commands",
								value: [
									"`/submitquestion [book] [question]` — Submit a discussion question",
									"`/listquestions [book]` — View all questions for a book",
								].join("\n"),
								inline: false,
							},
							{
								name: "🔧 Utility Commands",
								value: [
									"`/ping` — Check if the bot is online",
									"`/help` — Show this help message",
								].join("\n"),
								inline: false,
							},
							{
								name: "🚧 Coming Soon",
								value: [
									"`/poll` — Create and manage polls",
									"`/meeting` — Schedule book club meetings",
									"`/ask` — Ask the AI about a book",
									"`/export` — Export data to Google Sheets",
								].join("\n"),
								inline: false,
							},
						],
						footer: {
							text: "Bramble • Happy reading! 🌿",
						},
					},
				],
			},
		}),
	);

	// Build and register all commands
	const interactions = Ix.builder
		.add(ping)
		.add(submitQuestion)
		.add(addAnotherButton)
		.add(questionModal)
		.add(doneButton)
		.add(listQuestions)
		.add(createbook)
		.add(plainTextButton)
		.add(getbook)
		.add(bookOptions)
		.add(quickCheck)
		.add(help)
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
	// ✅ /submitquestion [book] [question] (with Add Another flow)
	// ✅ /listquestions [book] (with Plain Text button)
	// ✅ /quickcheck [book] [author?] (Open Library lookup)
	// ✅ /createbook [title] (Emeka)
	// ✅ /getbook (Emeka - select dropdown)
	// ✅ /help (list all commands)

	yield* Effect.log("Gateway events service initialized");
});

/**
 * Live gateway events layer.
 */
export const GatewayEventsLive = Layer.effectDiscard(make);
