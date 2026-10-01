import type { Campaign } from "./types";

/** Die aktuell geöffnete Kampagne (für Tools und Kopfzeile). */
export const current = $state({ campaign: null as Campaign | null });
