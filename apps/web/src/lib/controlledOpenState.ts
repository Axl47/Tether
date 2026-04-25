export function shouldApplyControlledOpenChange(currentOpen: boolean, nextOpen: boolean): boolean {
  return currentOpen !== nextOpen;
}
