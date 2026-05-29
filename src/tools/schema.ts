export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

type JSONSchemaType = "string" | "integer" | "number" | "boolean" | "array" | "object";

function schemaType(schema: Record<string, unknown>): JSONSchemaType | undefined {
  const raw = schema.type;
  if (Array.isArray(raw)) {
    return raw.find((item): item is JSONSchemaType => typeof item === "string" && item !== "null");
  }
  return typeof raw === "string" ? raw as JSONSchemaType : undefined;
}

function isNullable(schema: Record<string, unknown>): boolean {
  return schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes("null"));
}

function propertySchemas(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }
  return properties as Record<string, Record<string, unknown>>;
}

function requiredProperties(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
}

function labelFor(path: string): string {
  return path || "parameter";
}

function childPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

export function castJsonSchemaValue(value: unknown, schema: Record<string, unknown>): unknown {
  const type = schemaType(schema);

  if (value === null || value === undefined) {
    return value;
  }

  if (type === "string") {
    return typeof value === "string" ? value : String(value);
  }

  if (type === "integer" && typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : value;
  }

  if (type === "number" && typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (type === "boolean" && typeof value === "string") {
    const lowered = value.toLowerCase();
    if (["true", "1", "yes"].includes(lowered)) {
      return true;
    }
    if (["false", "0", "no"].includes(lowered)) {
      return false;
    }
    return value;
  }

  if (type === "array" && Array.isArray(value)) {
    const itemSchema = schema.items;
    if (!itemSchema || typeof itemSchema !== "object" || Array.isArray(itemSchema)) {
      return value;
    }
    return value.map((item) => castJsonSchemaValue(item, itemSchema as Record<string, unknown>));
  }

  if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const properties = propertySchemas(schema);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        properties[key] ? castJsonSchemaValue(item, properties[key]) : item
      ])
    );
  }

  return value;
}

export function validateJsonSchemaValue(
  value: unknown,
  schema: Record<string, unknown>,
  path = ""
): string[] {
  const type = schemaType(schema);
  const label = labelFor(path);

  if (value === null || value === undefined) {
    return isNullable(schema) ? [] : type === undefined ? [] : [`${label} should be ${type}`];
  }

  const errors: string[] = [];

  if (type === "string" && typeof value !== "string") {
    return [`${label} should be string`];
  }
  if (type === "integer" && (!Number.isInteger(value) || typeof value !== "number")) {
    return [`${label} should be integer`];
  }
  if (type === "number" && (typeof value !== "number" || Number.isNaN(value))) {
    return [`${label} should be number`];
  }
  if (type === "boolean" && typeof value !== "boolean") {
    return [`${label} should be boolean`];
  }
  if (type === "array" && !Array.isArray(value)) {
    return [`${label} should be array`];
  }
  if (type === "object" && (typeof value !== "object" || Array.isArray(value))) {
    return [`${label} should be object`];
  }

  const enumValues = schema.enum;
  if (Array.isArray(enumValues) && !enumValues.includes(value)) {
    errors.push(`${label} must be one of ${enumValues.join(", ")}`);
  }

  if ((type === "integer" || type === "number") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${label} must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${label} must be <= ${schema.maximum}`);
    }
  }

  if (type === "string" && typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${label} must be at least ${schema.minLength} chars`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${label} must be at most ${schema.maxLength} chars`);
    }
  }

  if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const properties = propertySchemas(schema);
    for (const key of requiredProperties(schema)) {
      if (!(key in obj)) {
        errors.push(`missing required ${childPath(path, key)}`);
      }
    }
    for (const [key, item] of Object.entries(obj)) {
      const propertySchema = properties[key];
      if (propertySchema) {
        errors.push(...validateJsonSchemaValue(item, propertySchema, childPath(path, key)));
      }
    }
  }

  if (type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${label} must have at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${label} must be at most ${schema.maxItems} items`);
    }
    const itemSchema = schema.items;
    if (itemSchema && typeof itemSchema === "object" && !Array.isArray(itemSchema)) {
      value.forEach((item, index) => {
        errors.push(...validateJsonSchemaValue(item, itemSchema as Record<string, unknown>, `${path}[${index}]`));
      });
    }
  }

  return errors;
}
