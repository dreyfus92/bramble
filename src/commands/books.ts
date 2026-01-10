/**
 * Book commands - quickCheck, createbook, getbook, bookOptions
 */
import { Discord, Ix } from "dfx";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import type { DrizzleDBClientService } from "../core/db-client.ts";
import * as schema from "../core/db-schema.ts";

type DbService = typeof DrizzleDBClientService.Service;

// Types for Open Library API
type OpenLibrarySearchResult = {
	numFound: number;
	docs: Array<{
		title: string;
		author_name?: string[];
		first_publish_year?: number;
		subject?: string[];
		cover_i?: number;
		key?: string;
	}>;
};

type OpenLibraryWork = {
	description?: string | { value: string };
};

type OpenLibraryRatings = {
	summary?: {
		average?: number;
		count?: number;
	};
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

/**
 * Create book commands.
 */
export const createBookCommands = (db: DbService) => {
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
					let searchUrl = "https://openlibrary.org/search.json?limit=1";
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

					// Try to get description and ratings from works API
					let description = "_No description available_";
					let ratingAverage: number | undefined;
					let ratingCount: number | undefined;

					if (book.key) {
						// Fetch work details for description
						const workResult = yield* fetchOpenLibrary<OpenLibraryWork>(
							`https://openlibrary.org${book.key}.json`,
						).pipe(Effect.catchAll(() => Effect.succeed({} as OpenLibraryWork)));

						if (workResult.description) {
							const rawDesc =
								typeof workResult.description === "string"
									? workResult.description
									: workResult.description.value;
							// Truncate to 500 chars
							description = rawDesc.length > 500 ? `${rawDesc.substring(0, 497)}...` : rawDesc;
						}

						// Fetch ratings from ratings endpoint
						const ratingsResult = yield* fetchOpenLibrary<OpenLibraryRatings>(
							`https://openlibrary.org${book.key}/ratings.json`,
						).pipe(Effect.catchAll(() => Effect.succeed({} as OpenLibraryRatings)));

						if (ratingsResult.summary) {
							ratingAverage = ratingsResult.summary.average;
							ratingCount = ratingsResult.summary.count;
						}
					}

					// Build rating display
					let ratingDisplay = "_No ratings yet_";
					if (ratingAverage !== undefined && ratingAverage > 0) {
						const stars = "⭐".repeat(Math.round(ratingAverage));
						ratingDisplay = `${stars} **${ratingAverage.toFixed(1)}/5**`;
						if (ratingCount !== undefined && ratingCount > 0) {
							ratingDisplay += ` (${ratingCount.toLocaleString()} rating${ratingCount === 1 ? "" : "s"})`;
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

	// /getbook command - Select dropdown of existing books
	const getbook = Ix.global(
		{
			name: "getbook",
			description: "Browse and manage existing books",
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

					if (choices.length === 0) {
						return {
							type: 4 as const,
							data: { content: "📭 No books in the library yet. Use `/createbook` to add one!" },
						};
					}

					return {
						type: 4 as const,
						data: {
							content: "📚 Select a book to manage:",
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

	// /createbook command
	const createbook = Ix.global(
		{
			name: "createbook",
			description: "Add a new book to the club list",
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
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
					if (!data || !("options" in data) || !data.options) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction data" },
						};
					}

					const options = data.options as Array<{ name: string; value: string }>;
					const book = options.find((opt) => opt.name === "title")?.value;
					if (!book) {
						return {
							type: 4 as const,
							data: { content: "❌ Please provide a book title." },
						};
					}

					const date = new Date();
					const defaultoffset = date.getTime() + 1814400000; // 21 days
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
						data: {
							content: `✅ **Book added!**\n\n📚 **${book}**\n📅 Meeting date set to 21 days from now.`,
						},
					};
				}),
			),
		),
	);

	// Book select dropdown handler - opens modal to edit book
	const bookOptions = Ix.messageComponent(
		Ix.idStartsWith("book-select"),
		Ix.Interaction.pipe(
			Effect.flatMap((interaction) =>
				Effect.gen(function* () {
					const data = interaction.data;

					if (!data || !("custom_id" in data) || !("values" in data)) {
						return {
							type: 4 as const,
							data: { content: "❌ Invalid interaction", flags: 64 },
						};
					}

					const bookKey = Number(data.values[0]);
					const bookChoice = yield* db.execute((client) =>
						client
							.select({
								title: schema.bookSelection.bookTitle,
								id: schema.bookSelection.id,
								meetingdate: schema.bookSelection.meetingDate,
							})
							.from(schema.bookSelection)
							.where(eq(schema.bookSelection.id, bookKey)),
					);

					if (bookChoice.length === 0) {
						return {
							type: 4 as const,
							data: { content: "❌ Book not found.", flags: 64 },
						};
					}

					// Return modal response
					return {
						type: 9 as const, // MODAL
						data: {
							custom_id: "submit",
							title: "Modify book attributes",
							components: [
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 4 as const, // Text Input
											custom_id: "book_name",
											label: "Rename",
											style: 1 as const,
											placeholder: bookChoice[0].title,
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
											style: 1 as const,
											placeholder: "",
											required: false,
											min_length: 0,
											max_length: 200,
										},
									],
								},
								{
									type: 1 as const, // Action Row
									components: [
										{
											type: 4 as const, // Text Input
											custom_id: "meeting_date",
											label: "Meeting date",
											style: 1 as const,
											placeholder: bookChoice[0].meetingdate,
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

	return {
		quickCheck,
		getbook,
		createbook,
		bookOptions,
	};
};
