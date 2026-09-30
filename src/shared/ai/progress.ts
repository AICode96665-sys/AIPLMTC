// The stages the chat shows while an answer is being made ("thinking" view).
// The back end sends a stage's `doing` text when it starts; the chat shows the
// earlier stages with their `done` text and a tick.

export const STAGES = {
  understand: { doing: 'Thinking about your request…', done: 'Understood your request' },
  search: { doing: 'Looking through your API…', done: 'Found matching operations' },
  choose: { doing: 'Choosing the best operations…', done: 'Chose the operations' },
  assemble: { doing: 'Putting the steps together…', done: 'Put the steps together' },
  java: { doing: 'Writing the Java code…', done: 'Wrote the Java code' }
} as const

/** The `done` text for a stage's `doing` text (unknown text is returned as is). */
export function doneText(doing: string): string {
  return Object.values(STAGES).find((s) => s.doing === doing)?.done ?? doing
}
