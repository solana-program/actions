/**
 * Workflow YAML parsing.
 *
 * GitHub Actions exposes the values of dispatched inputs at runtime via
 * `github.event.inputs`, but it does NOT expose the input *schema* (descriptions,
 * types, defaults, options, required-ness). To render a rich summary, this
 * module reads the calling workflow's YAML file and extracts the declared
 * input schema from `on.workflow_dispatch.inputs` and `on.workflow_call.inputs`.
 *
 * The path to the calling workflow is resolved from `GITHUB_WORKFLOW_REF`,
 * which has the shape: `owner/repo/.github/workflows/file.yml@refs/heads/main`.
 */

import { load as parseYaml } from "js-yaml";

/** A workflow input as declared in the workflow YAML schema. */
export type InputType = "string" | "choice" | "boolean" | "number" | "environment";

export interface InputSchema {
  /** The input name (the key in the YAML). */
  name: string;
  /** The declared type, defaulting to `'string'` when omitted. */
  type: InputType;
  /** Free-form description from the YAML, if present. */
  description?: string;
  /** Default value as a string, if a default was declared. */
  default?: string;
  /** Whether the input was declared `required: true`. */
  required: boolean;
  /** For `choice` inputs, the list of allowed options. */
  options?: string[];
}

export interface WorkflowSchema {
  /** Inputs declared under `on.workflow_dispatch.inputs`. */
  workflowDispatch: InputSchema[];
  /** Inputs declared under `on.workflow_call.inputs`. */
  workflowCall: InputSchema[];
}

/**
 * Parses a workflow YAML document and returns the input schemas declared on
 * `workflow_dispatch` and `workflow_call`.
 *
 * Returns empty arrays for triggers that are not present. Tolerates the
 * `on:` field being a string (`on: workflow_dispatch`) or a list, in which
 * case there are no declared inputs to extract.
 */
export function parseWorkflowSchema(yamlContent: string): WorkflowSchema {
  let doc: unknown;
  try {
    doc = parseYaml(yamlContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse workflow YAML: ${message}`);
  }

  if (!isObject(doc)) {
    return { workflowDispatch: [], workflowCall: [] };
  }

  // YAML's bare `on` key is parsed as boolean `true` by some loaders because
  // `on` is a YAML 1.1 truthy literal. js-yaml v4 follows YAML 1.2, where `on`
  // is a plain string, so the field key is "on". We still defensively handle
  // both spellings for resilience.
  const onField =
    (doc as Record<string, unknown>)["on"] ??
    (doc as Record<string, unknown>)[true as unknown as string];

  if (!isObject(onField)) {
    return { workflowDispatch: [], workflowCall: [] };
  }

  return {
    workflowDispatch: extractInputs(onField["workflow_dispatch"]),
    workflowCall: extractInputs(onField["workflow_call"]),
  };
}

function extractInputs(trigger: unknown): InputSchema[] {
  if (!isObject(trigger)) return [];
  const inputs = trigger["inputs"];
  if (!isObject(inputs)) return [];

  const result: InputSchema[] = [];
  for (const [name, raw] of Object.entries(inputs)) {
    if (!isObject(raw)) {
      // An input with a value that isn't a mapping is malformed; skip it
      // rather than blowing up the whole summary.
      continue;
    }
    result.push(coerceInput(name, raw));
  }
  return result;
}

function coerceInput(name: string, raw: Record<string, unknown>): InputSchema {
  const type = coerceType(raw["type"]);
  const description = typeof raw["description"] === "string" ? raw["description"] : undefined;
  const required = raw["required"] === true;
  const defaultValue = stringifyDefault(raw["default"]);
  const options = coerceOptions(raw["options"]);

  return {
    name,
    type,
    ...(description !== undefined ? { description } : {}),
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    required,
    ...(options !== undefined ? { options } : {}),
  };
}

function coerceType(value: unknown): InputType {
  if (value === "choice" || value === "boolean" || value === "number" || value === "environment") {
    return value;
  }
  return "string";
}

function coerceOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((v) => String(v));
}

function stringifyDefault(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  // For complex defaults (arrays, objects), JSON-stringify rather than dropping.
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges a declared input schema with the runtime input values, producing a
 * unified view that includes provenance information.
 *
 * For each declared input, the runtime value (from `github.event.inputs` or
 * an `inputs-json` override) takes precedence; if no runtime value was
 * provided, the declared default is used and tagged as such.
 *
 * Runtime values that have no matching declaration are still included in the
 * output (with `provenance: 'runtime-only'`) so the summary can surface them
 * — useful for `repository_dispatch`-style payloads or when the YAML can't
 * be located.
 */
export type Provenance = "runtime" | "default" | "runtime-only" | "missing";

export interface ResolvedInput {
  name: string;
  /** The value to display, or undefined when the input is required but missing. */
  value: string | undefined;
  /** Where the value came from. */
  provenance: Provenance;
  /** The declared schema, if available. */
  schema?: InputSchema;
}

export function mergeInputs(
  schema: InputSchema[],
  runtime: Record<string, string>,
): ResolvedInput[] {
  const result: ResolvedInput[] = [];
  const seen = new Set<string>();

  for (const declared of schema) {
    seen.add(declared.name);
    const runtimeValue = runtime[declared.name];
    if (runtimeValue !== undefined && runtimeValue !== "") {
      result.push({
        name: declared.name,
        value: runtimeValue,
        provenance: "runtime",
        schema: declared,
      });
    } else if (declared.default !== undefined) {
      result.push({
        name: declared.name,
        value: declared.default,
        provenance: "default",
        schema: declared,
      });
    } else {
      result.push({
        name: declared.name,
        value: undefined,
        provenance: "missing",
        schema: declared,
      });
    }
  }

  for (const [name, value] of Object.entries(runtime)) {
    if (seen.has(name)) continue;
    result.push({
      name,
      value,
      provenance: "runtime-only",
    });
  }

  return result;
}

/**
 * Parses a `GITHUB_WORKFLOW_REF` value and returns the path to the workflow
 * file relative to the repository root.
 *
 * The format is `<owner>/<repo>/<path>@<ref>`, where `<path>` is something
 * like `.github/workflows/deploy.yml`.
 *
 * Returns `undefined` if the ref is missing or malformed.
 */
export function workflowPathFromRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  // Strip the trailing @ref.
  const atIndex = ref.lastIndexOf("@");
  const withoutRef = atIndex >= 0 ? ref.slice(0, atIndex) : ref;
  // Drop the owner/repo prefix.
  const parts = withoutRef.split("/");
  if (parts.length < 3) return undefined;
  const path = parts.slice(2).join("/");
  return path.length > 0 ? path : undefined;
}
