// ─────────────────────────────────────────────
// Input sanitization
// Strips patterns that attempt to override system instructions
// or inject malicious directives into the AI prompt.
// ─────────────────────────────────────────────

const INJECTION_PATTERNS = [
  // Classic prompt injection phrases
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /you\s+are\s+now\s+(a\s+)?(?:different|new|another|evil|unrestricted)/gi,
  /act\s+as\s+(if\s+you\s+(are|were)\s+)?(?:an?\s+)?(?:evil|jailbreak|unrestricted|DAN)/gi,
  /\[\s*system\s*\]/gi,
  /<\s*system\s*>/gi,
  /###\s*(?:system|instructions?|prompt)/gi,
] as const;

/**
 * Removes prompt-injection attempts from user-supplied text.
 * Does NOT modify legitimate roleplay content — it only strips
 * phrases that attempt to override the system instruction.
 */
export function sanitizeUserInput(input: string): string {
  let sanitized = input;
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[filtered]');
  }
  return sanitized;
}

/**
 * Hard character limit to prevent runaway token consumption.
 * Trims and adds a note so the user knows their input was truncated.
 */
export function enforceInputLimit(input: string, maxChars = 2000): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars) + '… [input truncated]';
}

/**
 * Combined: sanitize then enforce length limit.
 */
export function processUserInput(input: string): string {
  return enforceInputLimit(sanitizeUserInput(input));
}
