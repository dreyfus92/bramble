import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Guild Configuration
// ============================================================================

/**
 * Guild configuration table.
 * Stores per-server settings for the book club bot.
 */
export const guilds = sqliteTable('guilds', {
	id: text().primaryKey().unique().notNull(),
	defaultPollChannel: text(),
	defaultMeetingChannel: text(),
});

// ============================================================================
// Polls
// ============================================================================

/**
 * Polls table.
 * Stores poll metadata and state.
 */
export const polls = sqliteTable('polls', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	channelId: text().notNull(),
	messageId: text().notNull().unique(),
	question: text().notNull(),
	/** JSON array of option strings */
	options: text().notNull(),
	createdBy: text().notNull(),
	createdAt: text().notNull(),
	endsAt: text(),
	active: int().notNull().default(1),
});

/**
 * Poll votes table.
 * Tracks individual votes on polls.
 */
export const pollVotes = sqliteTable('poll_votes', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	pollId: int()
		.notNull()
		.references(() => polls.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	optionIndex: int().notNull(),
	userId: text().notNull(),
	votedAt: text().notNull(),
});

// ============================================================================
// Book Sessions
// ============================================================================

/**
 * Book sessions table.
 * Represents a book club reading session for a specific book.
 */
export const bookSessions = sqliteTable('book_sessions', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	bookTitle: text().notNull(),
	bookAuthor: text(),
	startDate: text().notNull(),
	endDate: text(),
	active: int().notNull().default(1),
	createdBy: text().notNull(),
	createdAt: text().notNull(),
});

/**
 * Session questions table.
 * Stores questions submitted by users for book discussion.
 */
export const sessionQuestions = sqliteTable('session_questions', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	sessionId: int()
		.notNull()
		.references(() => bookSessions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	userId: text().notNull(),
	question: text().notNull(),
	submittedAt: text().notNull(),
	/** Optional: which chapter/section the question relates to */
	chapter: text(),
});

// ============================================================================
// Meetings
// ============================================================================

/**
 * Meetings table.
 * Stores scheduled book club meetings.
 */
export const meetings = sqliteTable('meetings', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	sessionId: int().references(() => bookSessions.id, { onDelete: 'set null', onUpdate: 'cascade' }),
	title: text().notNull(),
	description: text(),
	scheduledAt: text().notNull(),
	channelId: text(),
	voiceChannelId: text(),
	reminderSent: int().notNull().default(0),
	createdBy: text().notNull(),
	createdAt: text().notNull(),
});

// ============================================================================
// LLM Rate Limiting
// ============================================================================

/**
 * LLM usage tracking table.
 * Tracks per-user usage of the Groq LLM for rate limiting.
 */
export const llmUsage = sqliteTable('llm_usage', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	userId: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	requestCount: int().notNull().default(0),
	windowStart: text().notNull(),
});

