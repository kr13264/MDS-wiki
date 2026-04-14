/**
 * MDS CompDocs — Figma Plugin
 * 컴포넌트 세트를 선택하면 상세 가이드 페이지를 자동 생성합니다.
 */

figma.showUI(__html__, { width: 320, height: 480 });

// ─── Selection Change ──────────────────────────────────────

function getSelectionInfo() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return { component: null, guide: null };
  const node = sel[0];

  // 가이드 페이지 프레임 감지 (이름이 "... Guide"로 끝남)
  if (node.type === "FRAME" && node.name.endsWith(" Guide")) {
    return {
      component: null,
      guide: {
        id: node.id,
        name: node.name.replace(/ Guide$/, ""),
      },
    };
  }

  // 컴포넌트 세트
  if (node.type === "COMPONENT_SET") {
    const props = node.componentPropertyDefinitions || {};
    const propKeys = Object.keys(props).filter(
      (k) => props[k].type === "VARIANT"
    );
    return {
      component: {
        id: node.id,
        name: node.name,
        variantCount: node.children.length,
        propCount: propKeys.length,
      },
      guide: null,
    };
  }

  // 단독 컴포넌트
  if (node.type === "COMPONENT") {
    return {
      component: {
        id: node.id,
        name: node.name,
        variantCount: 1,
        propCount: 0,
      },
      guide: null,
    };
  }

  return { component: null, guide: null };
}

function emitSelection() {
  const info = getSelectionInfo();
  figma.ui.postMessage({
    type: "selection",
    component: info.component,
    guide: info.guide,
  });
}

figma.on("selectionchange", emitSelection);
emitSelection();

// ─── Generate Guide ────────────────────────────────────────

figma.ui.onmessage = async (msg) => {

  // ─── Settings (clientStorage) ───────────────────────────
  if (msg.type === "load-settings") {
    const settings = await figma.clientStorage.getAsync("confluenceSettings") || {};
    figma.ui.postMessage({ type: "settings-loaded", settings });
    return;
  }

  if (msg.type === "save-settings") {
    await figma.clientStorage.setAsync("confluenceSettings", msg.settings);
    figma.ui.postMessage({ type: "settings-saved" });
    return;
  }

  // ─── Publish Guide to Confluence ─────────────────────────
  if (msg.type === "publish") {
    try {
      const sel = figma.currentPage.selection[0];
      if (!sel || !sel.name.endsWith(" Guide")) {
        throw new Error("가이드 페이지 프레임을 선택해주세요");
      }

      const guideName = sel.name.replace(/ Guide$/, "");

      progress("가이드 프레임 구조 분석 중...");
      const result = await extractGuideStructured(sel, guideName);

      figma.ui.postMessage({
        type: "publish-data",
        component: result,
      });
    } catch (err) {
      figma.ui.postMessage({ type: "error", text: err.message || String(err) });
    }
    return;
  }

  if (msg.type !== "generate") return;

  try {
    const sel = figma.currentPage.selection[0];
    if (!sel) throw new Error("컴포넌트를 선택해주세요");

    const options = msg.options || {};

    await figma.loadFontAsync({ family: "Inter", style: "Extra Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    progress("컴포넌트 구조 분석 중...");
    const data = analyzeComponent(sel);

    progress("가이드 페이지 생성 중...");
    const page = figma.createPage();
    page.name = data.name + " Guide";
    await figma.setCurrentPageAsync(page);

    // ── Main frame: 1024px wide ──
    const main = figma.createFrame();
    main.name = data.name + " Guide";
    main.resize(1280, 100);
    main.layoutMode = "VERTICAL";
    main.primaryAxisSizingMode = "AUTO";
    main.counterAxisSizingMode = "FIXED";
    main.paddingTop = 100;
    main.paddingBottom = 100;
    main.paddingLeft = 80;
    main.paddingRight = 80;
    main.itemSpacing = 60;
    main.fills = [{ type: "SOLID", color: rgb(255, 255, 255) }];
    main.cornerRadius = 36;
    page.appendChild(main);

    // ── Title ──
    progress("타이틀 생성 중...");
    const titleSection = autoFrame("Title", "VERTICAL", 12);
    titleSection.layoutAlign = "STRETCH";

    titleSection.appendChild(makeText(data.name, 64, "Extra Bold", rgb(17, 17, 34)));
    titleSection.appendChild(makeText(
      data.description || data.name + " 컴포넌트입니다.",
      16, "Regular", rgb(85, 85, 122)
    ));
    main.appendChild(titleSection);

    // ── Measurement (Anatomy) ──
    if (options.includeMeasurement && data.defaultVariant) {
      progress("Measurement 섹션 생성 중...");
      const measSection = autoFrame("Measurement", "VERTICAL", 20);
      measSection.layoutAlign = "STRETCH";

      measSection.appendChild(makeText("Measurement", 28, "Bold", rgb(17, 17, 34)));

      // Anatomy image with slot guide boxes + markers
      const anatomyBg = figma.createFrame();
      anatomyBg.name = "Anatomy Image";
      anatomyBg.layoutAlign = "STRETCH";
      anatomyBg.fills = [{ type: "SOLID", color: rgb(248, 249, 250) }];
      anatomyBg.layoutMode = "NONE";
      anatomyBg.cornerRadius = 16;
      anatomyBg.clipsContent = false;

      const bb = data.defaultVariant.absoluteBoundingBox || { width: 148, height: 148 };
      const compW = Math.round(bb.width);
      const compH = Math.round(bb.height);
      const padY = 50;
      anatomyBg.resize(1280 - 160, compH + padY * 2);
      try {
        // Place as instance (linked to original component) — centered
        const instance = data.defaultVariant.createInstance();
        anatomyBg.appendChild(instance);
        // Center after appending so anatomyBg.width is resolved
        const bgW = anatomyBg.width;
        instance.x = (bgW - instance.width) / 2;
        instance.y = (anatomyBg.height - instance.height) / 2;
        const rect = instance; // alias for marker positioning

        // ── Slot markers (auto-layout: badge + line + guide square) ──
        const guideSize = 36; // pink square size

        for (const slot of data.slots) {
          if (!slot.box && !slot.marker) continue;
          const dir = slot.marker ? slot.marker.direction : "right";
          const isLeft = (dir === "right"); // badge on left, points right

          // Calculate vertical center of this slot's box
          let slotCenterY = padY + compH / 2;
          if (slot.box) {
            slotCenterY = rect.y + (slot.box.y / 100) * compH + ((slot.box.h / 100) * compH) / 2;
          }

          // Horizontal auto-layout group: [badge][line][guide] or [guide][line][badge]
          const markerGroup = figma.createFrame();
          markerGroup.name = `${slot.number}`;
          markerGroup.layoutMode = "HORIZONTAL";
          markerGroup.primaryAxisSizingMode = "AUTO";
          markerGroup.counterAxisSizingMode = "AUTO";
          markerGroup.counterAxisAlignItems = "CENTER";
          markerGroup.itemSpacing = 0;
          markerGroup.fills = [];

          // Badge
          const badge = figma.createFrame();
          badge.name = "num" + slot.number;
          badge.resize(17, 17);
          badge.cornerRadius = 100;
          badge.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.04 }];
          badge.strokes = [{ type: "SOLID", color: rgb(17, 17, 34) }];
          badge.strokeWeight = 1.2;
          badge.layoutMode = "HORIZONTAL";
          badge.primaryAxisAlignItems = "CENTER";
          badge.counterAxisAlignItems = "CENTER";
          badge.primaryAxisSizingMode = "FIXED";
          badge.counterAxisSizingMode = "FIXED";
          badge.appendChild(makeText(String(slot.number), 10, "Bold", rgb(17, 17, 34)));

          // Line
          const line = figma.createRectangle();
          line.name = "Line";
          line.resize(20, 1.5);
          line.fills = [{ type: "SOLID", color: rgb(17, 17, 34) }];

          // Pink guide square
          const guide = figma.createRectangle();
          guide.name = "Guide";
          guide.resize(guideSize, guideSize);
          guide.fills = [{ type: "SOLID", color: { r: 0.706, g: 0.235, b: 0.784 }, opacity: 0.06 }];
          guide.strokes = [{ type: "SOLID", color: { r: 0.706, g: 0.235, b: 0.784 }, opacity: 0.45 }];
          guide.strokeWeight = 1.5;
          guide.cornerRadius = 3;

          if (isLeft) {
            // Left side: badge → line → guide
            markerGroup.appendChild(badge);
            markerGroup.appendChild(line);
            markerGroup.appendChild(guide);
            // Position: guide box touches left edge of component image
            const groupW = 17 + 20 + guideSize;
            markerGroup.x = rect.x - groupW + guideSize / 2;
          } else {
            // Right side: guide → line → badge
            markerGroup.appendChild(guide);
            markerGroup.appendChild(line);
            markerGroup.appendChild(badge);
            // Position: guide box touches right edge of component image
            markerGroup.x = rect.x + compW - guideSize / 2;
          }

          markerGroup.y = slotCenterY - guideSize / 2;
          anatomyBg.appendChild(markerGroup);
        }
      } catch (e) {
        anatomyBg.appendChild(makeText("이미지를 불러올 수 없습니다", 14, "Regular", rgb(153, 153, 184)));
      }
      measSection.appendChild(anatomyBg);

      // Slots table — always show, minimum 3 rows for designers to fill in
      const minRows = 3;
      const tableSlots = [...data.slots];
      while (tableSlots.length < minRows) {
        const n = tableSlots.length + 1;
        tableSlots.push({
          number: n,
          name: "",
          description: "",
          value: "",
        });
      }
      const table = createSlotsTable(tableSlots);
      measSection.appendChild(table);

      main.appendChild(measSection);
    }

    // ── Properties ──
    if (data.properties.length > 0) {
      progress("Properties 섹션 생성 중...");
      main.appendChild(makeText("Properties", 28, "Bold", rgb(17, 17, 34)));

      for (let pi = 0; pi < data.properties.length; pi++) {
        const prop = data.properties[pi];
        progress(`Property "${prop.title}" 생성 중... (${pi + 1}/${data.properties.length})`);

        const section = autoFrame(prop.title, "VERTICAL", 16);
        section.layoutAlign = "STRETCH";

        section.appendChild(makeText(prop.title, 22, "Bold", rgb(17, 17, 34)));
        section.appendChild(makeText(
          prop.description || data.name + "의 " + prop.title + "을 설정합니다.",
          16, "Regular", rgb(85, 85, 122)
        ));

        // Tags
        if (prop.values.length > 0) {
          const tagsRow = autoFrame("Tags", "HORIZONTAL", 6);
          for (const v of prop.values) {
            const tag = figma.createFrame();
            tag.name = v.label;
            tag.layoutMode = "HORIZONTAL";
            tag.primaryAxisSizingMode = "AUTO";
            tag.counterAxisSizingMode = "AUTO";
            tag.paddingTop = 3;
            tag.paddingBottom = 3;
            tag.paddingLeft = 10;
            tag.paddingRight = 10;
            tag.cornerRadius = 6;

            if (v.isDefault) {
              tag.fills = [{ type: "SOLID", color: rgb(230, 249, 238) }];
            } else {
              tag.fills = [{ type: "SOLID", color: rgb(240, 240, 245) }];
            }

            const tagLabel = v.isDefault ? v.label + " (default)" : v.label;
            const tagColor = v.isDefault ? rgb(3, 169, 77) : rgb(85, 85, 122);
            tag.appendChild(makeText(tagLabel, 13, "Medium", tagColor));
            tagsRow.appendChild(tag);
          }
          section.appendChild(tagsRow);
        }

        // Variant image grid — FILL width
        if (prop.variantNodes.length > 0) {
          const grid = figma.createFrame();
          grid.name = "Variants Grid";
          grid.layoutMode = "HORIZONTAL";
          grid.primaryAxisSizingMode = "FIXED";
          grid.counterAxisSizingMode = "AUTO";
          grid.layoutAlign = "STRETCH";
          grid.itemSpacing = 20;
          grid.paddingTop = 100;
          grid.paddingBottom = 100;
          grid.paddingLeft = 24;
          grid.paddingRight = 24;
          grid.fills = [{ type: "SOLID", color: rgb(248, 249, 250) }];
          grid.cornerRadius = 16;
          grid.primaryAxisAlignItems = "CENTER";
          grid.counterAxisAlignItems = "MAX";

          for (const vn of prop.variantNodes) {
            const item = autoFrame(vn.label, "VERTICAL", 10);
            item.counterAxisSizingMode = "AUTO";
            item.counterAxisAlignItems = "CENTER";

            try {
              const inst = vn.node.createInstance();
              item.appendChild(inst);
            } catch (e) {}

            item.appendChild(makeText(vn.label, 13, "Medium", rgb(85, 85, 122)));
            grid.appendChild(item);
          }
          section.appendChild(grid);
        }

        main.appendChild(section);
      }
    }

    // ── Example section ──
    if (options.includeExample && data.exampleVariants.length > 0) {
      progress("Example 섹션 생성 중...");
      const exSection = autoFrame("Example", "VERTICAL", 16);
      exSection.layoutAlign = "STRETCH";

      exSection.appendChild(makeText("Example", 22, "Bold", rgb(17, 17, 34)));
      exSection.appendChild(makeText(
        "다양한 조합의 " + data.name + " 사용 예시입니다.",
        16, "Regular", rgb(85, 85, 122)
      ));

      const grid = figma.createFrame();
      grid.name = "Example Grid";
      grid.layoutMode = "HORIZONTAL";
      grid.primaryAxisSizingMode = "FIXED";
      grid.counterAxisSizingMode = "AUTO";
      grid.layoutAlign = "STRETCH";
      grid.itemSpacing = 20;
      grid.paddingTop = 100;
      grid.paddingBottom = 100;
      grid.paddingLeft = 24;
      grid.paddingRight = 24;
      grid.fills = [{ type: "SOLID", color: rgb(248, 249, 250) }];
      grid.cornerRadius = 16;
      grid.primaryAxisAlignItems = "CENTER";
      grid.counterAxisAlignItems = "MAX";

      for (const ex of data.exampleVariants) {
        const item = autoFrame(ex.label, "VERTICAL", 10);
        item.counterAxisSizingMode = "AUTO";
        item.counterAxisAlignItems = "CENTER";

        try {
          const inst = ex.node.createInstance();
          item.appendChild(inst);
        } catch (e) {}

        item.appendChild(makeText(ex.label, 13, "Medium", rgb(85, 85, 122)));
        grid.appendChild(item);
      }
      exSection.appendChild(grid);
      main.appendChild(exSection);
    }

    figma.viewport.scrollAndZoomIntoView([main]);
    figma.ui.postMessage({ type: "done" });
  } catch (err) {
    figma.ui.postMessage({ type: "error", text: err.message || String(err) });
  }
};

// ─── Component Analysis ────────────────────────────────────

function analyzeComponent(node) {
  const result = {
    name: node.name.replace(/^comp\./i, ""),
    description: node.description || "",
    properties: [],
    slots: [],
    defaultVariant: null,
    exampleVariants: [],
  };

  if (node.type === "COMPONENT") {
    result.defaultVariant = node;
    result.slots = extractSlots(node);
    return result;
  }

  if (node.type !== "COMPONENT_SET") return result;

  const propDefs = node.componentPropertyDefinitions || {};
  const propKeys = Object.keys(propDefs).filter(
    (k) => propDefs[k].type === "VARIANT"
  );
  const variants = node.children.filter((c) => c.type === "COMPONENT");

  function parseVName(name) {
    const map = {};
    name.split(",").forEach((s) => {
      const [k, ...rest] = s.split("=");
      if (k) map[k.trim()] = rest.join("=").trim();
    });
    return map;
  }

  const defaults = {};
  for (const key of propKeys) {
    defaults[key] = propDefs[key].defaultValue || "";
  }

  result.defaultVariant = variants.find((v) => {
    const map = parseVName(v.name);
    return propKeys.every((k) => map[k] === defaults[k]);
  }) || variants[0];

  // Extract slots from default variant — recurse into children
  if (result.defaultVariant) {
    result.slots = extractSlots(result.defaultVariant);
  }

  // Build properties
  for (const key of propKeys) {
    const values = propDefs[key].variantOptions || [];
    const prop = {
      title: key,
      description: "",
      values: values.map((v) => ({
        label: v,
        isDefault: v === defaults[key],
      })),
      variantNodes: [],
    };

    for (const val of values) {
      const match = variants.find((v) => {
        const map = parseVName(v.name);
        if (map[key] !== val) return false;
        for (const ok of propKeys) {
          if (ok === key) continue;
          if (map[ok] !== defaults[ok]) return false;
        }
        return true;
      });
      if (match) {
        prop.variantNodes.push({ label: val, node: match });
      }
    }

    result.properties.push(prop);
  }

  // Example: pick up to 5 diverse variants
  const exCount = Math.min(5, variants.length);
  const shuffled = [...variants].sort(() => Math.random() - 0.5);
  const picked = [];
  const usedIds = new Set();

  if (result.defaultVariant) {
    picked.push(result.defaultVariant);
    usedIds.add(result.defaultVariant.id);
  }
  for (const v of shuffled) {
    if (picked.length >= exCount) break;
    if (usedIds.has(v.id)) continue;
    picked.push(v);
    usedIds.add(v.id);
  }

  result.exampleVariants = picked.map((v) => {
    const map = parseVName(v.name);
    return { label: Object.values(map).join(", "), node: v };
  });

  return result;
}

function extractSlots(node) {
  const slots = [];
  let num = 1;
  const compBB = node.absoluteBoundingBox;

  // Determine if a node is a "leaf" slot (has no meaningful sub-children to recurse into)
  // or a "wrapper" that we should recurse into
  function isWrapper(n) {
    // Single direct child of the component = likely a wrapper (e.g. "wrap")
    if (!n.children || n.children.length === 0) return false;
    // If this is the only child at this level, treat as wrapper
    return true;
  }

  function addSlot(child) {
    if (child.visible === false) return;
    if (!child.name || child.name.startsWith("_")) return;

    const childBB = child.absoluteBoundingBox;
    let box = null;
    let marker = null;

    if (compBB && childBB) {
      const rx = ((childBB.x - compBB.x) / compBB.width) * 100;
      const ry = ((childBB.y - compBB.y) / compBB.height) * 100;
      const rw = (childBB.width / compBB.width) * 100;
      const rh = (childBB.height / compBB.height) * 100;
      box = {
        x: Math.round(rx * 10) / 10,
        y: Math.round(ry * 10) / 10,
        w: Math.round(rw * 10) / 10,
        h: Math.round(rh * 10) / 10,
      };

      const centerX = rx + rw / 2;
      const centerY = ry + rh / 2;
      // Alternate left/right markers for readability
      if (num % 2 === 1) {
        marker = { x: -15, y: Math.round(centerY * 10) / 10, direction: "right" };
      } else {
        marker = { x: 115, y: Math.round(centerY * 10) / 10, direction: "left" };
      }
    }

    slots.push({
      number: num++,
      name: child.name,
      description: child.name + " 요소가 표시되는 영역입니다.",
      value: "True / False",
      box: box,
      marker: marker,
    });
  }

  function walk(n, depth) {
    if (!n.children) return;

    // If this node has only 1 child that is a frame/group, treat it as a wrapper and recurse
    const validChildren = n.children.filter(
      (c) => c.visible !== false && !c.name.startsWith("_")
    );

    if (validChildren.length === 1 && depth < 3) {
      const only = validChildren[0];
      if (only.type === "FRAME" || only.type === "GROUP" || only.type === "INSTANCE") {
        // This is a wrapper — recurse into it
        walk(only, depth + 1);
        return;
      }
    }

    // Multiple children — these are the actual slots
    for (const child of validChildren) {
      addSlot(child);
    }
  }

  walk(node, 0);
  return slots;
}

// ─── Slots Table Builder ───────────────────────────────────

function createSlotsTable(slots) {
  const table = figma.createFrame();
  table.name = "Slots Table";
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO";
  table.counterAxisSizingMode = "FIXED";
  table.layoutAlign = "STRETCH";
  table.fills = [];
  table.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.15 }];
  table.strokeWeight = 1;
  table.cornerRadius = 12;
  table.clipsContent = true;

  table.appendChild(makeTableRow("Slots Name", "Description", "Value", true));
  for (const s of slots) {
    table.appendChild(makeTableRow(s.name, s.description, s.value, false, s.number));
  }
  return table;
}

function makeTableRow(c1, c2, c3, isHeader, num) {
  const row = figma.createFrame();
  row.name = isHeader ? "Header" : "Row " + num;
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.counterAxisAlignItems = "CENTER";
  row.layoutAlign = "STRETCH";
  row.fills = isHeader ? [{ type: "SOLID", color: rgb(248, 249, 250) }] : [];
  row.paddingTop = 10;
  row.paddingBottom = 10;
  row.paddingLeft = 20;
  row.paddingRight = 20;
  row.itemSpacing = 0;
  row.strokeBottomWeight = 1;
  row.strokeTopWeight = 0;
  row.strokeLeftWeight = 0;
  row.strokeRightWeight = 0;
  row.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.08 }];

  const font = isHeader ? "Bold" : "Regular";

  // Col1 (220px)
  const col1 = figma.createFrame();
  col1.layoutMode = "HORIZONTAL";
  col1.primaryAxisSizingMode = "FIXED";
  col1.counterAxisSizingMode = "AUTO";
  col1.counterAxisAlignItems = "CENTER";
  col1.resize(220, 20);
  col1.fills = [];
  col1.itemSpacing = 8;

  if (!isHeader && num) {
    const badge = figma.createFrame();
    badge.resize(17, 17);
    badge.cornerRadius = 100;
    badge.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.04 }];
    badge.strokes = [{ type: "SOLID", color: rgb(17, 17, 34) }];
    badge.strokeWeight = 1.2;
    badge.layoutMode = "HORIZONTAL";
    badge.primaryAxisAlignItems = "CENTER";
    badge.counterAxisAlignItems = "CENTER";
    badge.primaryAxisSizingMode = "FIXED";
    badge.counterAxisSizingMode = "FIXED";
    badge.appendChild(makeText(String(num), 10, "Bold", rgb(17, 17, 34)));
    col1.appendChild(badge);
  }

  col1.appendChild(makeText(c1, 14, font, rgb(46, 46, 46)));
  row.appendChild(col1);

  const t2 = makeText(c2, 14, "Regular", rgb(46, 46, 46));
  t2.layoutGrow = 1;
  row.appendChild(t2);

  const t3 = makeText(c3, 14, "Regular", rgb(46, 46, 46));
  t3.resize(220, t3.height);
  row.appendChild(t3);

  return row;
}

// ─── Helpers ───────────────────────────────────────────────

function rgb(r, g, b) {
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function makeText(content, size, style, color) {
  const t = figma.createText();
  t.characters = content;
  t.fontSize = size;
  t.fontName = { family: "Inter", style: style };
  t.fills = [{ type: "SOLID", color: color }];
  return t;
}

function autoFrame(name, direction, spacing) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = direction;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = direction === "VERTICAL" ? "FIXED" : "AUTO";
  f.itemSpacing = spacing;
  f.fills = [];
  return f;
}

function progress(text) {
  figma.ui.postMessage({ type: "progress", text: text });
}

// ─── Extract Structured Data from Guide Frame ────────────

function collectTexts(node) {
  const results = [];
  function walk(n) {
    if (n.type === "TEXT") {
      results.push({ text: n.characters, fontSize: n.fontSize });
    }
    if ("children" in n) {
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return results;
}

async function exportNodeImage(node) {
  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 2 },
  });
  return "data:image/png;base64," + figma.base64Encode(bytes);
}

async function extractGuideStructured(guideFrame, name) {
  const data = {
    name: name,
    description: "",
    measurement: null, // { anatomyImage, slots[] }
    properties: [],    // { title, description, tags[], variantGridImage }
  };

  for (const child of guideFrame.children) {
    if (child.visible === false) continue;

    // ── Title 섹션: 텍스트 추출 ──
    if (child.name === "Title") {
      const texts = collectTexts(child);
      if (texts.length >= 2) {
        data.description = texts[1].text;
      }
      continue;
    }

    // ── Measurement 섹션: Anatomy Image → 이미지, Slots Table → 텍스트 ──
    if (child.name === "Measurement") {
      progress("Measurement 섹션 분석 중...");
      const meas = { anatomyImage: null, slots: [] };

      for (const mc of child.children) {
        if (mc.name === "Measurement" && mc.type === "TEXT") continue; // 섹션 제목 skip

        if (mc.name === "Anatomy Image") {
          progress("Anatomy 이미지 내보내기 중...");
          meas.anatomyImage = await exportNodeImage(mc);
        }

        if (mc.name === "Slots Table") {
          // 테이블에서 행 추출
          for (const row of mc.children) {
            if (row.name === "Header") continue;
            const texts = collectTexts(row);
            // 첫 번째: 번호+이름, 두 번째: 설명, 세 번째: 값
            if (texts.length >= 3) {
              // 번호 텍스트와 이름 텍스트가 분리되어 있음
              const numText = texts.find((t) => t.fontSize === 10);
              const nameText = texts.find((t) => t.fontSize === 14 && t !== texts[texts.length - 1] && t !== texts[texts.length - 2]);
              meas.slots.push({
                number: numText ? numText.text : "",
                name: nameText ? nameText.text : texts[0].text,
                description: texts[texts.length - 2].text,
                value: texts[texts.length - 1].text,
              });
            }
          }
        }
      }

      data.measurement = meas;
      continue;
    }

    // ── "Properties" 텍스트 노드 skip ──
    if (child.type === "TEXT") continue;

    // ── Property 섹션: 제목/설명/태그 → 텍스트, Variants Grid → 이미지 ──
    if (child.type === "FRAME" && child.layoutMode === "VERTICAL") {
      const prop = { title: "", description: "", tags: [], variantGridImage: null };

      for (const pc of child.children) {
        if (pc.type === "TEXT") {
          if (!prop.title) {
            prop.title = pc.characters;
          } else if (!prop.description) {
            prop.description = pc.characters;
          }
        }

        // Tags 행
        if (pc.name === "Tags" && pc.type === "FRAME") {
          for (const tag of pc.children) {
            const tagTexts = collectTexts(tag);
            if (tagTexts.length > 0) {
              const label = tagTexts[0].text;
              const isDefault = label.includes("(default)");
              prop.tags.push({
                label: label.replace(" (default)", ""),
                isDefault: isDefault,
              });
            }
          }
        }

        // Variants Grid 또는 Example Grid → 이미지로 export
        if (pc.name === "Variants Grid" || pc.name === "Example Grid") {
          progress(`"${prop.title}" 이미지 내보내기 중...`);
          prop.variantGridImage = await exportNodeImage(pc);
        }
      }

      if (prop.title) {
        data.properties.push(prop);
      }
      continue;
    }
  }

  if (!data.description) {
    data.description = name + " 컴포넌트입니다.";
  }

  return data;
}

// ─── Image Export for Publishing ──────────────────────────

async function exportComponentImages(sel, data) {
  const result = {
    name: data.name,
    description: data.description || data.name + " 컴포넌트입니다.",
    slots: data.slots,
    properties: [],
    anatomyImage: null,
  };

  // Export anatomy image (default variant at 2x)
  if (data.defaultVariant) {
    try {
      const bytes = await data.defaultVariant.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 },
      });
      result.anatomyImage = "data:image/png;base64," + figma.base64Encode(bytes);
    } catch (e) {}
  }

  // Export variant images per property
  for (const prop of data.properties) {
    progress(`"${prop.title}" 이미지 내보내기 중...`);
    const propData = {
      title: prop.title,
      description: prop.description || data.name + "의 " + prop.title + "을 설정합니다.",
      values: prop.values,
      variantImages: [],
    };

    for (const vn of prop.variantNodes) {
      try {
        const bytes = await vn.node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 },
        });
        propData.variantImages.push({
          label: vn.label,
          base64: "data:image/png;base64," + figma.base64Encode(bytes),
        });
      } catch (e) {}
    }

    result.properties.push(propData);
  }

  return result;
}
