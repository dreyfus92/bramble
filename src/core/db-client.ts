import type { ResultSet } from '@libsql/client';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle as drizzleClient } from 'drizzle-orm/libsql';
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core';
import { Context, Data, Effect, Option, Redacted } from 'effect';
import { databaseAuthToken, databaseUrl } from '../static/env.ts';
import * as schema from './db-schema.ts';

/**
 * LibSQL client error for database operations.
 */
export class LibSQLClientError extends Data.TaggedError('LibSQLClientError')<{ cause: unknown }> {}

const useWithError = <A>(_try: () => A) =>
	Effect.try({
		try: _try,
		catch: (cause) => new LibSQLClientError({ cause }),
	});

const useWithErrorPromise = <A>(_try: () => Promise<A>) =>
	Effect.tryPromise({
		try: _try,
		catch: (cause) => new LibSQLClientError({ cause }),
	});

/**
 * SQLite transaction client type.
 */
export type TransactionClient<Schema extends Record<string, unknown>> = SQLiteTransaction<
	'async',
	ResultSet,
	Schema,
	ExtractTablesWithRelations<Schema>
>;

/**
 * Execute function type for database operations.
 */
export type ExecuteFn<Schema extends Record<string, unknown>> = <T>(
	fn: (client: LibSQLDatabase<Schema> | TransactionClient<Schema>) => Promise<T>
) => Effect.Effect<T, LibSQLClientError>;

/**
 * Transaction context shape for transactional operations.
 */
export type TransactionContextShape<Schema extends Record<string, unknown>> = <U>(
	fn: (client: TransactionClient<Schema>) => Promise<U>
) => Effect.Effect<U, LibSQLClientError>;

/**
 * Creates a transaction context class for a given schema.
 */
function buildTransactionContext<Schema extends Record<string, unknown>>() {
	return class TransactionContext extends Context.Tag('TransactionContext')<
		TransactionContext,
		TransactionContextShape<Schema>
	>() {
		public static readonly provide = (
			transaction: TransactionContextShape<Schema>
		): (<A, E, R>(
			self: Effect.Effect<A, E, R>
		) => Effect.Effect<A, E, Exclude<R, TransactionContext>>) =>
			Effect.provideService(this, transaction);
	};
}

export const useDB = (url: string, authToken: string) =>
	drizzleClient({
		connection: { url, authToken },
		schema,
	});

/**
 * Drizzle database client service.
 * Provides query execution and transaction support.
 */
export class DrizzleDBClientService extends Effect.Service<DrizzleDBClientService>()(
	'DrizzleDBClientService',
	{
		effect: Effect.gen(function* () {
			class TransactionContext extends buildTransactionContext<typeof schema>() {}

			const dbUrl = yield* databaseUrl;
			const authToken = yield* databaseAuthToken;

			const drizzle = yield* useWithError(() =>
				useDB(Redacted.value(dbUrl), Redacted.value(authToken))
			);

			/**
			 * Execute a database operation with error handling.
			 */
			const execute = Effect.fn(<T>(fn: (client: typeof drizzle) => Promise<T>) =>
				useWithErrorPromise(() => fn(drizzle))
			);

			/**
			 * Create a query function that can participate in transactions.
			 */
			const makeQuery =
				<A, E, R, Input = never>(
					queryFn: (execute: ExecuteFn<typeof schema>, input: Input) => Effect.Effect<A, E, R>
				) =>
				(...args: [Input] extends [never] ? [] : [input: Input]): Effect.Effect<A, E, R> => {
					const input = args[0] as Input;
					return Effect.serviceOption(TransactionContext).pipe(
						Effect.map(Option.getOrNull),
						Effect.flatMap((txOrNull) => queryFn(txOrNull ?? execute, input))
					);
				};

			return { makeQuery, execute, schema, drizzle } as const;
		}),
	}
) {}

/**
 * Live database layer.
 */
export const DatabaseLive = DrizzleDBClientService.pipe(
	Effect.provide(DrizzleDBClientService.Default)
);

