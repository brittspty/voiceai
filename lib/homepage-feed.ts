/** Auto-advance only when nobody is pointing at the feed and motion is allowed. */
export function feedShouldAdvance(input: { hovering: boolean; focused: boolean; reducedMotion: boolean }) {
  return !input.hovering && !input.focused && !input.reducedMotion;
}
