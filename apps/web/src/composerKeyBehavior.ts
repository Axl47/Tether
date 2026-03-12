export function shouldSubmitComposerOnEnter(options: {
  isMobileViewport: boolean;
  shiftKey: boolean;
  canSubmit: boolean;
}): boolean {
  return !options.shiftKey && !options.isMobileViewport && options.canSubmit;
}
