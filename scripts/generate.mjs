#!/usr/bin/env node
/**
 * MDS Wiki Generator
 *
 * Usage:
 *   node scripts/generate.mjs                     # 전체 컴포넌트 생성
 *   node scripts/generate.mjs thumbnail            # 특정 컴포넌트만
 *   node scripts/generate.mjs --list               # 등록된 컴포넌트 목록
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { resolve, basename, join } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const COMPONENTS_DIR = join(ROOT, "components");
const TEMPLATES_DIR = join(ROOT, "templates");
const OUTPUT_DIR = join(ROOT, "output");

// ─── Helpers ───────────────────────────────────────────────

function loadTemplate() {
  return readFileSync(join(TEMPLATES_DIR, "component-page.html"), "utf-8");
}

function loadComponent(name) {
  const filePath = join(COMPONENTS_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Component file not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function listComponents() {
  return readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"));
}

// ─── Slot Row Builder ──────────────────────────────────────

function buildSlotRow(slot) {
  const numBadge = `<span class="mds-num">${slot.number}</span>`;
  const isBold = slot.name === slot.name; // all slot names use the same style; adjust if needed
  const nameClass = slot.number === 2 ? "slot-name-bold" : "slot-name";

  return `        <tr>
          <td class="${nameClass}">${numBadge}${slot.name}</td>
          <td>${slot.description}</td>
          <td class="slot-name">${slot.value}</td>
        </tr>`;
}

// ─── Property Section Builder ──────────────────────────────

function buildPropertySection(prop) {
  // Value tags
  let valueTags = "";
  if (prop.values && prop.values.length > 0) {
    valueTags = prop.values
      .map((v) => {
        const cls = v.isDefault ? "mds-tag mds-tag-default" : "mds-tag";
        const suffix = v.isDefault ? " (default)" : "";
        return `<span class="${cls}">${v.label}${suffix}</span>`;
      })
      .join(" ");
    valueTags = `<p style="margin: 0 0 20px;">${valueTags}</p>`;
  }

  // Image placeholder — either from imageUrl or figmaNodeId reference
  let imageBlock = "";
  if (prop.imageUrl) {
    imageBlock = `
    <div class="mds-preview">
      <img src="${prop.imageUrl}" alt="${prop.title} preview" style="max-width:100%;height:auto;" />
    </div>`;
  } else {
    imageBlock = `
    <div class="mds-preview">
      <p style="color:#9999B8; font-size:14px;">
        <!-- Figma node: ${prop.figmaNodeId || "N/A"} -->
        이미지를 여기에 첨부하세요 (Figma export 후 Confluence에 업로드)
      </p>
    </div>`;
  }

  return `
    <!-- Property: ${prop.title} -->
    <div class="mds-section" style="margin-bottom:40px;">
      <h3 class="mds-subsection-title">${prop.title}</h3>
      <p class="mds-subsection-desc">${prop.description}</p>
      ${valueTags}
      ${imageBlock}
    </div>`;
}

// ─── Anatomy Image Builder ─────────────────────────────────

function buildAnatomyImage(anatomy) {
  if (anatomy.imageUrl) {
    return `<img src="${anatomy.imageUrl}" alt="Anatomy" style="max-width:100%;height:auto;" />`;
  }
  return `<p style="color:#9999B8; font-size:14px;">
    <!-- Figma node: ${anatomy.figmaNodeId || "N/A"} -->
    Anatomy 이미지를 여기에 첨부하세요 (Figma export 후 Confluence에 업로드)
  </p>`;
}

// ─── Main Generator ────────────────────────────────────────

function generate(componentName) {
  const data = loadComponent(componentName);
  let html = loadTemplate();

  // Replace title & description
  html = html.replaceAll("{{COMPONENT_NAME}}", data.name);
  html = html.replaceAll("{{DESCRIPTION}}", data.description);

  // Anatomy image
  html = html.replaceAll("{{ANATOMY_IMAGE}}", buildAnatomyImage(data.anatomy));

  // Slots table rows
  const slotsHtml = data.anatomy.slots.map(buildSlotRow).join("\n");
  html = html.replaceAll("{{SLOTS_ROWS}}", slotsHtml);

  // Property sections
  const propsHtml = data.properties.map(buildPropertySection).join("\n");
  html = html.replaceAll("{{PROPERTY_SECTIONS}}", propsHtml);

  return html;
}

// ─── CLI ───────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    const components = listComponents();
    console.log("Registered components:");
    components.forEach((c) => console.log(`  - ${c}`));
    return;
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const targets = args.length > 0 ? args : listComponents();

  for (const name of targets) {
    try {
      console.log(`Generating: ${name}...`);
      const html = generate(name);
      const outPath = join(OUTPUT_DIR, `${name}.html`);
      writeFileSync(outPath, html, "utf-8");
      console.log(`  -> ${outPath}`);
    } catch (err) {
      console.error(`  [ERROR] ${name}: ${err.message}`);
    }
  }

  console.log("\nDone! Output files are in ./output/");
  console.log("Confluence에 붙여넣기: 페이지 편집 > '+' > HTML 매크로 > 생성된 HTML 붙여넣기");
}

main();
