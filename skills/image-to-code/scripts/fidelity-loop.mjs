#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(`Usage:
  node fidelity-loop.mjs --html <index.html> --reference <reference.png> --out-dir <dir> \\
    [--width 1440] [--height 900] [--round 1] [--max-rounds 3] [--threshold 0.90] [--partial-threshold 0.75]

Renders the page, diffs it against the reference, and writes a bounded fix-queue report with
three tiers: Must Fix and Should Fix are computed here deterministically (no model call);
Reference Review is left as an explicit pending slot for the orchestrating agent to fill from
two independent passes — see the "reference_review" object in the JSON report and the matching
section in the Markdown report for exactly what to do next.
`);
}

function fail(message) {
  console.error(`fidelity-loop: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

function runCapture({ html, screenshotPath, width, height }) {
  const script = join(__dirname, "capture-page.mjs");
  const result = spawnSync(process.execPath, [
    script,
    "--html", html,
    "--out", screenshotPath,
    "--width", String(width),
    "--height", String(height),
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    return { valid: false, error: result.stderr || result.stdout || "capture-page.mjs failed" };
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { valid: false, error: `could not parse capture-page.mjs output: ${result.stdout}` };
  }
}

function runVisualDiff({ reference, actual, outDir, threshold, partialThreshold }) {
  const script = join(__dirname, "visual-diff.py");
  const python = process.env.PYTHON || "python3";
  const result = spawnSync(python, [
    script,
    "--reference", reference,
    "--actual", actual,
    "--out", outDir,
    "--threshold", String(threshold),
    "--partial-threshold", String(partialThreshold),
  ], { encoding: "utf8" });

  // visual-diff.py exits 1 for a legitimate "partial"/"fail" verdict, not just on a real crash —
  // its exit code alone can't distinguish "ran fine, scored low" from "the script itself broke".
  // It always prints its report JSON to stdout when it completes, so parse that first and only
  // treat this as an execution error if stdout isn't valid JSON at all.
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: result.stderr || result.stdout || `visual-diff.py exited ${result.status} with no parseable output` };
  }
}

function buildMustAndShouldFix({ capture, diff }) {
  const mustFix = [];
  const shouldFix = [];

  if (!capture.valid) {
    mustFix.push({ rule: "capture-failed", message: capture.error || "page failed to render", action: "fix whatever broke rendering before anything else" });
    return { mustFix, shouldFix }; // nothing downstream is trustworthy if capture itself failed
  }

  if (diff?.error) {
    mustFix.push({ rule: "diff-failed", message: diff.error, action: "fix the visual-diff.py invocation or its inputs" });
    return { mustFix, shouldFix };
  }

  if (diff.verdict === "fail") {
    mustFix.push({
      rule: "visual-diff-fail",
      message: `overall similarity ${diff.scores.overall} is below the fail threshold`,
      action: "inspect overlay.png, diff.png, and worstTiles; one targeted repair pass",
    });
  } else if (diff.verdict === "partial") {
    shouldFix.push({
      rule: "visual-diff-partial",
      message: `overall similarity ${diff.scores.overall} is in the partial range`,
      action: "inspect overlay.png and worstTiles; consider one targeted repair pass",
    });
  }

  const { document, viewport } = capture;
  if (document && viewport) {
    if (document.width > viewport.width * 1.02) {
      mustFix.push({
        rule: "horizontal-overflow",
        message: `document width ${document.width} exceeds viewport width ${viewport.width}`,
        action: "find and fix the element causing horizontal overflow",
      });
    }
    if (document.height > viewport.height * 1.15) {
      shouldFix.push({
        rule: "excess-vertical-length",
        message: `document height ${document.height} is notably taller than viewport height ${viewport.height}`,
        action: "confirm this is real content, not accidental extra whitespace or a duplicated section",
      });
    }
  }

  return { mustFix, shouldFix };
}

function buildReferenceReviewSlot({ comparePngPath }) {
  return {
    codex: null,
    sonnet: null,
    instructions: [
      `Dispatch a sub agent to run codex exec on ${comparePngPath} (or the reference and actual images side by side) and report its findings; set "codex" to that text.`,
      `Look at ${comparePngPath} yourself and add your own findings; set "sonnet" to that text.`,
      "Show both once filled in — do not merge them into one verdict or drop one because the other disagrees.",
    ],
  };
}

function statusFromFixQueue({ mustFix, shouldFix }, round, maxRounds) {
  if (mustFix.length > 0 || shouldFix.length > 0) {
    return round >= maxRounds ? "rounds-exhausted" : "needs-fix";
  }
  return "clean";
}

function buildMarkdownReport(report) {
  const formatQueue = (items, emptyText) =>
    items.length ? items.map((i) => `- [${i.rule}] ${i.message}\n  Action: ${i.action}`).join("\n") : `- ${emptyText}`;

  return `# Fidelity Loop Report

- Status: ${report.status}
- Round: ${report.round} / ${report.maxRounds}
- Reference: ${report.reference}
- Actual: ${report.artifacts.actual || "not captured"}

## Must Fix

${formatQueue(report.mustFix, "No must-fix items.")}

## Should Fix

${formatQueue(report.shouldFix, "No should-fix items.")}

## Reference Review

- Codex pass: ${report.referenceReview.codex ?? "*(pending — see instructions below)*"}
- Sonnet pass: ${report.referenceReview.sonnet ?? "*(pending — see instructions below)*"}

${report.referenceReview.codex === null || report.referenceReview.sonnet === null
    ? report.referenceReview.instructions.map((i) => `- ${i}`).join("\n")
    : "_Both passes complete._"}

## Artifacts

- Screenshot: ${report.artifacts.actual || "not captured"}
- Diff overlay: ${report.artifacts.overlay || "not generated"}
- Diff image: ${report.artifacts.diff || "not generated"}
- Scores: ${report.artifacts.visualEvalJson || "not generated"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.html || !args.reference || !args["out-dir"]) {
    usage();
    process.exit(1);
  }

  const outDir = args["out-dir"];
  const width = Number(args.width ?? 1440);
  const height = Number(args.height ?? 900);
  const round = Number(args.round ?? 1);
  const maxRounds = Number(args["max-rounds"] ?? 3);
  const threshold = Number(args.threshold ?? 0.90);
  const partialThreshold = Number(args["partial-threshold"] ?? 0.75);

  await mkdir(outDir, { recursive: true });
  const screenshotPath = join(outDir, "actual.png");

  const capture = runCapture({ html: args.html, screenshotPath, width, height });

  const diff = capture.valid
    ? runVisualDiff({ reference: args.reference, actual: screenshotPath, outDir, threshold, partialThreshold })
    : null;

  const { mustFix, shouldFix } = buildMustAndShouldFix({ capture, diff: diff ?? {} });
  const referenceReview = buildReferenceReviewSlot({ comparePngPath: join(outDir, "overlay.png") });
  const status = statusFromFixQueue({ mustFix, shouldFix }, round, maxRounds);

  const report = {
    status,
    round,
    maxRounds,
    reference: args.reference,
    mustFix,
    shouldFix,
    referenceReview,
    artifacts: {
      actual: capture.valid ? screenshotPath : null,
      overlay: diff?.artifacts?.overlay ?? null,
      diff: diff?.artifacts?.diff ?? null,
      visualEvalJson: diff?.artifacts?.report ?? null,
    },
    scores: diff?.scores ?? null,
  };

  await writeFile(join(outDir, "fidelity-loop-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, "fidelity-loop-report.md"), buildMarkdownReport(report));

  console.log(JSON.stringify({
    status,
    round,
    maxRounds,
    mustFixCount: mustFix.length,
    shouldFixCount: shouldFix.length,
    reportJson: join(outDir, "fidelity-loop-report.json"),
    reportMd: join(outDir, "fidelity-loop-report.md"),
  }, null, 2));

  if (status === "rounds-exhausted") {
    console.error(`fidelity-loop: max rounds (${maxRounds}) reached with unresolved items — stopping, report remaining gaps instead of looping further.`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
