/**
 * Poll commands - nominateBook, listnominations, startpoll, closepoll, etc.
 */
import { Discord, Ix } from "dfx";
import { and, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { DrizzleDBClientService } from "../core/db-client.ts";
import * as schema from "../core/db-schema.ts";
import { formatMonthDisplay, getCurrentMonth } from "../utils/helpers.ts";

type DbService = typeof DrizzleDBClientService.Service;

/**
 * Build poll embed with vote counts and progress bars.
 */
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

/**
 * Build vote buttons for a poll.
 */
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

/**
 * Create poll commands.
 */
export const createPollCommands = (db: DbService) => {
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
								content: `📭 No book nominations for **${formatMonthDisplay(month)}** yet.\n\nUse \`/nominatebook [title] [author]\` to nominate a book!`,
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
								messageId: "pending",
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
										and(eq(schema.pollVotes.pollId, pollId), eq(schema.pollVotes.oderId, user.id)),
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

					// Create the poll in database
					const insertResult = yield* db.execute((client) =>
						client
							.insert(schema.polls)
							.values({
								guildId,
								channelId,
								messageId: "pending",
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
							content:
								"🗳️ **Final Vote Started!**\n\nTop 3 from Phase 1 are now up for the final vote. **You can only vote for ONE book!**",
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
								content:
									"📭 No active poll in this server.\n\nAdmins can start one with `/startpoll`.",
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

	return {
		nominateBook,
		listNominations,
		clearNominations,
		startPoll,
		pollVoteButton,
		closePoll,
		startFinalPoll,
		pollStatus,
		pastWinners,
	};
};
