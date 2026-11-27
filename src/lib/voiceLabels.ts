/** Label for the picker's reset row; flags a default the list no longer offers. */
export function defaultRowLabel(list: {
	voices: { id: string }[];
	authorVoice: string | null;
	platformVoice: string;
}): string {
	const id = list.authorVoice ?? list.platformVoice;
	return list.voices.some((v) => v.id === id)
		? `Use my default (${id})`
		: `Use my default (${id}, no longer available)`;
}

/** aria-label for a row's preview button. */
export function previewAriaLabel(
	displayName: string,
	playing: boolean,
): string {
	return `${playing ? "Stop" : "Play"} ${displayName} preview`;
}
