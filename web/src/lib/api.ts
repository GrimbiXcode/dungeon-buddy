import { session } from "./session.svelte";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

/**
 * Dünne Hülle um fetch für die JSON-API. Wirft ApiError mit der
 * (deutschen) Fehlermeldung des Servers.
 */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Keine Verbindung zum Server. Bist du offline?");
  }
  if (resp.status === 204) return undefined as T;
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    if (resp.status === 401 && !path.startsWith("/api/auth/")) session.user = null;
    // Während der Nutzung gesperrt: App zeigt die Sperrseite
    if (resp.status === 403 && (data as { error?: string })?.error === "Konto gesperrt." && session.user && !session.user.blockedAt) {
      session.user = { ...session.user, blockedAt: new Date().toISOString() };
    }
    throw new ApiError(resp.status, (data as { error?: string })?.error ?? `Fehler ${resp.status}`);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const del = (path: string, body?: unknown) => api<void>(path, { method: "DELETE", body });

/** Basis-URL für kampagnenbezogene Tool-Daten. */
export const campaignApi = (campaignId: string, tool: string) => `/api/campaigns/${campaignId}/${tool}`;

/**
 * Datei hochladen (multipart/form-data). XMLHttpRequest statt fetch, weil
 * nur so der Upload-Fortschritt verfügbar ist. Felder gehen vor der Datei,
 * damit der Server sie vor dem Lesen der Datei kennt.
 */
export function upload<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
  opts: { method?: "POST" | "PUT"; onprogress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method ?? "POST", path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = e => e.lengthComputable && opts.onprogress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* kein JSON, z. B. Fehlerseite eines Proxys */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      if (xhr.status === 401) session.user = null;
      reject(new ApiError(xhr.status, (data as { error?: string })?.error ?? `Fehler ${xhr.status}`));
    };
    xhr.onerror = () => reject(new ApiError(0, "Keine Verbindung zum Server. Bist du offline?"));
    xhr.onabort = () => reject(new DOMException("Abgebrochen", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
