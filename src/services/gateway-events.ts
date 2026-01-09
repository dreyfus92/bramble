import { Discord, Ix } from "dfx";
import { InteractionsRegistry } from "dfx/gateway";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { DrizzleDBClientService } from "../core/db-client.ts";
import * as schema from "../core/db-schema.ts";

// Helper: Get current month in YYYY-MM format
const getCurrentMonth = () => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
};

// Helper: Format month for display (e.g., "2026-01" -> "January 2026")
const formatMonthDisplay = (month: string) => {
	const [year, monthNum] = month.split("-");
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const monthName = monthNames[parseInt(monthNum, 10) - 1] || monthNum;
	return `${monthName} ${year}`;
};

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
		Effect.flatMap((_interaction) =>
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

// ============================================================================
// Book Selection Poll System
// ============================================================================

// Helper: Save nomination to database
const saveNomination = (guildId: string, bookTitle: string, nominatedBy: string, month: string) =>
	db.execute((client) =>
		client.insert(schema.bookNominations).values({
			guildId,
			bookTitle: bookTitle.trim(),
			nominatedBy,
			nominatedAt: new Date().toISOString(),
			month,
		}),
	);

// /nominatebook command
const nominateBook = Ix.global(
	{
		name: "nominatebook",
		description: "Nominate a book for the monthly book club selection",
		options: [
			{
				type: Discord.ApplicationCommandOptionType.STRING,
				name: "title",
				description: "The book title (e.g., Dune)",
				required: true,
			},
			{
				type: Discord.ApplicationCommandOptionType.STRING,
				name: "author",
				description: "The book author (e.g., Frank Herbert)",
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
						data: { content: "❌ Invalid interaction data", flags: 64 },
					};
				}

				const options = data.options as Array<{ name: string; value: string }>;
				const title = options.find((opt) => opt.name === "title")?.value;
				const author = options.find((opt) => opt.name === "author")?.value;

				if (!title || !author) {
					return {
						type: 4 as const,
						data: { content: "❌ Please provide both a book title and author.", flags: 64 },
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
				const month = getCurrentMonth();

				// Format as "Title by Author"
				const bookEntry = `${title.trim()} by ${author.trim()}`;

				yield* saveNomination(guildId, bookEntry, user.id, month);

				return {
					type: 4 as const,
					data: {
						content: `✅ **Book nominated!**\n\n📚 **${bookEntry}**\n📅 **For:** ${formatMonthDisplay(month)}\n👤 **Nominated by:** <@${user.id}>`,
					},
				};
			}),
		),
	),
);

// /listnominations command
const listNominations = Ix.global(
	{
		name: "listnominations",
		description: "View all book nominations for a month",
		options: [
			{
				type: Discord.ApplicationCommandOptionType.STRING,
				name: "month",
				description: "Month to view (YYYY-MM format, e.g., 2026-01). Defaults to current month.",
				required: false,
			},
		],
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const data = interaction.data;
				const options = (data && "options" in data ? data.options : []) as Array<{
					name: string;
					value: string;
				}>;
				const monthParam = options.find((opt) => opt.name === "month")?.value;
				const month = monthParam || getCurrentMonth();
				const guildId = interaction.guild_id || "DM";

				const nominations = yield* db.execute((client) =>
					client
						.select({
							bookTitle: schema.bookNominations.bookTitle,
							nominatedBy: schema.bookNominations.nominatedBy,
							nominatedAt: schema.bookNominations.nominatedAt,
						})
						.from(schema.bookNominations)
						.where(
							and(
								eq(schema.bookNominations.guildId, guildId),
								eq(schema.bookNominations.month, month),
							),
						)
						.orderBy(schema.bookNominations.nominatedAt),
				);

				if (nominations.length === 0) {
					return {
						type: 4 as const,
						data: {
							content: `📭 No book nominations for **${formatMonthDisplay(month)}** yet.\n\nUse \`/nominatebook [title]\` to nominate a book!`,
						},
					};
				}

				const nominationList = nominations
					.map((n, i) => `${i + 1}. **${n.bookTitle}** — <@${n.nominatedBy}>`)
					.join("\n");

				return {
					type: 4 as const,
					data: {
						embeds: [
							{
								title: `📚 Book Nominations — ${formatMonthDisplay(month)}`,
								description: nominationList,
								color: 0x9b59b6, // Purple
								footer: {
									text: `${nominations.length} nomination${nominations.length === 1 ? "" : "s"}`,
								},
							},
						],
					},
				};
			}),
		),
	),
);

// /clearnominations command (Admin only)
const clearNominations = Ix.global(
	{
		name: "clearnominations",
		description: "Clear all book nominations for a month (Admin only)",
		options: [
			{
				type: Discord.ApplicationCommandOptionType.STRING,
				name: "month",
				description: "Month to clear (YYYY-MM format). Defaults to current month.",
				required: false,
			},
		],
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const data = interaction.data;
				const options = (data && "options" in data ? data.options : []) as Array<{
					name: string;
					value: string;
				}>;
				const monthParam = options.find((opt) => opt.name === "month")?.value;
				const month = monthParam || getCurrentMonth();
				const guildId = interaction.guild_id || "DM";

				yield* db.execute((client) =>
					client
						.delete(schema.bookNominations)
						.where(
							and(
								eq(schema.bookNominations.guildId, guildId),
								eq(schema.bookNominations.month, month),
							),
						),
				);

				return {
					type: 4 as const,
					data: {
						content: `🗑️ **Nominations cleared!**\n\nAll book nominations for **${formatMonthDisplay(month)}** have been removed.`,
						flags: 64, // Ephemeral
					},
				};
			}),
		),
	),
);

// /startpoll command - Create Phase 1 multi-vote poll from nominations
const startPoll = Ix.global(
	{
		name: "startpoll",
		description: "Start a book selection poll from nominations (Admin only)",
		options: [
			{
				type: Discord.ApplicationCommandOptionType.STRING,
				name: "month",
				description: "Month to create poll for (YYYY-MM format). Defaults to current month.",
				required: false,
			},
		],
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const data = interaction.data;
				const options = (data && "options" in data ? data.options : []) as Array<{
					name: string;
					value: string;
				}>;
				const monthParam = options.find((opt) => opt.name === "month")?.value;
				const month = monthParam || getCurrentMonth();
				const guildId = interaction.guild_id || "DM";
				const channelId = interaction.channel_id || "";

				const user = interaction.member?.user || interaction.user;
				if (!user) {
					return {
						type: 4 as const,
						data: { content: "❌ Could not identify user.", flags: 64 },
					};
				}

				// Check for existing active poll
				const existingPolls = yield* db.execute((client) =>
					client
						.select({ id: schema.polls.id })
						.from(schema.polls)
						.where(
							and(
								eq(schema.polls.guildId, guildId),
								eq(schema.polls.month, month),
								eq(schema.polls.active, 1),
							),
						),
				);

				if (existingPolls.length > 0) {
					return {
						type: 4 as const,
						data: {
							content: `❌ There's already an active poll for **${formatMonthDisplay(month)}**.\n\nUse \`/closepoll\` to close it first.`,
							flags: 64,
						},
					};
				}

				// Get nominations
				const nominations = yield* db.execute((client) =>
					client
						.select({ bookTitle: schema.bookNominations.bookTitle })
						.from(schema.bookNominations)
						.where(
							and(
								eq(schema.bookNominations.guildId, guildId),
								eq(schema.bookNominations.month, month),
							),
						),
				);

				if (nominations.length < 2) {
					return {
						type: 4 as const,
						data: {
							content: `❌ Not enough nominations for **${formatMonthDisplay(month)}**.\n\nYou need at least 2 book nominations to start a poll. Current: ${nominations.length}`,
							flags: 64,
						},
					};
				}

				// Create poll options from nominations
				const pollOptions = nominations.map((n) => n.bookTitle);
				const question = `📚 Book Selection — ${formatMonthDisplay(month)}`;

				// Create the poll in database first with a placeholder messageId
				const insertResult = yield* db.execute((client) =>
					client
						.insert(schema.polls)
						.values({
							guildId,
							channelId,
							messageId: "pending", // We use pollId for tracking, not messageId
							question,
							options: JSON.stringify(pollOptions),
							createdBy: user.id,
							createdAt: new Date().toISOString(),
							active: 1,
							phase: 1,
							multiVote: 1, // Multi-vote for Phase 1
							month,
						})
						.returning({ id: schema.polls.id }),
				);

				const pollId = insertResult[0].id;

				// Build initial embed and buttons
				const initialVotes = pollOptions.map(() => 0);
				const embed = buildPollEmbed(question, pollOptions, initialVotes, 1, month, true);
				const buttons = buildPollButtons(pollId, pollOptions, true);

				return {
					type: 4 as const,
					data: {
						content: `🗳️ **Nomination Poll Started for ${formatMonthDisplay(month)}!**\n\nVote for your favorite books. **You can vote for multiple books!**`,
						embeds: [embed],
						components: buttons,
					},
				};
			}),
		),
	),
);

// Helper: Build poll embed
const buildPollEmbed = (
	question: string,
	options: string[],
	voteCounts: number[],
	phase: number,
	month: string,
	active: boolean,
) => {
	const totalVotes = voteCounts.reduce((sum, count) => sum + count, 0);
	const maxVotes = Math.max(...voteCounts, 1);

	const optionLines = options
		.map((opt, i) => {
			const count = voteCounts[i] || 0;
			const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
			const barLength = Math.round((count / maxVotes) * 10);
			const bar = "█".repeat(barLength) + "░".repeat(10 - barLength);
			return `**${i + 1}.** ${opt}\n${bar} ${count} vote${count === 1 ? "" : "s"} (${percentage}%)`;
		})
		.join("\n\n");

	return {
		title: `📊 ${question}`,
		description: optionLines,
		color: active ? 0x3498db : 0x95a5a6, // Blue if active, gray if closed
		footer: {
			text: `${formatMonthDisplay(month)} • Phase ${phase} • ${totalVotes} total vote${totalVotes === 1 ? "" : "s"}${active ? " • Click buttons to vote!" : " • Voting closed"}`,
		},
	};
};

// Helper: Build vote buttons for a poll
const buildPollButtons = (pollId: number, options: string[], _multiVote: boolean) => {
	// Discord allows max 5 buttons per row, max 5 rows
	const rows: Array<{
		type: 1;
		components: Array<{
			type: 2;
			style: 1 | 2;
			label: string;
			custom_id: string;
		}>;
	}> = [];

	for (let i = 0; i < options.length; i += 5) {
		const rowButtons = options.slice(i, i + 5).map((opt, idx) => ({
			type: 2 as const,
			style: 1 as const, // Primary
			label: `${i + idx + 1}. ${opt.substring(0, 70)}`, // Discord label max ~80 chars
			custom_id: `poll_vote:${pollId}:${i + idx}`,
		}));

		rows.push({
			type: 1 as const,
			components: rowButtons,
		});
	}

	return rows;
};

// Vote button handler
const pollVoteButton = Ix.messageComponent(
	Ix.idStartsWith("poll_vote:"),
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

				const customId = data.custom_id;
				const parts = customId.split(":");
				const pollId = parseInt(parts[1], 10);
				const optionIndex = parseInt(parts[2], 10);

				const user = interaction.member?.user || interaction.user;
				if (!user) {
					return {
						type: 4 as const,
						data: { content: "❌ Could not identify user.", flags: 64 },
					};
				}

				// Get poll details
				const pollResults = yield* db.execute((client) =>
					client
						.select({
							id: schema.polls.id,
							options: schema.polls.options,
							question: schema.polls.question,
							active: schema.polls.active,
							phase: schema.polls.phase,
							multiVote: schema.polls.multiVote,
							month: schema.polls.month,
						})
						.from(schema.polls)
						.where(eq(schema.polls.id, pollId)),
				);

				if (pollResults.length === 0) {
					return {
						type: 4 as const,
						data: { content: "❌ Poll not found.", flags: 64 },
					};
				}

				const poll = pollResults[0];
				if (!poll.active) {
					return {
						type: 4 as const,
						data: { content: "❌ This poll has ended.", flags: 64 },
					};
				}

				const pollOptions = JSON.parse(poll.options) as string[];

				// Check if user already voted for this option
				const existingVotes = yield* db.execute((client) =>
					client
						.select({
							id: schema.pollVotes.id,
							optionIndex: schema.pollVotes.optionIndex,
						})
						.from(schema.pollVotes)
						.where(
							and(eq(schema.pollVotes.pollId, pollId), eq(schema.pollVotes.oderId, user.id)),
						),
				);

				const alreadyVotedForThis = existingVotes.some((v) => v.optionIndex === optionIndex);

				if (poll.multiVote) {
					// Phase 1: Multi-vote - toggle vote
					if (alreadyVotedForThis) {
						// Remove vote
						yield* db.execute((client) =>
							client
								.delete(schema.pollVotes)
								.where(
									and(
										eq(schema.pollVotes.pollId, pollId),
										eq(schema.pollVotes.oderId, user.id),
										eq(schema.pollVotes.optionIndex, optionIndex),
									),
								),
						);
					} else {
						// Add vote
						yield* db.execute((client) =>
							client.insert(schema.pollVotes).values({
								pollId,
								optionIndex,
								oderId: user.id,
								votedAt: new Date().toISOString(),
							}),
						);
					}
				} else {
					// Phase 2: Single vote - replace existing vote
					if (existingVotes.length > 0) {
						// Remove all existing votes
						yield* db.execute((client) =>
							client
								.delete(schema.pollVotes)
								.where(
									and(
										eq(schema.pollVotes.pollId, pollId),
										eq(schema.pollVotes.oderId, user.id),
									),
								),
						);
					}

					if (!alreadyVotedForThis) {
						// Add new vote (only if not toggling same option)
						yield* db.execute((client) =>
							client.insert(schema.pollVotes).values({
								pollId,
								optionIndex,
								oderId: user.id,
								votedAt: new Date().toISOString(),
							}),
						);
					}
				}

				// Get updated vote counts
				const voteCounts = yield* db.execute((client) =>
					client
						.select({
							optionIndex: schema.pollVotes.optionIndex,
							count: sql<number>`count(*)`.as("count"),
						})
						.from(schema.pollVotes)
						.where(eq(schema.pollVotes.pollId, pollId))
						.groupBy(schema.pollVotes.optionIndex),
				);

				const voteCountArray = pollOptions.map((_, i) => {
					const found = voteCounts.find((v) => v.optionIndex === i);
					return found ? Number(found.count) : 0;
				});

				// Build updated embed and buttons
				const embed = buildPollEmbed(
					poll.question,
					pollOptions,
					voteCountArray,
					poll.phase,
					poll.month || getCurrentMonth(),
					true,
				);
				const buttons = buildPollButtons(pollId, pollOptions, poll.multiVote === 1);

				// Update the message
				return {
					type: 7 as const, // UPDATE_MESSAGE
					data: {
						embeds: [embed],
						components: buttons,
					},
				};
			}),
		),
	),
);

// /closepoll command
const closePoll = Ix.global(
	{
		name: "closepoll",
		description: "Close the active poll and display final results (Admin only)",
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const guildId = interaction.guild_id || "DM";

				// Find active poll
				const activePolls = yield* db.execute((client) =>
					client
						.select({
							id: schema.polls.id,
							question: schema.polls.question,
							options: schema.polls.options,
							phase: schema.polls.phase,
							month: schema.polls.month,
						})
						.from(schema.polls)
						.where(and(eq(schema.polls.guildId, guildId), eq(schema.polls.active, 1))),
				);

				if (activePolls.length === 0) {
					return {
						type: 4 as const,
						data: {
							content: "❌ No active poll found in this server.",
							flags: 64,
						},
					};
				}

				const poll = activePolls[0];
				const pollOptions = JSON.parse(poll.options) as string[];

				// Get vote counts
				const voteCounts = yield* db.execute((client) =>
					client
						.select({
							optionIndex: schema.pollVotes.optionIndex,
							count: sql<number>`count(*)`.as("count"),
						})
						.from(schema.pollVotes)
						.where(eq(schema.pollVotes.pollId, poll.id))
						.groupBy(schema.pollVotes.optionIndex),
				);

				const voteCountArray = pollOptions.map((_, i) => {
					const found = voteCounts.find((v) => v.optionIndex === i);
					return found ? Number(found.count) : 0;
				});

				// Close the poll
				yield* db.execute((client) =>
					client.update(schema.polls).set({ active: 0 }).where(eq(schema.polls.id, poll.id)),
				);

				// If Phase 2, record the winner
				if (poll.phase === 2) {
					const maxVotes = Math.max(...voteCountArray);
					const winnerIndex = voteCountArray.indexOf(maxVotes);
					const winnerTitle = pollOptions[winnerIndex];

					yield* db.execute((client) =>
						client.insert(schema.pollWinners).values({
							guildId,
							month: poll.month || getCurrentMonth(),
							bookTitle: winnerTitle,
							voteCount: maxVotes,
							announcedAt: new Date().toISOString(),
						}),
					);
				}

				// Build results
				const sortedResults = pollOptions
					.map((opt, i) => ({ title: opt, votes: voteCountArray[i] || 0 }))
					.sort((a, b) => b.votes - a.votes);

				const resultsText = sortedResults
					.map((r, i) => {
						const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
						return `${medal} **${r.title}** — ${r.votes} vote${r.votes === 1 ? "" : "s"}`;
					})
					.join("\n");

				const phaseText = poll.phase === 1 ? "Phase 1 (Nominations)" : "Phase 2 (Final)";
				const monthDisplay = formatMonthDisplay(poll.month || getCurrentMonth());

				let winnerAnnouncement = "";
				if (poll.phase === 2 && sortedResults.length > 0) {
					winnerAnnouncement = `\n\n🎉 **Winner: ${sortedResults[0].title}** 🎉\n\nThis is the book club selection for ${monthDisplay}!`;
				}

				return {
					type: 4 as const,
					data: {
						embeds: [
							{
								title: `📊 Poll Closed — ${phaseText}`,
								description: `**${poll.question}**\n\n${resultsText}${winnerAnnouncement}`,
								color: 0xe74c3c, // Red for closed
								footer: {
									text: `${monthDisplay} • Voting has ended`,
								},
							},
						],
					},
				};
			}),
		),
	),
);

// /startfinalpoll command - Create Phase 2 poll from top 3
const startFinalPoll = Ix.global(
	{
		name: "startfinalpoll",
		description: "Start the final vote poll with top 3 from Phase 1 (Admin only)",
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const guildId = interaction.guild_id || "DM";
				const channelId = interaction.channel_id || "";

				const user = interaction.member?.user || interaction.user;
				if (!user) {
					return {
						type: 4 as const,
						data: { content: "❌ Could not identify user.", flags: 64 },
					};
				}

				// Find the most recent closed Phase 1 poll
				const phase1Polls = yield* db.execute((client) =>
					client
						.select({
							id: schema.polls.id,
							options: schema.polls.options,
							month: schema.polls.month,
						})
						.from(schema.polls)
						.where(
							and(
								eq(schema.polls.guildId, guildId),
								eq(schema.polls.phase, 1),
								eq(schema.polls.active, 0),
							),
						)
						.orderBy(desc(schema.polls.id))
						.limit(1),
				);

				if (phase1Polls.length === 0) {
					return {
						type: 4 as const,
						data: {
							content:
								"❌ No completed Phase 1 poll found.\n\nUse `/startpoll` to create a nomination poll first, then `/closepoll` to end it.",
							flags: 64,
						},
					};
				}

				const phase1Poll = phase1Polls[0];
				const month = phase1Poll.month || getCurrentMonth();

				// Check for existing active poll
				const existingActive = yield* db.execute((client) =>
					client
						.select({ id: schema.polls.id })
						.from(schema.polls)
						.where(and(eq(schema.polls.guildId, guildId), eq(schema.polls.active, 1))),
				);

				if (existingActive.length > 0) {
					return {
						type: 4 as const,
						data: {
							content: "❌ There's already an active poll. Use `/closepoll` first.",
							flags: 64,
						},
					};
				}

				// Get vote counts from Phase 1
				const phase1Options = JSON.parse(phase1Poll.options) as string[];
				const voteCounts = yield* db.execute((client) =>
					client
						.select({
							optionIndex: schema.pollVotes.optionIndex,
							count: sql<number>`count(*)`.as("count"),
						})
						.from(schema.pollVotes)
						.where(eq(schema.pollVotes.pollId, phase1Poll.id))
						.groupBy(schema.pollVotes.optionIndex),
				);

				// Get top 3
				const sortedOptions = phase1Options
					.map((opt, i) => {
						const found = voteCounts.find((v) => v.optionIndex === i);
						return { title: opt, votes: found ? Number(found.count) : 0 };
					})
					.sort((a, b) => b.votes - a.votes)
					.slice(0, 3);

				// Check if we have exactly 3 options for the final poll
				if (phase1Options.length < 3) {
					return {
						type: 4 as const,
						data: {
							content: `❌ **Not enough nominations!**\n\nPhase 1 only had **${phase1Options.length}** book${phase1Options.length === 1 ? "" : "s"}. The final poll requires at least **3 books** to choose from.\n\nPlease add more nominations and run a new Phase 1 poll.`,
							flags: 64,
						},
					};
				}

				// Check if at least 3 books received votes
				const booksWithVotes = sortedOptions.filter((opt) => opt.votes > 0);
				if (booksWithVotes.length < 3) {
					return {
						type: 4 as const,
						data: {
							content: `❌ **Not enough books received votes!**\n\nOnly **${booksWithVotes.length}** book${booksWithVotes.length === 1 ? "" : "s"} received votes in Phase 1. The final poll requires at least **3 books with votes** to proceed.\n\n**Books with votes:**\n${booksWithVotes.map((b) => `• ${b.title} (${b.votes} vote${b.votes === 1 ? "" : "s"})`).join("\n") || "_None_"}\n\nConsider re-running Phase 1 with more participation.`,
							flags: 64,
						},
					};
				}

				const top3Titles = sortedOptions.map((o) => o.title);
				const question = `📚 Final Vote — ${formatMonthDisplay(month)}`;

				// Create the poll in database first with a placeholder messageId
				const insertResult = yield* db.execute((client) =>
					client
						.insert(schema.polls)
						.values({
							guildId,
							channelId,
							messageId: "pending", // Will be updated
							question,
							options: JSON.stringify(top3Titles),
							createdBy: user.id,
							createdAt: new Date().toISOString(),
							active: 1,
							phase: 2,
							multiVote: 0, // Single vote only
							parentPollId: phase1Poll.id,
							month,
						})
						.returning({ id: schema.polls.id }),
				);

				const pollId = insertResult[0].id;

				// Build initial embed and buttons
				const initialVotes = top3Titles.map(() => 0);
				const embed = buildPollEmbed(question, top3Titles, initialVotes, 2, month, true);
				const buttons = buildPollButtons(pollId, top3Titles, false);

				return {
					type: 4 as const,
					data: {
						content: `🗳️ **Final Vote Started!**\n\nTop 3 from Phase 1 are now up for the final vote. **You can only vote for ONE book!**`,
						embeds: [embed],
						components: buttons,
					},
				};
			}),
		),
	),
);

// /pollstatus command
const pollStatus = Ix.global(
	{
		name: "pollstatus",
		description: "View the current poll standings",
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const guildId = interaction.guild_id || "DM";

				// Find active poll
				const activePolls = yield* db.execute((client) =>
					client
						.select({
							id: schema.polls.id,
							question: schema.polls.question,
							options: schema.polls.options,
							phase: schema.polls.phase,
							month: schema.polls.month,
							multiVote: schema.polls.multiVote,
						})
						.from(schema.polls)
						.where(and(eq(schema.polls.guildId, guildId), eq(schema.polls.active, 1))),
				);

				if (activePolls.length === 0) {
					return {
						type: 4 as const,
						data: {
							content: "📭 No active poll in this server.\n\nAdmins can start one with `/startpoll`.",
						},
					};
				}

				const poll = activePolls[0];
				const pollOptions = JSON.parse(poll.options) as string[];

				// Get vote counts
				const voteCounts = yield* db.execute((client) =>
					client
						.select({
							optionIndex: schema.pollVotes.optionIndex,
							count: sql<number>`count(*)`.as("count"),
						})
						.from(schema.pollVotes)
						.where(eq(schema.pollVotes.pollId, poll.id))
						.groupBy(schema.pollVotes.optionIndex),
				);

				const voteCountArray = pollOptions.map((_, i) => {
					const found = voteCounts.find((v) => v.optionIndex === i);
					return found ? Number(found.count) : 0;
				});

				const embed = buildPollEmbed(
					poll.question,
					pollOptions,
					voteCountArray,
					poll.phase,
					poll.month || getCurrentMonth(),
					true,
				);
				const buttons = buildPollButtons(poll.id, pollOptions, poll.multiVote === 1);

				return {
					type: 4 as const,
					data: {
						embeds: [embed],
						components: buttons,
					},
				};
			}),
		),
	),
);

// /pastwinners command
const pastWinners = Ix.global(
	{
		name: "pastwinners",
		description: "View the history of monthly book club selections",
	},
	Ix.Interaction.pipe(
		Effect.flatMap((interaction) =>
			Effect.gen(function* () {
				const guildId = interaction.guild_id || "DM";

				const winners = yield* db.execute((client) =>
					client
						.select({
							month: schema.pollWinners.month,
							bookTitle: schema.pollWinners.bookTitle,
							voteCount: schema.pollWinners.voteCount,
						})
						.from(schema.pollWinners)
						.where(eq(schema.pollWinners.guildId, guildId))
						.orderBy(desc(schema.pollWinners.month)),
				);

				if (winners.length === 0) {
					return {
						type: 4 as const,
						data: {
							content:
								"📭 No past winners yet!\n\nComplete a full poll cycle (nominations → Phase 1 → Phase 2) to see winners here.",
						},
					};
				}

				const winnerList = winners
					.map(
						(w) =>
							`📅 **${formatMonthDisplay(w.month)}**\n　　📖 ${w.bookTitle} (${w.voteCount} votes)`,
					)
					.join("\n\n");

				return {
					type: 4 as const,
					data: {
						embeds: [
							{
								title: "🏆 Book Club Hall of Fame",
								description: winnerList,
								color: 0xf1c40f, // Gold
								footer: {
									text: `${winners.length} book${winners.length === 1 ? "" : "s"} selected so far`,
								},
							},
						],
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
								name: "🗳️ Monthly Book Selection",
								value: [
									"`/nominatebook [title]` — Nominate a book for this month",
									"`/listnominations [month?]` — View nominations",
									"`/pollstatus` — View current poll standings",
									"`/pastwinners` — View past monthly winners",
								].join("\n"),
								inline: false,
							},
							{
								name: "🔒 Admin Poll Commands",
								value: [
									"`/startpoll [month?]` — Start Phase 1 poll from nominations",
									"`/closepoll` — Close the active poll",
									"`/startfinalpoll` — Start final vote with top 3",
									"`/clearnominations [month?]` — Clear nominations",
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
		// Poll system commands
		.add(nominateBook)
		.add(listNominations)
		.add(clearNominations)
		.add(startPoll)
		.add(pollVoteButton)
		.add(closePoll)
		.add(startFinalPoll)
		.add(pollStatus)
		.add(pastWinners)
		.add(help)
		.catchAllCause(Effect.logError);

	yield* registry.register(interactions);

	// TODO: Add more slash commands:
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
	// ✅ /nominatebook [title] (monthly book nomination)
	// ✅ /listnominations [month?] (view nominations)
	// ✅ /clearnominations [month?] (admin - clear nominations)
	// ✅ /startpoll [month?] (admin - Phase 1 poll)
	// ✅ /closepoll (admin - close active poll)
	// ✅ /startfinalpoll (admin - Phase 2 poll from top 3)
	// ✅ /pollstatus (view current poll)
	// ✅ /pastwinners (view winner history)

	yield* Effect.log("Gateway events service initialized");
});

/**
 * Live gateway events layer.
 */
export const GatewayEventsLive = Layer.effectDiscard(make);
