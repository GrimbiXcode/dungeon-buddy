type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
};

export const confirmState = $state({ request: null as ConfirmRequest | null });

/** Bestätigungsdialog als Promise. */
export function confirmDialog(
  message: string,
  opts: { title?: string; confirmLabel?: string; danger?: boolean } = {}
): Promise<boolean> {
  return new Promise(resolve => {
    confirmState.request = {
      title: opts.title ?? "Bist du sicher?",
      message,
      confirmLabel: opts.confirmLabel ?? "Löschen",
      danger: opts.danger ?? true,
      resolve,
    };
  });
}
