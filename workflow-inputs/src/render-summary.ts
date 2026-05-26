/**
 * Markdown rendering for the job summary.
 *
 * Produces a single GitHub-Flavored Markdown table summarizing the inputs of
 * the current workflow run. Designed to be appended to `$GITHUB_STEP_SUMMARY`
 * (via `core.summary.addRaw().write()`) or returned as an output for
 * downstream steps.
 */

import { maskValue } from "./mask.ts";
import type { ResolvedInput } from "./parse-workflow.ts";

export interface RenderOptions {
  /** Heading text (rendered as H2). */
  title: string;
  /** Whether to include the "(default)" tag for inputs falling back to their default. */
  showDefaults: boolean;
  /** Compiled patterns for masking secret-like values. */
  maskPatterns: readonly RegExp[];
}

/**
 * Renders the resolved inputs as a markdown summary section.
 *
 * The shape is intentionally simple: a heading followed by a four-column
 * table (Name, Value, Type, Description). Columns are omitted when the data
 * is uniformly empty across all rows, so a workflow that doesn't declare
 * descriptions doesn't end up with a column full of dashes.
 *
 * If there are no inputs to display, returns a heading plus a short italic
 * note rather than an empty table.
 */
export function renderSummary(inputs: readonly ResolvedInput[], options: RenderOptions): string {
  const lines: string[] = [`## ${options.title}`, ""];

  if (inputs.length === 0) {
    lines.push("_No inputs were provided for this workflow run._");
    lines.push("");
    return lines.join("\n");
  }

  const showType = inputs.some((i) => i.schema?.type !== undefined);
  const showDescription = inputs.some(
    (i) => i.schema?.description !== undefined && i.schema.description.length > 0,
  );

  const headers: string[] = ["Name", "Value"];
  if (showType) headers.push("Type");
  if (showDescription) headers.push("Description");

  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const input of inputs) {
    const row: string[] = [escapeCell(input.name), formatValue(input, options)];
    if (showType) row.push(formatType(input));
    if (showDescription) row.push(escapeCell(input.schema?.description ?? ""));
    lines.push(`| ${row.join(" | ")} |`);
  }

  lines.push("");
  return lines.join("\n");
}

function formatValue(input: ResolvedInput, options: RenderOptions): string {
  if (input.value === undefined) {
    return input.provenance === "missing" ? "_(missing)_" : "_(empty)_";
  }

  const masked = maskValue(input.name, input.value, options.maskPatterns);
  const display = `\`${escapeInlineCode(masked)}\``;

  if (input.provenance === "default" && options.showDefaults) {
    return `${display} _(default)_`;
  }
  if (input.provenance === "runtime-only") {
    return `${display} _(runtime-only)_`;
  }
  return display;
}

function formatType(input: ResolvedInput): string {
  if (!input.schema) return "";
  const { type, options } = input.schema;
  // For choice inputs, append the option list so readers know the allowed set
  // even after the run has dispatched.
  if (type === "choice" && options && options.length > 0) {
    return `choice (${options.map((o) => `\`${escapeInlineCode(o)}\``).join(", ")})`;
  }
  return type;
}

/**
 * Escapes a value for inclusion as a GFM table cell. Handles pipe characters
 * (which would otherwise break the column boundary) and newlines (which would
 * break the row).
 */
function escapeCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Escapes a value for inclusion inside backticks. Backticks themselves cannot
 * appear inside a single-backtick span, so we substitute a unicode lookalike
 * for the rare case where the input value contains one. Pipes still need
 * escaping since the entire cell is a table cell.
 */
function escapeInlineCode(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/`/g, "\u02cb") // modifier letter grave accent
    .replace(/\|/g, "\\|");
}
