const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /you\s+are\s+now\s+(a\s+)?(?:different|new|another|evil|unrestricted)/gi,
  /act\s+as\s+(if\s+you\s+(are|were)\s+)?(?:an?\s+)?(?:evil|jailbreak|unrestricted|DAN)/gi,
  /\[\s*system\s*\]/gi,
  /<\s*system\s*>/gi,
  /###\s*(?:system|instructions?|prompt)/gi,
];

export function sanitizeUserInput(input: string): string {
  let s = input;
  for (const p of INJECTION_PATTERNS) s = s.replace(p, '[filtered]');
  return s;
}

export function enforceInputLimit(input: string, maxChars = 2000): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars) + '… [input truncated]';
}

export function processUserInput(input: string): string {
  return enforceInputLimit(sanitizeUserInput(input));
}
