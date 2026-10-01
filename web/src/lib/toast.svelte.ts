export type Toast = { id: number; message: string; kind: "info" | "error" | "success" };

export const toasts = $state<Toast[]>([]);
let next = 1;

export function toast(message: string, kind: Toast["kind"] = "info", ms = 3500) {
  const id = next++;
  toasts.push({ id, message, kind });
  setTimeout(() => {
    const i = toasts.findIndex(t => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : String(e), "error", 5000);
}
