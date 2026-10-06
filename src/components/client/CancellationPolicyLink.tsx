/** Enlace a la política de cancelación; abre en otra pestaña para no perder el diálogo. */
export function CancellationPolicyLink() {
  return (
    <a
      href="/terminos-y-condiciones"
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary underline underline-offset-2 hover:text-secondary"
    >
      Ver política de cancelación
    </a>
  );
}
