import { Clock, Duration, Effect } from 'effect';

/**
 * Cache entry with value, expiration, and tags.
 */
export interface CacheEntry<A> {
	value: A;
	expiresAt: number;
	lastUpdatedAt: number;
	tags: Set<string>;
}

/**
 * Cache entry status information.
 */
export interface CacheEntryStatus {
	expiresAt: Date;
	lastUpdatedAt: Date;
	tags: Set<string>;
}

/**
 * Cache miss error.
 */
export class CacheMissError {
	readonly _tag = 'CacheMissError';
}

/**
 * Returns a non-null value or fails with CacheMissError.
 */
export const returnNonNull = <A>(value: A | null): Effect.Effect<A, CacheMissError> =>
	value !== null ? Effect.succeed(value) : Effect.fail(new CacheMissError());

/**
 * In-memory caching service with TTL and tag-based invalidation.
 */
export class CacheService extends Effect.Service<CacheService>()('BookClub/CacheService', {
	effect: Effect.gen(function* () {
		const store = new Map<string, CacheEntry<unknown>>();
		const tagIndex = new Map<string, Set<string>>();

		/**
		 * Get a cached value by key.
		 */
		const get = <A>(key: string) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const entry = store.get(key) as CacheEntry<A> | undefined;

				if (!entry) return null;
				if (entry.expiresAt < now) {
					store.delete(key);
					return null;
				}

				return entry.value;
			});

		/**
		 * Set a cached value with optional TTL and tags.
		 */
		const set = <A>(
			key: string,
			value: A,
			options?: { ttl?: Duration.Duration; tags?: string[] }
		) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const ttl = options?.ttl ?? Duration.minutes(5);
				const tags = new Set(options?.tags ?? []);

				const expiresAt = now + Duration.toMillis(ttl);
				store.set(key, { value, expiresAt, tags, lastUpdatedAt: now });

				for (const tag of tags) {
					if (!tagIndex.has(tag)) {
						tagIndex.set(tag, new Set());
					}
					tagIndex.get(tag)?.add(key);
				}
			});

		/**
		 * Delete a key from the cache.
		 */
		const deleteKey = (key: string) =>
			Effect.sync(() => {
				const entry = store.get(key);
				if (entry) {
					for (const tag of entry.tags) {
						tagIndex.get(tag)?.delete(key);
					}
				}
				store.delete(key);
			});

		/**
		 * Invalidate all entries with given tags.
		 */
		const invalidateTags = (tags: string[]) =>
			Effect.sync(() => {
				for (const tag of tags) {
					const keys = tagIndex.get(tag);
					if (keys) {
						for (const key of keys) {
							store.delete(key);
						}
						tagIndex.delete(tag);
					}
				}
			});

		/**
		 * Clear all cached entries.
		 */
		const clear = () =>
			Effect.sync(() => {
				store.clear();
				tagIndex.clear();
			});

		/**
		 * Memoize an effect result under a key.
		 */
		const memoize = <A, E, R>(
			key: string,
			effect: Effect.Effect<A, E, R>,
			options?: { ttl?: Duration.Duration; tags?: string[] }
		): Effect.Effect<A, E, R> =>
			get<A>(key).pipe(
				Effect.flatMap(returnNonNull),
				Effect.catchTag('CacheMissError', () =>
					effect.pipe(Effect.tap((result) => set<A>(key, result, options)))
				)
			);

		/**
		 * Get cache entry status.
		 */
		const getCacheStatus = Effect.fn((id: string) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const entry = store.get(id);
				if (!entry || entry.expiresAt < now) {
					if (entry && entry.expiresAt < now) {
						store.delete(id);
					}
					return null;
				}
				return {
					expiresAt: new Date(entry.expiresAt),
					lastUpdatedAt: new Date(entry.lastUpdatedAt),
					tags: entry.tags,
				};
			})
		);

		return { get, set, delete: deleteKey, invalidateTags, clear, memoize, getCacheStatus };
	}),
}) {}

export default CacheService;

