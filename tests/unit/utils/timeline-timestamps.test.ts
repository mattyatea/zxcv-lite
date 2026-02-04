import { describe, expect, it } from "vitest";

import {
	assignTimelineTimestamps,
	type TimelineTimestampInput,
} from "~/server/utils/timelineTimestamps";

const createEntry = (
	id: string,
	options: Partial<TimelineTimestampInput> = {},
): TimelineTimestampInput => ({
	id,
	text: options.text ?? `entry-${id}`,
	asrStartMs: options.asrStartMs ?? null,
	asrEndMs: options.asrEndMs ?? null,
});

describe("assignTimelineTimestamps", () => {
	it("keeps ASR start timestamps when present", () => {
		const entries = [
			createEntry("a", { asrStartMs: 5_000 }),
			createEntry("b", { asrStartMs: 12_000 }),
		];

		const result = assignTimelineTimestamps(entries);

		expect(result[0].timelineTimestampMs).toBe(5_000);
		expect(result[0].timestampSource).toBe("asr");
		expect(result[1].timelineTimestampMs).toBe(12_000);
		expect(result[1].timestampSource).toBe("asr");
	});

	it("falls back to ASR end timestamps when start is missing", () => {
		const entries = [
			createEntry("a", { asrEndMs: 8_500 }),
			createEntry("b", { asrEndMs: 14_200 }),
		];

		const result = assignTimelineTimestamps(entries);

		expect(result[0].timelineTimestampMs).toBe(8_500);
		expect(result[0].timestampSource).toBe("asr-end");
		expect(result[1].timelineTimestampMs).toBe(14_200);
		expect(result[1].timestampSource).toBe("asr-end");
	});

	it("interpolates missing timestamps between known ASR times", () => {
		const entries = [
			createEntry("a", { asrStartMs: 0 }),
			createEntry("b"),
			createEntry("c"),
			createEntry("d", { asrStartMs: 12_000 }),
		];

		const result = assignTimelineTimestamps(entries);

		expect(result[1].timelineTimestampMs).toBe(4_000);
		expect(result[2].timelineTimestampMs).toBe(8_000);
		expect(result[1].timestampSource).toBe("inferred");
		expect(result[2].timestampSource).toBe("inferred");
	});

	it("uses the default gap when trailing timestamps are missing", () => {
		const entries = [
			createEntry("a", { asrStartMs: 2_000 }),
			createEntry("b"),
			createEntry("c"),
		];

		const result = assignTimelineTimestamps(entries, { defaultGapMs: 3_000 });

		expect(result[1].timelineTimestampMs).toBe(5_000);
		expect(result[2].timelineTimestampMs).toBe(8_000);
	});

	it("backfills when leading timestamps are missing", () => {
		const entries = [
			createEntry("a"),
			createEntry("b"),
			createEntry("c", { asrStartMs: 9_000 }),
		];

		const result = assignTimelineTimestamps(entries, { defaultGapMs: 2_000 });

		expect(result[0].timelineTimestampMs).toBe(5_000);
		expect(result[1].timelineTimestampMs).toBe(7_000);
		expect(result[2].timelineTimestampMs).toBe(9_000);
	});

	it("assigns a default timeline when no ASR timestamps exist", () => {
		const entries = [createEntry("a"), createEntry("b"), createEntry("c")];

		const result = assignTimelineTimestamps(entries, { defaultGapMs: 1_500 });

		expect(result.map((entry) => entry.timelineTimestampMs)).toEqual([
			0,
			1_500,
			3_000,
		]);
	});
});
