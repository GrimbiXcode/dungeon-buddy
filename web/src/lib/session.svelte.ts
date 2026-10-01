import type { AuthInfo, User } from "./types";

/** Angemeldeter Benutzer und Anmeldeinfos der Instanz. */
export const session = $state({
  user: null as User | null,
  info: null as AuthInfo | null,
  loaded: false,
});

/** Einheitensystem des Benutzers (Standard: imperial wie in den Regelwerken). */
export function unitSystem(): "imperial" | "metric" {
  return session.user?.settings.units ?? "imperial";
}
