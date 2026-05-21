/**
 * Action entrypoint.
 *
 * Wires together the three pure modules (mask, parse-workflow, render-summary)
 * with the GitHub Actions runtime: reads action inputs, resolves the calling
 * workflow's input schema, applies masking, writes the markdown summary, and
 * exposes it as the `summary` output.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { DEFAULT_MASK_PATTERN, parseMaskPatterns } from "./mask.ts";
import {
  type InputSchema,
  mergeInputs,
  parseWorkflowSchema,
  workflowPathFromRef,
} from "./parse-workflow.ts";
import { renderSummary } from "./render-summary.ts";

interface ActionInputs {
  title: string;
  inputsJson: string;
  maskPatterns: string;
  showDefaults: boolean;
}

function readActionInputs(): ActionInputs {
  return {
    title: core.getInput("title") || "Workflow inputs",
    inputsJson: core.getInput("inputs-json"),
    maskPatterns: core.getInput("mask-patterns") || DEFAULT_MASK_PATTERN,
    showDefaults: core.getBooleanInput("show-defaults"),
  };
}

/**
 * Coerces an arbitrary value to a string suitable for display in the summary.
 *
 * Workflow inputs on the wire are strings even when typed (booleans and
 * numbers arrive as "true"/"42"). For defensive resilience against payloads
 * that include JSON-typed values (e.g. when `inputs-json` is hand-crafted),
 * we accept primitives directly and JSON-stringify objects/arrays rather
 * than letting them collapse to `[object Object]`.
 */
function coerceToString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function inputsRecordFromObject(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const coerced = coerceToString(v);
    if (coerced !== undefined) out[k] = coerced;
  }
  return out;
}

/**
 * Reads the runtime input values that triggered the workflow.
 *
 * Priority order:
 *   1. `inputs-json` action input (if provided) — explicit, most reliable.
 *   2. `github.event.inputs` — populated for `workflow_dispatch` and
 *      `workflow_call` events.
 *
 * All values are coerced to strings (see `coerceToString`).
 */
function readRuntimeInputs(actionInputs: ActionInputs): Record<string, string> {
  if (actionInputs.inputsJson.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(actionInputs.inputsJson);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse inputs-json: ${message}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("inputs-json must be a JSON object.");
    }
    return inputsRecordFromObject(parsed as Record<string, unknown>);
  }

  const eventInputs = github.context.payload["inputs"];
  if (eventInputs && typeof eventInputs === "object" && !Array.isArray(eventInputs)) {
    return inputsRecordFromObject(eventInputs as Record<string, unknown>);
  }

  return {};
}

/**
 * Tries to read the calling workflow's YAML file from the local workspace.
 *
 * `GITHUB_WORKFLOW_REF` has the form `<owner>/<repo>/<path>@<ref>`. If the
 * repository has been checked out (the recommended setup), the workflow file
 * lives at `${GITHUB_WORKSPACE}/<path>` and we can read it directly.
 *
 * Returns the raw YAML string, or `undefined` if the file isn't present
 * locally — in which case the caller can decide whether to fall back to the
 * GitHub API or simply proceed with runtime values only.
 */
async function readWorkflowFromWorkspace(): Promise<string | undefined> {
  const ref = process.env["GITHUB_WORKFLOW_REF"];
  const workspace = process.env["GITHUB_WORKSPACE"];
  const workflowPath = workflowPathFromRef(ref);
  if (!workflowPath || !workspace) {
    core.debug(
      `No GITHUB_WORKFLOW_REF (${String(ref)}) or GITHUB_WORKSPACE (${String(workspace)}); skipping workspace read.`,
    );
    return undefined;
  }

  const fullPath = path.join(workspace, workflowPath);
  try {
    return await fs.readFile(fullPath, "utf8");
  } catch (err) {
    core.debug(`Could not read workflow from workspace at ${fullPath}: ${String(err)}`);
    return undefined;
  }
}

/**
 * Resolves the input schema for the current workflow run. Tries the local
 * workspace first; logs a warning and returns an empty schema if the file
 * can't be located, so the action degrades gracefully rather than failing.
 */
async function resolveSchema(): Promise<InputSchema[]> {
  const yaml = await readWorkflowFromWorkspace();
  if (!yaml) {
    core.warning(
      "Could not read the calling workflow file from the workspace. " +
        "Run actions/checkout before this action to enable rich input descriptions, " +
        "or pass inputs-json explicitly. The summary will fall back to runtime values only.",
    );
    return [];
  }

  const schema = parseWorkflowSchema(yaml);
  // Combine workflow_dispatch and workflow_call schemas. In practice only one
  // of these will be active for a given run, but if both are declared the
  // union is the correct view: any of those names may appear in `inputs`.
  const merged = new Map<string, InputSchema>();
  for (const input of [...schema.workflowDispatch, ...schema.workflowCall]) {
    merged.set(input.name, input);
  }
  return [...merged.values()];
}

export async function run(): Promise<void> {
  const actionInputs = readActionInputs();
  const maskPatterns = parseMaskPatterns(actionInputs.maskPatterns);
  const runtime = readRuntimeInputs(actionInputs);
  const schema = await resolveSchema();
  const resolved = mergeInputs(schema, runtime);

  const markdown = renderSummary(resolved, {
    title: actionInputs.title,
    showDefaults: actionInputs.showDefaults,
    maskPatterns,
  });

  await core.summary.addRaw(markdown).write();
  core.setOutput("summary", markdown);

  core.info(
    `Rendered ${resolved.length} input${resolved.length === 1 ? "" : "s"} to the job summary.`,
  );
}

// Top-level invocation. Errors are reported via `core.setFailed` so the step
// is marked as failed in the run UI without printing a node-style stack trace.
run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(message);
});
