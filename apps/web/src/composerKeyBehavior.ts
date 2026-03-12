export function shouldSubmitComposerOnEnter(options: {
  isMobileViewport: boolean;
  shiftKey: boolean;
  canDispatch: boolean;
}): boolean {
  return !options.shiftKey && !options.isMobileViewport && options.canDispatch;
}
