/**
 * Utility commands - ping, help
 */
import { Ix } from "dfx";
import { Effect } from "effect";

/**
 * Create utility commands (no database dependency).
 */
export const createUtilityCommands = () => {
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
									"`/nominatebook [title] [author]` — Nominate a book for this month",
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

	return { ping, help };
};
