/** Starts a guided tour on the current page (the tour host lives in the app and canvas layouts). */
export const TOUR_EVENT = "wp:start-tour";

export function startTour(id: string) {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: id }));
}
