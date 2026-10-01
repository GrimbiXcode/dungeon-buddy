import type { AuthInfo, User } from "./types";

/** Angemeldeter Benutzer und Anmeldeinfos der Instanz. */
export const session = $state({
  user: null as User | null,
  info: null as AuthInfo | null,
  loaded: false,
});
