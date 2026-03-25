/** Lightweight className merger — avoids pulling in clsx as a dep */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
