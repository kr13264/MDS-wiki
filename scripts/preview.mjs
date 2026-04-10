#!/usr/bin/env node
/**
 * MDS Wiki Preview — Confluence HTML을 로컬 브라우저에서 미리볼 수 있도록
 * ac:structured-macro 태그를 제거하고 순수 HTML로 변환합니다.
 *
 * Usage:
 *   node scripts/preview.mjs thumbnail
 *   # -> output/thumbnail.preview.html 생성 후 브라우저에서 열기
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_DIR = join(ROOT, "output");

function stripConfluenceMacros(html) {
  // Remove Confluence macro wrappers, keep inner content
  let clean = html;
  clean = clean.replace(/<ac:structured-macro[^>]*>\s*<ac:plain-text-body><!\[CDATA\[/g, "");
  clean = clean.replace(/\]\]><\/ac:plain-text-body>\s*<\/ac:structured-macro>/g, "");
  // Remove HTML comments at the very top (template variable comments)
  clean = clean.replace(/^<!--[\s\S]*?-->\s*/m, "");
  return clean;
}

function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: node scripts/preview.mjs <component-name>");
    process.exit(1);
  }

  const srcPath = join(OUTPUT_DIR, `${name}.html`);
  if (!existsSync(srcPath)) {
    console.error(`File not found: ${srcPath}\nRun 'node scripts/generate.mjs ${name}' first.`);
    process.exit(1);
  }

  const raw = readFileSync(srcPath, "utf-8");
  const body = stripConfluenceMacros(raw);

  const previewHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MDS Wiki Preview — ${name}</title>
  <style>
    body { margin: 0; padding: 40px; background: #fff; }
  </style>
</head>
<body>
${body}
</body>
</html>`;

  const outPath = join(OUTPUT_DIR, `${name}.preview.html`);
  writeFileSync(outPath, previewHtml, "utf-8");
  console.log(`Preview: ${outPath}`);

  // Open in default browser (macOS)
  try {
    execSync(`open "${outPath}"`);
  } catch {
    console.log("브라우저에서 직접 열어주세요.");
  }
}

main();
