/**
 * Gateway events service.
 * Handles Discord gateway events and interaction registration.
 */
import { Ix } from "dfx";
import { InteractionsRegistry } from "dfx/gateway";
import { Effect, Layer } from "effect";
import {
	createBookCommands,
	createPollCommands,
	createQuestionCommands,
	createUtilityCommands,
} from "../commands/index.ts";
import { DrizzleDBClientService } from "../core/db-client.ts";

const make = Effect.gen(function* () {
	const registry = yield* InteractionsRegistry;
	const db = yield* DrizzleDBClientService;

	// Create command handlers from modules
	const utility = createUtilityCommands();
	const questions = createQuestionCommands(db);
	const books = createBookCommands(db);
	const polls = createPollCommands(db);

	// Build and register all commands
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

	yield* registry.register(interactions);
	yield* Effect.log("Gateway events service initialized");
});

/**
 * Live gateway events layer.
 */
export const GatewayEventsLive = Layer.effectDiscard(make);
