/**
 * Interactions service.
 * Builds and exports the InteractionBuilder for webhook-based Discord bot.
 */
import { Ix } from "dfx";
import { Effect } from "effect";
import {
	createBookCommands,
	createPollCommands,
	createQuestionCommands,
	createUtilityCommands,
} from "../commands/index.ts";
import { DrizzleDBClientService } from "../core/db-client.ts";

/**
 * Builds the InteractionBuilder with all commands.
 * This builder can be used for both webhook handling and command registration.
 */
export const buildInteractions = Effect.gen(function* () {
	const db = yield* DrizzleDBClientService;

	// Create command handlers from modules
	const utility = createUtilityCommands();
	const questions = createQuestionCommands(db);
	const books = createBookCommands(db);
	const polls = createPollCommands(db);

	// Build all interactions
	const interactions = Ix.builder
		// Utility commands
		.add(utility.ping)
		.add(utility.help)
		// Question commands
		.add(questions.submitQuestion)
		.add(questions.addAnotherButton)
		.add(questions.questionModal)
		.add(questions.doneButton)
		.add(questions.listQuestions)
		.add(questions.plainTextButton)
		// Book commands
		.add(books.quickCheck)
		.add(books.createbook)
		.add(books.getbook)
		.add(books.bookOptions)
		// Poll system commands
		.add(polls.nominateBook)
		.add(polls.listNominations)
		.add(polls.clearNominations)
		.add(polls.startPoll)
		.add(polls.pollVoteButton)
		.add(polls.closePoll)
		.add(polls.startFinalPoll)
		.add(polls.pollStatus)
		.add(polls.pastWinners)
		.catchAllCause(Effect.logError);

	return interactions;
});
