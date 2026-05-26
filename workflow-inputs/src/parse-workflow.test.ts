import { describe, expect, it } from "vite-plus/test";
import { mergeInputs, parseWorkflowSchema, workflowPathFromRef } from "./parse-workflow.ts";

describe("parseWorkflowSchema", () => {
  it("extracts workflow_dispatch inputs with their schema", () => {
    const yaml = `
name: Deploy
on:
  workflow_dispatch:
    inputs:
      environment:
        description: Where to deploy
        type: choice
        options:
          - staging
          - production
        default: staging
        required: true
      dry-run:
        description: Skip the actual deploy
        type: boolean
        default: false
      version:
        type: string
`;
    const schema = parseWorkflowSchema(yaml);
    expect(schema.workflowDispatch).toHaveLength(3);
    expect(schema.workflowCall).toEqual([]);

    const env = schema.workflowDispatch[0];
    expect(env?.name).toBe("environment");
    expect(env?.type).toBe("choice");
    expect(env?.description).toBe("Where to deploy");
    expect(env?.default).toBe("staging");
    expect(env?.required).toBe(true);
    expect(env?.options).toEqual(["staging", "production"]);

    const dryRun = schema.workflowDispatch[1];
    expect(dryRun?.type).toBe("boolean");
    expect(dryRun?.default).toBe("false");
    expect(dryRun?.required).toBe(false);

    const version = schema.workflowDispatch[2];
    expect(version?.type).toBe("string");
    expect(version?.default).toBeUndefined();
    expect(version?.description).toBeUndefined();
  });

  it("extracts workflow_call inputs alongside workflow_dispatch", () => {
    const yaml = `
on:
  workflow_dispatch:
    inputs:
      foo: { type: string }
  workflow_call:
    inputs:
      bar: { type: boolean, default: true }
`;
    const schema = parseWorkflowSchema(yaml);
    expect(schema.workflowDispatch.map((i) => i.name)).toEqual(["foo"]);
    expect(schema.workflowCall.map((i) => i.name)).toEqual(["bar"]);
    expect(schema.workflowCall[0]?.default).toBe("true");
  });

  it("returns empty arrays when no triggers declare inputs", () => {
    const yaml = `
name: CI
on:
  push:
    branches: [main]
`;
    const schema = parseWorkflowSchema(yaml);
    expect(schema.workflowDispatch).toEqual([]);
    expect(schema.workflowCall).toEqual([]);
  });

  it('handles the bare-keyword "on" (YAML 1.1 truthy parsing)', () => {
    // Some YAML loaders parse the bare keyword `on` as boolean true. js-yaml
    // v4 does not, but we still defensively support that shape.
    const yaml = `
true:
  workflow_dispatch:
    inputs:
      foo: { type: string }
`;
    const schema = parseWorkflowSchema(yaml);
    expect(schema.workflowDispatch.map((i) => i.name)).toEqual(["foo"]);
  });

  it("tolerates a list-shaped `on:` field", () => {
    const yaml = `
on: [push, pull_request]
`;
    const schema = parseWorkflowSchema(yaml);
    expect(schema.workflowDispatch).toEqual([]);
    expect(schema.workflowCall).toEqual([]);
  });

  it("skips malformed input entries instead of throwing", () => {
    const yaml = `
on:
  workflow_dispatch:
    inputs:
      good: { type: string }
      bad: "not a mapping"
`;
    const schema = parseWorkflowSchema(yaml);
    expect(schema.workflowDispatch.map((i) => i.name)).toEqual(["good"]);
  });

  it("throws a descriptive error on invalid YAML", () => {
    expect(() => parseWorkflowSchema("foo: [unclosed")).toThrow(/Failed to parse workflow YAML/);
  });

  it("returns empty arrays for non-object documents", () => {
    expect(parseWorkflowSchema("").workflowDispatch).toEqual([]);
    expect(parseWorkflowSchema('"just a string"').workflowDispatch).toEqual([]);
  });

  it("stringifies non-string defaults", () => {
    const yaml = `
on:
  workflow_dispatch:
    inputs:
      count: { type: number, default: 42 }
      flag: { type: boolean, default: true }
      tags: { type: string, default: [a, b] }
`;
    const schema = parseWorkflowSchema(yaml);
    const inputs = schema.workflowDispatch;
    expect(inputs.find((i) => i.name === "count")?.default).toBe("42");
    expect(inputs.find((i) => i.name === "flag")?.default).toBe("true");
    expect(inputs.find((i) => i.name === "tags")?.default).toBe('["a","b"]');
  });
});

describe("mergeInputs", () => {
  it("uses runtime values when provided", () => {
    const schema = [
      {
        name: "environment",
        type: "choice" as const,
        required: true,
        default: "staging",
        options: ["staging", "production"],
      },
    ];
    const merged = mergeInputs(schema, { environment: "production" });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.value).toBe("production");
    expect(merged[0]?.provenance).toBe("runtime");
  });

  it("falls back to declared defaults when runtime value is missing or empty", () => {
    const schema = [
      { name: "foo", type: "string" as const, default: "bar", required: false },
      { name: "baz", type: "string" as const, default: "qux", required: false },
    ];
    const merged = mergeInputs(schema, { baz: "" });
    expect(merged[0]?.provenance).toBe("default");
    expect(merged[0]?.value).toBe("bar");
    expect(merged[1]?.provenance).toBe("default");
    expect(merged[1]?.value).toBe("qux");
  });

  it("marks declared inputs without value or default as missing", () => {
    const schema = [{ name: "foo", type: "string" as const, required: true }];
    const merged = mergeInputs(schema, {});
    expect(merged[0]?.provenance).toBe("missing");
    expect(merged[0]?.value).toBeUndefined();
  });

  it("surfaces runtime-only inputs that have no schema entry", () => {
    const merged = mergeInputs([], { surprise: "value" });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.provenance).toBe("runtime-only");
    expect(merged[0]?.value).toBe("value");
    expect(merged[0]?.schema).toBeUndefined();
  });

  it("preserves declaration order and appends runtime-only entries last", () => {
    const schema = [
      { name: "a", type: "string" as const, required: false },
      { name: "b", type: "string" as const, required: false },
    ];
    const merged = mergeInputs(schema, { b: "2", c: "3", a: "1" });
    expect(merged.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });
});

describe("workflowPathFromRef", () => {
  it("extracts the workflow path from a typical ref", () => {
    expect(
      workflowPathFromRef(
        "solana-program/actions/.github/workflows/workflow-inputs-ci.yml@refs/heads/main",
      ),
    ).toBe(".github/workflows/workflow-inputs-ci.yml");
  });

  it("handles refs without an @ suffix", () => {
    expect(workflowPathFromRef("owner/repo/.github/workflows/file.yml")).toBe(
      ".github/workflows/file.yml",
    );
  });

  it("returns undefined when the ref is missing", () => {
    expect(workflowPathFromRef(undefined)).toBeUndefined();
    expect(workflowPathFromRef("")).toBeUndefined();
  });

  it("returns undefined when the ref is too short to contain a path", () => {
    expect(workflowPathFromRef("owner/repo@refs/heads/main")).toBeUndefined();
  });
});
