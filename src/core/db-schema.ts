import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {AnySQLiteColumn } from "drizzle-orm/sqlite-core";

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
// Book Questions (Simple - for meetup prep)
// ============================================================================

/**
 * Book questions table.
 * Stores questions submitted by users for book discussion meetups.
 */

export const bookSelection = sqliteTable('Book', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	bookTitle: text().notNull(),
	submittedAt: text().notNull(),
	meetingDate: text().notNull(),
	isActive: int().default(0)
});

export const bookQuestions = sqliteTable('book_questions', {
	id: int().primaryKey({ autoIncrement: true }).notNull(),
	guildId: text().notNull(),
	oderId: text().notNull(),
	userTag: text().notNull(),
	book:text().notNull(),
	bookid: int().references((): AnySQLiteColumn => bookSelection.id),
	question: text().notNull(),
	submittedAt: text().notNull(),
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
	guildId: text().notNull(),
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
	oderId: text().notNull(),
	votedAt: text().notNull(),
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
	guildId: text().notNull(),
	title: text().notNull(),
	book: text(),
	description: text(),
	scheduledAt: text().notNull(),
	channelId: text(),
	voiceChannelId: text(),
	reminderSent: int().notNull().default(0),
	createdBy: text().notNull(),
	createdAt: text().notNull(),
});


