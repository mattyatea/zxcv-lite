export type TimelineTimestampSource = "asr" | "asr-end" | "inferred";

export interface TimelineTimestampInput {
	id: string;
	text: string;
	asrStartMs?: number | null;
	asrEndMs?: number | null;
}

export interface TimelineTimestampOutput extends TimelineTimestampInput {
	timelineTimestampMs: number | null;
	timestampSource: TimelineTimestampSource | null;
}

export interface TimelineTimestampOptions {
	defaultGapMs?: number;
}

const DEFAULT_GAP_MS = 5_000;

export const assignTimelineTimestamps = (
	items: TimelineTimestampInput[],
	options: TimelineTimestampOptions = {},
): TimelineTimestampOutput[] => {
	const defaultGapMs = options.defaultGapMs ?? DEFAULT_GAP_MS;
	const outputs: TimelineTimestampOutput[] = items.map((item) => {
		if (typeof item.asrStartMs === "number") {
			return {
				...item,
				timelineTimestampMs: item.asrStartMs,
				timestampSource: "asr",
			};
		}

		if (typeof item.asrEndMs === "number") {
			return {
				...item,
				timelineTimestampMs: item.asrEndMs,
				timestampSource: "asr-end",
			};
		}

		return {
			...item,
			timelineTimestampMs: null,
			timestampSource: null,
		};
	});

	let index = 0;
	while (index < outputs.length) {
		if (outputs[index].timelineTimestampMs !== null) {
			index += 1;
			continue;
		}

		const gapStart = index;
		while (index < outputs.length && outputs[index].timelineTimestampMs === null) {
			index += 1;
		}
		const gapEnd = index - 1;
		const missingCount = gapEnd - gapStart + 1;
		const prevIndex = gapStart - 1;
		const nextIndex = index < outputs.length ? index : null;
		const prevTime =
			prevIndex >= 0 ? outputs[prevIndex].timelineTimestampMs : null;
		const nextTime =
			nextIndex !== null ? outputs[nextIndex].timelineTimestampMs : null;

		if (prevTime !== null && nextTime !== null) {
			if (nextTime > prevTime) {
				const step = (nextTime - prevTime) / (missingCount + 1);
				for (let offset = 0; offset < missingCount; offset += 1) {
					outputs[gapStart + offset] = {
						...outputs[gapStart + offset],
						timelineTimestampMs: prevTime + step * (offset + 1),
						timestampSource: "inferred",
					};
				}
			} else {
				for (let offset = 0; offset < missingCount; offset += 1) {
					outputs[gapStart + offset] = {
						...outputs[gapStart + offset],
						timelineTimestampMs: prevTime + defaultGapMs * (offset + 1),
						timestampSource: "inferred",
					};
				}
			}
			continue;
		}

		if (prevTime !== null) {
			for (let offset = 0; offset < missingCount; offset += 1) {
				outputs[gapStart + offset] = {
					...outputs[gapStart + offset],
					timelineTimestampMs: prevTime + defaultGapMs * (offset + 1),
					timestampSource: "inferred",
				};
			}
			continue;
		}

		if (nextTime !== null) {
			for (let offset = 0; offset < missingCount; offset += 1) {
				const remaining = missingCount - offset;
				outputs[gapStart + offset] = {
					...outputs[gapStart + offset],
					timelineTimestampMs: Math.max(
						0,
						nextTime - defaultGapMs * remaining,
					),
					timestampSource: "inferred",
				};
			}
			continue;
		}

		for (let offset = 0; offset < missingCount; offset += 1) {
			outputs[gapStart + offset] = {
				...outputs[gapStart + offset],
				timelineTimestampMs: defaultGapMs * offset,
				timestampSource: "inferred",
			};
		}
	}

	return outputs;
};
