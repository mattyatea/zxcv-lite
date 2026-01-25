import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../../server/types/env";
import { Cache, createCache } from "../../../../server/services/CacheService";

describe("Cache", () => {
	let mockKV: {
		get: ReturnType<typeof vi.fn>;
		put: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	let cache: Cache;

	beforeEach(() => {
		vi.clearAllMocks();

		mockKV = {
			get: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
		};

		cache = new Cache(mockKV as any);
	});

	describe("constructor", () => {
		it("should use default options", () => {
			const c = new Cache(mockKV as any);
			expect((c as any).defaultTTL).toBe(300);
			expect((c as any).namespace).toBe("zxcv");
		});

		it("should accept custom options", () => {
			const c = new Cache(mockKV as any, {
				ttl: 600,
				namespace: "custom",
			});
			expect((c as any).defaultTTL).toBe(600);
			expect((c as any).namespace).toBe("custom");
		});
	});

	describe("get", () => {
		it("should get value from KV", async () => {
			const testData = { id: 1, name: "test" };
			mockKV.get.mockResolvedValue(testData);

			const result = await cache.get<typeof testData>("test-key");

			expect(result).toEqual(testData);
			expect(mockKV.get).toHaveBeenCalledWith("zxcv:test-key", "json");
		});

		it("should return null when key not found", async () => {
			mockKV.get.mockResolvedValue(null);

			const result = await cache.get("not-found");

			expect(result).toBeNull();
		});

		it("should return null on error", async () => {
			mockKV.get.mockRejectedValue(new Error("KV error"));

			const result = await cache.get("test-key");

			expect(result).toBeNull();
		});
	});

	describe("set", () => {
		it("should set value in KV with default TTL", async () => {
			const testData = { id: 1, name: "test" };

			await cache.set("test-key", testData);

			expect(mockKV.put).toHaveBeenCalledWith("zxcv:test-key", JSON.stringify(testData), {
				expirationTtl: 300,
			});
		});

		it("should set value with custom TTL", async () => {
			const testData = { id: 1, name: "test" };

			await cache.set("test-key", testData, 600);

			expect(mockKV.put).toHaveBeenCalledWith("zxcv:test-key", JSON.stringify(testData), {
				expirationTtl: 600,
			});
		});

		it("should handle errors silently", async () => {
			mockKV.put.mockRejectedValue(new Error("KV error"));

			await expect(cache.set("test-key", { data: "test" })).resolves.toBeUndefined();
		});
	});

	describe("delete", () => {
		it("should delete key from KV", async () => {
			await cache.delete("test-key");

			expect(mockKV.delete).toHaveBeenCalledWith("zxcv:test-key");
		});

		it("should handle errors silently", async () => {
			mockKV.delete.mockRejectedValue(new Error("KV error"));

			await expect(cache.delete("test-key")).resolves.toBeUndefined();
		});
	});

	describe("getOrSet", () => {
		it("should return cached value if exists", async () => {
			const cachedData = { id: 1, name: "cached" };
			mockKV.get.mockResolvedValue(cachedData);

			const fetchFn = vi.fn().mockResolvedValue({ id: 2, name: "fresh" });

			const result = await cache.getOrSet("test-key", fetchFn);

			expect(result).toEqual(cachedData);
			expect(fetchFn).not.toHaveBeenCalled();
			expect(mockKV.put).not.toHaveBeenCalled();
		});

		it("should fetch and cache value if not exists", async () => {
			mockKV.get.mockResolvedValue(null);
			const freshData = { id: 2, name: "fresh" };
			const fetchFn = vi.fn().mockResolvedValue(freshData);

			const result = await cache.getOrSet("test-key", fetchFn);

			expect(result).toEqual(freshData);
			expect(fetchFn).toHaveBeenCalled();
			expect(mockKV.put).toHaveBeenCalledWith("zxcv:test-key", JSON.stringify(freshData), {
				expirationTtl: 300,
			});
		});

		it("should use custom TTL when fetching", async () => {
			mockKV.get.mockResolvedValue(null);
			const freshData = { data: "test" };
			const fetchFn = vi.fn().mockResolvedValue(freshData);

			await cache.getOrSet("test-key", fetchFn, 900);

			expect(mockKV.put).toHaveBeenCalledWith("zxcv:test-key", JSON.stringify(freshData), {
				expirationTtl: 900,
			});
		});
	});

	describe("generateSearchKey", () => {
		it("should generate consistent search key", () => {
			const params = {
				q: "Test Query",
				tags: "JavaScript, TypeScript",
				author: "TestUser",
				visibility: "public",
				sort: "created",
				order: "desc",
				limit: 10,
				offset: 0,
				userId: "user_123",
			};

			const key = Cache.generateSearchKey(params);

			expect(key).toContain("search:");
			expect(key).toContain('"q":"test query"');
			expect(key).toContain('"tags":"javascript, typescript"');
			expect(key).toContain('"author":"testuser"');
		});

		it("should handle empty parameters", () => {
			const key = Cache.generateSearchKey({});

			expect(key).toContain("search:");
			expect(key).toContain('"q":""');
			expect(key).toContain('"tags":""');
			expect(key).toContain('"author":""');
		});

		it("should normalize string parameters", () => {
			const params1 = { q: "  TEST  ", tags: "  JavaScript  " };
			const params2 = { q: "test", tags: "javascript" };

			const key1 = Cache.generateSearchKey(params1);
			const key2 = Cache.generateSearchKey(params2);

			expect(key1).toBe(key2);
		});

		it("should include all parameters in key", () => {
			const params = {
				q: "test",
				visibility: "private",
				sort: "updated",
				order: "asc",
				limit: 20,
				offset: 10,
			};

			const key = Cache.generateSearchKey(params);
			const parsed = JSON.parse(key.replace("search:", ""));

			expect(parsed.visibility).toBe("private");
			expect(parsed.sort).toBe("updated");
			expect(parsed.order).toBe("asc");
			expect(parsed.limit).toBe(20);
			expect(parsed.offset).toBe(10);
		});
	});
});

describe("createCache", () => {
	it("should create cache instance with environment config", () => {
		const mockEnv = {
			KV_CACHE: {
				get: vi.fn(),
				put: vi.fn(),
				delete: vi.fn(),
			} as any,
		} as Env;

		const cache = createCache(mockEnv);

		expect(cache).toBeInstanceOf(Cache);
		expect((cache as any).defaultTTL).toBe(300);
		expect((cache as any).namespace).toBe("zxcv");
	});
});
