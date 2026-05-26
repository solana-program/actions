import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_MASK_PATTERN, parseMaskPatterns } from "./mask.ts";
import type { ResolvedInput } from "./parse-workflow.ts";
import { renderSummary } from "./render-summary.ts";

const defaultOptions = {
  title: "Workflow inputs",
  showDefaults: true,
  maskPatterns: parseMaskPatterns(DEFAULT_MASK_PATTERN),
};

describe("renderSummary", () => {
  it("renders the heading and an empty-state note when there are no inputs", () => {
    const md = renderSummary([], defaultOptions);
    expect(md).toContain("## Workflow inputs");
    expect(md).toContain("_No inputs were provided");
    expect(md).not.toContain("| Name |");
  });

  it("renders a basic table for runtime-only inputs (no schema)", () => {
    const inputs: ResolvedInput[] = [{ name: "foo", value: "bar", provenance: "runtime-only" }];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).toContain("| Name | Value |");
    expect(md).toContain("| foo | `bar` _(runtime-only)_ |");
    // No Type or Description columns when nothing has a schema.
    expect(md).not.toContain("| Type |");
    expect(md).not.toContain("Description");
  });

  it("includes Type and Description columns when at least one input has them", () => {
    const inputs: ResolvedInput[] = [
      {
        name: "environment",
        value: "production",
        provenance: "runtime",
        schema: {
          name: "environment",
          type: "choice",
          required: true,
          options: ["staging", "production"],
          description: "Where to deploy",
        },
      },
      {
        name: "dry-run",
        value: "false",
        provenance: "default",
        schema: {
          name: "dry-run",
          type: "boolean",
          required: false,
          default: "false",
        },
      },
    ];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).toContain("| Name | Value | Type | Description |");
    expect(md).toContain(
      "| environment | `production` | choice (`staging`, `production`) | Where to deploy |",
    );
    expect(md).toContain("| dry-run | `false` _(default)_ | boolean |  |");
  });

  it("omits the (default) tag when showDefaults is false", () => {
    const inputs: ResolvedInput[] = [
      {
        name: "foo",
        value: "bar",
        provenance: "default",
        schema: { name: "foo", type: "string", required: false, default: "bar" },
      },
    ];
    const md = renderSummary(inputs, { ...defaultOptions, showDefaults: false });
    expect(md).not.toContain("_(default)_");
    expect(md).toContain("| foo | `bar` | string |");
  });

  it("redacts values when the input name matches a mask pattern", () => {
    const inputs: ResolvedInput[] = [
      { name: "github_token", value: "ghp_supersecret", provenance: "runtime" },
    ];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).not.toContain("ghp_supersecret");
    expect(md).toContain("***");
  });

  it("shows _(missing)_ for required inputs with no value", () => {
    const inputs: ResolvedInput[] = [
      {
        name: "version",
        value: undefined,
        provenance: "missing",
        schema: { name: "version", type: "string", required: true },
      },
    ];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).toContain("| version | _(missing)_ | string |");
  });

  it("escapes pipe characters in cells to keep the table well-formed", () => {
    const inputs: ResolvedInput[] = [{ name: "pattern", value: "foo|bar", provenance: "runtime" }];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).toContain("foo\\|bar");
  });

  it("replaces newlines in cell values with spaces", () => {
    const inputs: ResolvedInput[] = [
      { name: "multiline", value: "line1\nline2", provenance: "runtime" },
    ];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).toContain("line1 line2");
    // The rendered table row should still be a single line.
    const tableRows = md.split("\n").filter((l) => l.startsWith("| multiline"));
    expect(tableRows).toHaveLength(1);
  });

  it("handles backticks within values without breaking the inline code span", () => {
    const inputs: ResolvedInput[] = [{ name: "raw", value: "a `tick`", provenance: "runtime" }];
    const md = renderSummary(inputs, defaultOptions);
    // The backtick character itself shouldn't appear unescaped inside the cell.
    expect(md).toContain("| raw | `a \u02cbtick\u02cb` |");
  });

  it("uses the supplied title", () => {
    const md = renderSummary([], { ...defaultOptions, title: "Deploy parameters" });
    expect(md.startsWith("## Deploy parameters")).toBe(true);
  });

  it("includes only the Type column when no descriptions are present", () => {
    const inputs: ResolvedInput[] = [
      {
        name: "foo",
        value: "bar",
        provenance: "runtime",
        schema: { name: "foo", type: "string", required: false },
      },
    ];
    const md = renderSummary(inputs, defaultOptions);
    expect(md).toContain("| Name | Value | Type |");
    expect(md).not.toContain("Description");
  });
});
