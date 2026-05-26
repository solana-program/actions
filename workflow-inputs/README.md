# workflow-inputs

A GitHub Action that renders the inputs of the current workflow run as a markdown table in the [job summary](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/adding-a-job-summary). Useful for `workflow_dispatch` runs so anyone reviewing the run later can see exactly what inputs triggered it — something the GitHub Actions UI doesn't show out of the box.

## Why?

When you dispatch a workflow manually, GitHub remembers the input values it triggered with, but it doesn't surface them in the run UI. If you come back three months later and want to know what the deploy was, you can't tell without re-running it. This action solves that by writing the inputs to the job summary, where they're easy to find later.

## Usage

```yaml
name: Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: Where to deploy
        type: choice
        options: [staging, production]
        default: staging
      dry-run:
        description: Skip the actual deploy
        type: boolean
        default: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: solana-program/actions/workflow-inputs@v1
      # … rest of the deploy steps
```

That's it. After the action runs, the job summary will contain a table with each input's name, value, type, and description.

> [!NOTE]
> `actions/checkout` should run before this action. The action reads the calling workflow's YAML file from the workspace to extract input descriptions, types, and defaults. Without checkout, the summary still works but only shows the values that were passed (no descriptions).

## Inputs

| Input           | Default                                                 | Description                                                                                                                                             |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`         | `Workflow inputs`                                       | Heading for the summary section.                                                                                                                        |
| `inputs-json`   | _(none)_                                                | Optional explicit JSON object of inputs. Pass `${{ toJSON(inputs) }}` to override the default behavior of reading from `github.event.inputs`.           |
| `mask-patterns` | <code>(?i)(secret\|token\|password\|api[_-]?key)</code> | Comma-separated regex patterns. Input keys matching any pattern have their values redacted. Prefix a pattern with `(?i)` for case-insensitive matching. |
| `show-defaults` | `true`                                                  | Tag inputs that fell back to their declared default with `(default)` in the summary.                                                                    |

## Outputs

| Output    | Description                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `summary` | The rendered markdown summary, also written to `$GITHUB_STEP_SUMMARY`. Useful for piping into a Slack/Discord notification step. |

## Example: piping the summary to Slack

```yaml
- uses: solana-program/actions/workflow-inputs@v1
  id: inputs
- uses: slackapi/slack-github-action@v2
  with:
    payload: |
      {
        "text": ${{ toJSON(steps.inputs.outputs.summary) }}
      }
```

## Example: explicit `inputs-json`

If you'd rather not rely on the action reading the workflow file (e.g. you don't run `actions/checkout`), pass the inputs explicitly:

```yaml
- uses: solana-program/actions/workflow-inputs@v1
  with:
    inputs-json: ${{ toJSON(inputs) }}
```

## Triggers supported

- `workflow_dispatch` — the primary use case.
- `workflow_call` — reusable workflows. Same input schema shape.
- Any other trigger — values from `github.event.inputs` will still render if present, but no schema will be discovered.

## Secret masking

By default, input keys matching `(?i)(secret|token|password|api[_-]?key)` have their values replaced with `***`. The runner's own `::add-mask::` mechanism is independent and is honored by GitHub when it renders summaries — this layer is an extra belt to go with the runner's braces.

To extend the patterns:

```yaml
- uses: solana-program/actions/workflow-inputs@v1
  with:
    mask-patterns: "(?i)(secret|token|password|api[_-]?key),(?i)credential"
```

To disable masking entirely:

```yaml
- uses: solana-program/actions/workflow-inputs@v1
  with:
    mask-patterns: "$^" # Matches nothing.
```

## Development

This project uses [Vite+](https://viteplus.dev) as its toolchain.

```bash
vp install      # install dependencies
vp check        # format, lint, type-check
vp test         # run the test suite
vp pack         # build the action bundle into dist/index.js
```

After changes to anything in `src/`, run `vp pack` and commit the updated `dist/index.js` — it's the file the runner actually executes.

## Acknowledgments

Inspired by a Slack thread where Jon pointed out that GitHub Actions doesn't show the parameters used in a manual workflow run, so figuring out what happened in a deploy after the fact is harder than it should be. This action puts those parameters where you can find them later.
