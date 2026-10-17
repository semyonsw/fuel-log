/**
 * Whether the tab bar shows its names under the icons.
 *
 * The bar is icons only; a long press on any tab reveals all three names, and
 * the next touch anywhere outside the bar hides them again. A scroll starts
 * with a touch, so "touch outside" covers scrolling too, without every screen
 * having to report its scroll events. Touches inside the bar keep the names up,
 * so the user can read them and then tap the tab they were looking for.
 */

export type TabLabelEvent = 'longPress' | 'touchInBar' | 'touchOutside';

export function nextLabelsShown(shown: boolean, event: TabLabelEvent): boolean {
  switch (event) {
    case 'longPress':
      return true;
    case 'touchInBar':
      return shown;
    case 'touchOutside':
      return false;
  }
}
