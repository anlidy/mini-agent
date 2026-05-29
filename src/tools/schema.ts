export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateJsonSchemaValue(_value: unknown, _schema: Record<string, unknown>): ValidationResult {
  return { ok: true, errors: [] };
}
