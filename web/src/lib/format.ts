const dateFmt = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
}

const sizeFmt = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

/** Dateigrösse, z. B. "3.4 MB" */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${sizeFmt.format(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${sizeFmt.format(bytes / 1024 ** 2)} MB`;
  return `${sizeFmt.format(bytes / 1024 ** 3)} GB`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Debounce für Autosave u. ä. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args: A) => {
    clearTimeout(t);
    fn(...args);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function uid() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
