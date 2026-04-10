#!/usr/bin/env node
/**
 * MDS Wiki Editor — Local Server
 * 디자이너용 컴포넌트 문서 편집기 + Confluence 발행
 */

import http from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, join, extname, basename } from "path";
import { randomUUID } from "crypto";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const UPLOADS_DIR = join(PUBLIC_DIR, "uploads");
const COMPONENTS_DIR = join(ROOT, "components");
const CONFIG_PATH = join(ROOT, "wiki.config.json");

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
if (!existsSync(COMPONENTS_DIR)) mkdirSync(COMPONENTS_DIR, { recursive: true });

const PORT = 3456;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

// ─── Helpers ───────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  }
  return { confluenceBaseUrl: "", spaceKey: "", parentPageId: "", confluenceUser: "", token: "", figmaToken: "" };
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ─── Routes ────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ═══════════════════════════════════════════════════════
  // ── Web Editor API (/api/web/...) ──────────────────────
  // ═══════════════════════════════════════════════════════

  // ── List components ──
  if (path === "/api/web/components" && req.method === "GET") {
    const files = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith(".json"));
    const list = files.map((f) => {
      const data = JSON.parse(readFileSync(join(COMPONENTS_DIR, f), "utf-8"));
      return { id: basename(f, ".json"), name: data.name, description: data.description };
    });
    return json(res, list);
  }

  // ── Get component ──
  if (path.startsWith("/api/web/components/") && req.method === "GET") {
    const id = path.split("/")[3];
    const filePath = join(COMPONENTS_DIR, `${id}.json`);
    if (!existsSync(filePath)) return json(res, { error: "Not found" }, 404);
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    return json(res, data);
  }

  // ── Save component ──
  if (path.startsWith("/api/web/components/") && req.method === "PUT") {
    const id = path.split("/")[3];
    const body = await readBody(req);
    const data = JSON.parse(body.toString());
    writeFileSync(join(COMPONENTS_DIR, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
    return json(res, { ok: true });
  }

  // ── Delete component ──
  if (path.startsWith("/api/web/components/") && req.method === "DELETE") {
    const id = path.split("/")[3];
    const filePath = join(COMPONENTS_DIR, `${id}.json`);
    if (existsSync(filePath)) {
      const { unlinkSync } = await import("fs");
      unlinkSync(filePath);
      return json(res, { ok: true });
    }
    res.statusCode = 404;
    return json(res, { error: "Not found" });
  }

  // ── Create component ──
  if (path === "/api/web/components" && req.method === "POST") {
    const body = await readBody(req);
    const data = JSON.parse(body.toString());
    const id = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    writeFileSync(join(COMPONENTS_DIR, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
    return json(res, { ok: true, id });
  }

  // ── Upload image ──
  if (path === "/api/web/upload" && req.method === "POST") {
    const body = await readBody(req);
    // Parse multipart or base64
    const contentType = req.headers["content-type"] || "";

    if (contentType.includes("application/json")) {
      // Base64 upload
      const { data: b64, filename: origName } = JSON.parse(body.toString());
      const ext = extname(origName || ".png");
      const filename = `${randomUUID()}${ext}`;
      const buffer = Buffer.from(b64, "base64");
      writeFileSync(join(UPLOADS_DIR, filename), buffer);
      return json(res, { url: `/uploads/${filename}`, filename });
    }

    // Raw binary upload
    const ext = extname(url.searchParams.get("filename") || ".png");
    const filename = `${randomUUID()}${ext}`;
    writeFileSync(join(UPLOADS_DIR, filename), body);
    return json(res, { url: `/uploads/${filename}`, filename });
  }

  // ── Config ──
  if (path === "/api/web/config" && req.method === "GET") {
    return json(res, loadConfig());
  }
  if (path === "/api/web/config" && req.method === "PUT") {
    const body = await readBody(req);
    saveConfig(JSON.parse(body.toString()));
    return json(res, { ok: true });
  }

  // ── Extract properties from Figma ──
  if (path === "/api/web/figma/extract" && req.method === "POST") {
    const body = await readBody(req);
    const { figmaUrl } = JSON.parse(body.toString());
    const config = loadConfig();

    if (!config.figmaToken) {
      return json(res, { error: "Figma 토큰이 필요합니다. 설정에서 입력해주세요." }, 400);
    }

    try {
      const result = await extractFigmaProperties(config.figmaToken, figmaUrl);
      return json(res, result);
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // ── Publish to Confluence ──
  if (path === "/api/web/publish" && req.method === "POST") {
    const body = await readBody(req);
    const { componentId, html, title } = JSON.parse(body.toString());
    const config = loadConfig();

    if (!config.confluenceBaseUrl || !config.token) {
      return json(res, { error: "Confluence 설정이 필요합니다. 설정 메뉴에서 입력해주세요." }, 400);
    }

    try {
      // Convert local image paths to base64 data URIs
      const processedHtml = html.replace(/src="(\/uploads\/[^"]+)"/g, (match, imgPath) => {
        const fullPath = join(PUBLIC_DIR, imgPath);
        if (existsSync(fullPath)) {
          const imgData = readFileSync(fullPath);
          const ext = imgPath.split(".").pop().toLowerCase();
          const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
          const b64 = imgData.toString("base64");
          return `src="data:${mime};base64,${b64}"`;
        }
        return match;
      });
      const result = await publishToConfluence(config, title, processedHtml);
      return json(res, result);
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // ═══════════════════════════════════════════════════════
  // ── Figma Plugin API (/api/plugin/...) ─────────────────
  // ═══════════════════════════════════════════════════════

  // ── Publish from Figma Plugin ──
  if (path === "/api/plugin/publish" && req.method === "POST") {
    const body = await readBody(req);
    let payload;
    try { payload = JSON.parse(body.toString()); } catch { return json(res, { error: "Invalid JSON" }, 400); }

    const { component, confluence } = payload;
    if (!component || !confluence) return json(res, { error: "component와 confluence 설정이 필요합니다." }, 400);
    if (!confluence.baseUrl || !confluence.token) return json(res, { error: "Confluence URL과 토큰이 필요합니다." }, 400);

    try {
      // 구조화 방식 (가이드 프레임 추출) vs 컴포넌트 직접 분석 방식
      const html = component.measurement !== undefined
        ? generateGuideImageHtml(component)
        : generatePluginHtml(component);
      const title = "[Guide] " + component.name;

      const config = {
        confluenceBaseUrl: confluence.baseUrl,
        spaceKey: confluence.spaceKey,
        parentPageId: confluence.parentPageId,
        confluenceUser: confluence.user,
        token: confluence.token,
      };

      const result = await publishToConfluence(config, title, html);
      return json(res, result);
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // ── Preview standalone page (for Figma capture) ──
  if (path.startsWith("/preview/") && req.method === "GET") {
    const id = path.split("/")[2];
    const compPath = join(COMPONENTS_DIR, `${id}.json`);
    if (!existsSync(compPath)) { res.writeHead(404); res.end("Not found"); return; }
    const data = JSON.parse(readFileSync(compPath, "utf-8"));
    const previewHtml = generateStandalonePreview(data);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(previewHtml);
    return;
  }

  // ── Static files ──
  let filePath = join(PUBLIC_DIR, path === "/" ? "index.html" : path);
  // Serve uploads
  if (path.startsWith("/uploads/")) {
    filePath = join(UPLOADS_DIR, path.replace("/uploads/", ""));
  }

  if (existsSync(filePath)) {
    const ext = extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(readFileSync(filePath));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

// ─── Figma API ─────────────────────────────────────────────

function parseFigmaUrl(url) {
  // figma.com/design/:fileKey/:fileName?node-id=:nodeId
  const m = url.match(/figma\.com\/design\/([^/]+)\/.*[?&]node-id=([^&]+)/);
  if (!m) throw new Error("올바른 Figma URL이 아닙니다.");
  return { fileKey: m[1], nodeId: m[2].replaceAll("-", ":") };
}

// ── Auto-generate descriptions for component, properties, and slots ──
function generateComponentDesc(name) {
  const n = (name || "").replace(/^comp\./i, "").replace(/\./g, " ").trim();
  const descMap = {
    button: "다양한 액션을 실행하기 위한 버튼 컴포넌트입니다.",
    "button icon": "아이콘만으로 구성된 버튼 컴포넌트입니다.",
    "icon button": "아이콘만으로 구성된 버튼 컴포넌트입니다.",
    checkbox: "선택 또는 해제할 수 있는 체크박스 컴포넌트입니다.",
    radio: "여러 옵션 중 하나를 선택하는 라디오 버튼 컴포넌트입니다.",
    toggle: "On/Off 상태를 전환하는 토글 스위치 컴포넌트입니다.",
    switch: "On/Off 상태를 전환하는 스위치 컴포넌트입니다.",
    input: "텍스트를 입력받는 인풋 필드 컴포넌트입니다.",
    "text field": "텍스트를 입력받는 텍스트 필드 컴포넌트입니다.",
    textarea: "여러 줄의 텍스트를 입력받는 텍스트 영역 컴포넌트입니다.",
    select: "드롭다운 목록에서 항목을 선택하는 셀렉트 컴포넌트입니다.",
    dropdown: "드롭다운 목록에서 항목을 선택하는 컴포넌트입니다.",
    chip: "정보를 간결하게 표시하는 칩 컴포넌트입니다.",
    tag: "분류 또는 상태를 표시하는 태그 컴포넌트입니다.",
    badge: "상태나 알림 수를 표시하는 뱃지 컴포넌트입니다.",
    avatar: "사용자 프로필 이미지를 표시하는 아바타 컴포넌트입니다.",
    tooltip: "요소에 호버 시 추가 정보를 보여주는 툴팁 컴포넌트입니다.",
    modal: "화면 위에 오버레이로 표시되는 모달 다이얼로그 컴포넌트입니다.",
    dialog: "사용자 확인이나 입력을 받는 다이얼로그 컴포넌트입니다.",
    toast: "일시적으로 알림 메시지를 표시하는 토스트 컴포넌트입니다.",
    snackbar: "하단에 일시적으로 표시되는 스낵바 컴포넌트입니다.",
    tab: "여러 섹션 간 전환을 위한 탭 컴포넌트입니다.",
    tabs: "여러 섹션 간 전환을 위한 탭 컴포넌트입니다.",
    accordion: "콘텐츠를 접었다 펼 수 있는 아코디언 컴포넌트입니다.",
    card: "관련 정보를 그룹화하여 표시하는 카드 컴포넌트입니다.",
    divider: "콘텐츠 영역을 구분하는 디바이더 컴포넌트입니다.",
    spinner: "로딩 상태를 표시하는 스피너 컴포넌트입니다.",
    loader: "로딩 상태를 표시하는 로더 컴포넌트입니다.",
    skeleton: "콘텐츠 로딩 전 자리 표시를 위한 스켈레톤 컴포넌트입니다.",
    icon: "시각적 의미를 전달하는 아이콘 컴포넌트입니다.",
    thumbnail: "이미지 미리보기를 표시하는 썸네일 컴포넌트입니다.",
    pagination: "여러 페이지 간 탐색을 위한 페이지네이션 컴포넌트입니다.",
    breadcrumb: "현재 위치의 경로를 표시하는 브레드크럼 컴포넌트입니다.",
    navigation: "화면 간 이동을 위한 네비게이션 컴포넌트입니다.",
    sidebar: "화면 측면에 표시되는 사이드바 컴포넌트입니다.",
    header: "페이지 상단에 위치하는 헤더 컴포넌트입니다.",
    footer: "페이지 하단에 위치하는 푸터 컴포넌트입니다.",
    list: "항목들을 나열하여 표시하는 리스트 컴포넌트입니다.",
    table: "데이터를 행과 열로 정리하여 보여주는 테이블 컴포넌트입니다.",
    progress: "진행 상태를 시각적으로 표시하는 프로그레스 컴포넌트입니다.",
    slider: "범위 내 값을 조절할 수 있는 슬라이더 컴포넌트입니다.",
    stepper: "단계별 진행 상태를 표시하는 스테퍼 컴포넌트입니다.",
    alert: "중요한 메시지를 강조하여 표시하는 알림 컴포넌트입니다.",
    banner: "주요 공지사항을 화면 상단에 표시하는 배너 컴포넌트입니다.",
    "bottom sheet": "화면 하단에서 슬라이드되어 나타나는 바텀 시트 컴포넌트입니다.",
    fab: "주요 액션을 위한 플로팅 액션 버튼 컴포넌트입니다.",
    menu: "사용자가 선택할 수 있는 메뉴 옵션을 표시하는 컴포넌트입니다.",
    popover: "특정 요소 근처에 부가 정보를 표시하는 팝오버 컴포넌트입니다.",
  };
  const lower = n.toLowerCase();
  if (descMap[lower]) return descMap[lower];
  // Fallback
  return `${n} 컴포넌트입니다.`;
}

function generatePropertyDesc(compName, propTitle, values) {
  const n = (compName || "").replace(/^comp\./i, "").replace(/\./g, " ").trim();
  const lower = propTitle.toLowerCase();
  const valList = (values || []).map((v) => v.label).join(", ");
  const descMap = {
    size: `${n}의 크기를 설정합니다.`,
    style: `${n}의 스타일 유형을 설정합니다.`,
    type: `${n}의 타입을 설정합니다.`,
    variant: `${n}의 변형 스타일을 설정합니다.`,
    state: `${n}의 상태를 나타냅니다.`,
    status: `${n}의 상태를 나타냅니다.`,
    color: `${n}의 색상 테마를 설정합니다.`,
    theme: `${n}의 테마를 설정합니다.`,
    hierarchy: `${n}의 시각적 위계를 설정합니다.`,
    emphasis: `${n}의 강조 수준을 설정합니다.`,
    position: `${n}의 위치를 설정합니다.`,
    placement: `${n}의 배치 위치를 설정합니다.`,
    orientation: `${n}의 방향을 설정합니다.`,
    direction: `${n}의 방향을 설정합니다.`,
    alignment: `${n}의 정렬 방식을 설정합니다.`,
    shape: `${n}의 형태를 설정합니다.`,
    radius: `${n}의 모서리 둥글기를 설정합니다.`,
    ratio: `${n}의 비율을 설정합니다.`,
    "aspect ratio": `${n}의 종횡비를 설정합니다.`,
    disabled: `${n}의 비활성화 상태를 설정합니다.`,
    loading: `${n}의 로딩 상태를 설정합니다.`,
    selected: `${n}의 선택 상태를 설정합니다.`,
    active: `${n}의 활성 상태를 설정합니다.`,
    checked: `${n}의 체크 상태를 설정합니다.`,
    icon: `${n}에 표시되는 아이콘을 설정합니다.`,
    label: `${n}에 표시되는 레이블 텍스트를 설정합니다.`,
    text: `${n}에 표시되는 텍스트를 설정합니다.`,
    density: `${n}의 밀도(간격)를 설정합니다.`,
    elevation: `${n}의 그림자 높이를 설정합니다.`,
    mode: `${n}의 모드를 설정합니다.`,
    layout: `${n}의 레이아웃을 설정합니다.`,
    count: `${n}의 개수를 설정합니다.`,
    rounded: `${n}의 모서리 둥글기 여부를 설정합니다.`,
  };
  if (descMap[lower]) return descMap[lower];
  // Fallback: capitalize property name
  return `${n}의 ${propTitle}을(를) 설정합니다.`;
}

function generateSlotDesc(slotName) {
  const lower = (slotName || "").toLowerCase().replace(/[^a-z]/g, "");
  const descMap = {
    label: "컴포넌트에 표시되는 텍스트 레이블입니다.",
    icon: "컴포넌트에 포함되는 아이콘 요소입니다.",
    leadingicon: "컴포넌트 앞에 표시되는 아이콘입니다.",
    trailingicon: "컴포넌트 뒤에 표시되는 아이콘입니다.",
    prefix: "입력 필드 앞에 위치하는 접두 요소입니다.",
    suffix: "입력 필드 뒤에 위치하는 접미 요소입니다.",
    avatar: "사용자 프로필 이미지를 표시하는 영역입니다.",
    image: "이미지가 표시되는 영역입니다.",
    badge: "알림이나 카운트를 표시하는 뱃지 영역입니다.",
    description: "보조 설명 텍스트가 표시되는 영역입니다.",
    helper: "도움말 텍스트가 표시되는 영역입니다.",
    helpertext: "도움말 텍스트가 표시되는 영역입니다.",
    error: "오류 메시지가 표시되는 영역입니다.",
    action: "사용자 액션을 위한 인터랙션 영역입니다.",
    close: "닫기 기능을 수행하는 영역입니다.",
    divider: "콘텐츠를 구분하는 구분선 영역입니다.",
    container: "하위 콘텐츠를 감싸는 컨테이너 영역입니다.",
    header: "상단 헤더 영역입니다.",
    footer: "하단 푸터 영역입니다.",
    content: "주요 콘텐츠가 표시되는 영역입니다.",
    title: "제목 텍스트가 표시되는 영역입니다.",
    subtitle: "부제목 텍스트가 표시되는 영역입니다.",
    indicator: "상태를 시각적으로 알려주는 인디케이터 영역입니다.",
    thumbnail: "작은 미리보기 이미지가 표시되는 영역입니다.",
    checkbox: "체크박스 선택 영역입니다.",
    radio: "라디오 버튼 선택 영역입니다.",
    toggle: "토글 스위치 영역입니다.",
    count: "숫자나 카운트가 표시되는 영역입니다.",
    dot: "상태를 나타내는 점(dot) 표시 영역입니다.",
  };
  if (descMap[lower]) return descMap[lower];
  return `${slotName} 요소가 표시되는 영역입니다.`;
}

async function extractFigmaProperties(token, figmaUrl) {
  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

  // 1) Fetch node tree (depth enough for doc frame structure)
  const nodesUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
  const nodesRes = await fetch(nodesUrl, { headers: { "X-FIGMA-TOKEN": token } });
  if (!nodesRes.ok) throw new Error(`Figma API error: ${nodesRes.status}`);
  const nodesData = await nodesRes.json();

  const node = nodesData.nodes[nodeId]?.document;
  if (!node) throw new Error("노드를 찾을 수 없습니다.");

  // ── A) COMPONENT_SET → extract variant properties, slots, anatomy ──
  if (node.type === "COMPONENT_SET" && node.componentPropertyDefinitions) {
    const properties = [];
    const propKeys = [];
    const slots = [];
    const defs = node.componentPropertyDefinitions;

    // Collect BOOLEAN + SLOT props as slots
    const booleanProps = {};
    const slotProps = {};
    for (const [key, def] of Object.entries(defs)) {
      const cleanName = key.replace(/#[\d:]+$/, ""); // strip Figma suffix like #2649:80
      if (def.type === "BOOLEAN") {
        booleanProps[cleanName.toLowerCase()] = { key, def, cleanName };
      } else if (def.type === "SLOT") {
        slotProps[cleanName.toLowerCase()] = { key, def, cleanName };
      }
    }

    // Match boolean + slot pairs, or standalone booleans as slots
    let slotNum = 1;
    const seen = new Set();
    for (const [lowerName, boolInfo] of Object.entries(booleanProps)) {
      const slotInfo = slotProps[lowerName];
      const name = slotInfo ? slotInfo.cleanName : boolInfo.cleanName;
      if (seen.has(lowerName)) continue;
      seen.add(lowerName);
      slots.push({
        number: slotNum++,
        name,
        description: generateSlotDesc(name),
        value: "True / False",
      });
    }
    // SLOT-only props (without BOOLEAN pair) are internal — skip them

    // Collect VARIANT properties
    for (const [key, def] of Object.entries(defs)) {
      if (def.type === "VARIANT") {
        const defaultVal = def.defaultValue || (def.variantOptions || [])[0] || "";
        const values = (def.variantOptions || []).map((v) => ({
          label: v, isDefault: v === defaultVal,
        }));
        propKeys.push(key);
        properties.push({ title: key, description: generatePropertyDesc(node.name, key, values), imageUrl: "", figmaNodeId: "", values, variantImages: [] });
      }
    }

    // Parse variant name → property map: "Type=Image, Radius=None" → {Type:"Image", Radius:"None"}
    const variants = (node.children || []).filter((c) => c.type === "COMPONENT");
    function parseVName(name) {
      const map = {};
      (name || "").split(",").forEach((s) => {
        const [k, ...rest] = s.split("=");
        if (k) map[k.trim()] = rest.join("=").trim();
      });
      return map;
    }

    // Defaults
    const defaults = {};
    for (const prop of properties) {
      const dv = prop.values.find((v) => v.isDefault);
      defaults[prop.title] = dv ? dv.label : "";
    }

    // For each property, pick one variant per value (others at default)
    const allNodeIds = new Set();
    for (const prop of properties) {
      prop._picked = [];
      for (const val of prop.values) {
        const match = variants.find((v) => {
          const map = parseVName(v.name);
          if (map[prop.title] !== val.label) return false;
          for (const ok of propKeys) {
            if (ok === prop.title) continue;
            if (map[ok] !== defaults[ok]) return false;
          }
          return true;
        });
        if (match) {
          const bb = match.absoluteBoundingBox;
          prop._picked.push({ nodeId: match.id, label: val.label, w: bb ? Math.round(bb.width) : 0, h: bb ? Math.round(bb.height) : 0 });
          allNodeIds.add(match.id);
        }
      }
    }

    // Batch export all variant screenshots
    if (allNodeIds.size > 0) {
      try {
        const imgMap = await exportFigmaImages(token, fileKey, [...allNodeIds]);
        const localMap = {};
        for (const [nid, url] of Object.entries(imgMap)) {
          if (url) localMap[nid] = await downloadImage(url, nid);
        }
        for (const prop of properties) {
          prop.variantImages = (prop._picked || []).map((p) => ({
            label: p.label,
            imageUrl: localMap[p.nodeId] || "",
            width: p.w || 0,
            height: p.h || 0,
          })).filter((v) => v.imageUrl);
        }
      } catch (e) {
        console.error("Variant screenshot error:", e.message);
      }
    }

    for (const prop of properties) delete prop._picked;

    // Find default variant (used by Example and Anatomy)
    const defaultVariant = variants.find((v) => {
      const map = parseVName(v.name);
      return propKeys.every((k) => map[k] === defaults[k]);
    });

    // ── Example property: pick random variant combinations ──
    const exampleCount = Math.min(5, variants.length);
    if (exampleCount > 0) {
      // Shuffle and pick diverse variants (avoid duplicates, prefer different combos)
      const shuffled = [...variants].sort(() => Math.random() - 0.5);
      const picked = [];
      const usedNames = new Set();
      // Always include default variant first
      if (defaultVariant || variants[0]) {
        const dv = defaultVariant || variants[0];
        picked.push(dv);
        usedNames.add(dv.name);
      }
      for (const v of shuffled) {
        if (picked.length >= exampleCount) break;
        if (usedNames.has(v.name)) continue;
        picked.push(v);
        usedNames.add(v.name);
      }

      // Export example variant images
      const exNodeIds = picked.map((v) => v.id);
      try {
        const exImgMap = await exportFigmaImages(token, fileKey, exNodeIds);
        const exVariantImages = [];
        for (const v of picked) {
          if (exImgMap[v.id]) {
            const localUrl = await downloadImage(exImgMap[v.id], `example-${v.id}`);
            // Create a short label from variant name
            const vMap = parseVName(v.name);
            const label = Object.values(vMap).join(", ");
            const bb = v.absoluteBoundingBox;
            exVariantImages.push({ label, imageUrl: localUrl, width: bb ? Math.round(bb.width) : 0, height: bb ? Math.round(bb.height) : 0 });
          }
        }
        if (exVariantImages.length > 0) {
          properties.push({
            title: "Example",
            description: "다양한 조합의 " + (node.name || "컴포넌트") + " 사용 예시입니다.",
            imageUrl: "",
            figmaNodeId: "",
            values: [],
            variantImages: exVariantImages,
          });
        }
      } catch (e) {
        console.error("Example screenshot error:", e.message);
      }
    }

    // Anatomy image: screenshot of default variant (all props at default)
    let anatomyImageUrl = "";
    if (defaultVariant) {
      try {
        const aImgMap = await exportFigmaImages(token, fileKey, [defaultVariant.id]);
        if (aImgMap[defaultVariant.id]) {
          anatomyImageUrl = await downloadImage(aImgMap[defaultVariant.id], `anatomy-${defaultVariant.id}`);
        }
      } catch (e) {
        console.error("Anatomy screenshot error:", e.message);
      }

      // Extract slot bounding boxes from default variant's children
      const compBBox = defaultVariant.absoluteBoundingBox;
      if (compBBox) {
        function findSlotNodes(n, result) {
          if (n.type === "SLOT" && n.absoluteBoundingBox) {
            const b = n.absoluteBoundingBox;
            result.push({
              name: n.name,
              x: Math.round(((b.x - compBBox.x) / compBBox.width) * 1000) / 10,
              y: Math.round(((b.y - compBBox.y) / compBBox.height) * 1000) / 10,
              w: Math.round((b.width / compBBox.width) * 1000) / 10,
              h: Math.round((b.height / compBBox.height) * 1000) / 10,
            });
          }
          for (const c of (n.children || [])) findSlotNodes(c, result);
        }
        const slotBoxes = [];
        findSlotNodes(defaultVariant, slotBoxes);

        // Match slot boxes to slots by name (fuzzy: ignore case, trim trailing digits)
        const usedBoxes = new Set();
        for (const slot of slots) {
          const sn = slot.name.toLowerCase().replace(/[^a-z]/g, "");
          // Exact match first
          let box = slotBoxes.find((b, i) => !usedBoxes.has(i) && b.name.toLowerCase() === slot.name.toLowerCase());
          // Fuzzy match: strip non-alpha
          if (!box) {
            const idx = slotBoxes.findIndex((b, i) => !usedBoxes.has(i) && b.name.toLowerCase().replace(/[^a-z]/g, "") === sn);
            if (idx >= 0) box = slotBoxes[idx];
          }
          // Partial match: one contains the other
          if (!box) {
            const idx = slotBoxes.findIndex((b, i) => {
              if (usedBoxes.has(i)) return false;
              const bn = b.name.toLowerCase().replace(/[^a-z]/g, "");
              return bn.includes(sn) || sn.includes(bn);
            });
            if (idx >= 0) box = slotBoxes[idx];
          }
          if (box) {
            const bi = slotBoxes.indexOf(box);
            usedBoxes.add(bi);
            slot.box = { x: box.x, y: box.y, w: box.w, h: box.h };
          }
        }
      }
    }

    const anatomyBB = defaultVariant ? defaultVariant.absoluteBoundingBox : null;
    const anatomyWidth = anatomyBB ? Math.round(anatomyBB.width) : 0;
    const anatomyHeight = anatomyBB ? Math.round(anatomyBB.height) : 0;
    const autoDesc = node.description || generateComponentDesc(node.name);
    return { name: node.name || "", description: autoDesc, properties, slots, anatomyImageUrl, anatomyWidth, anatomyHeight };
  }

  // ── B) Documentation frame → parse structured sections ──
  return await extractFromDocFrame(token, fileKey, node);
}

async function extractFromDocFrame(token, fileKey, node) {
  // 1) Title: component name + description
  let componentName = "";
  let description = "";
  const titleFrame = findChildByName(node, "title");
  if (titleFrame) {
    const texts = findAllTexts(titleFrame);
    componentName = texts[0] || "";
    description = texts[1] || "";
  }

  // 2) Slots from Anatomy section's table ("po" frame)
  const slots = [];
  const anatomyFrame = findChildByName(node, "Anatomy");
  if (anatomyFrame) {
    const tableFrame = findChildByName(anatomyFrame, "po");
    if (tableFrame && tableFrame.children) {
      const columns = tableFrame.children; // [slotNames, descriptions, values]
      const getRows = (col) => (col?.children || []).filter((r) => r.name === "Row").slice(1);
      const nameRows = getRows(columns[0]);
      const descRows = getRows(columns[1]);
      const valRows  = getRows(columns[2]);

      nameRows.forEach((row, i) => {
        const rowTexts = findAllTexts(row);
        const numText = rowTexts.find((t) => /^\d+$/.test(t)) || `${i + 1}`;
        const nameText = rowTexts.filter((t) => !/^\d+$/.test(t)).join("") || "";
        const descText = findAllTexts(descRows[i]).join("") || "";
        const valText  = findAllTexts(valRows[i]).join("") || "";
        slots.push({
          number: parseInt(numText),
          name: nameText.trim(),
          description: descText.trim(),
          value: valText.trim(),
        });
      });
    }
  }

  // 3) Properties from "body" frames + screenshot each "Contents" node
  const bodyFrames = (node.children || []).filter((c) => c.name === "body");
  const properties = [];
  const contentsNodeIds = []; // collect for batch image export

  for (const body of bodyFrames) {
    const titleChild = findChildByName(body, "Title");
    const texts = titleChild ? findAllTexts(titleChild) : [];
    const propTitle = texts[0] || "";
    const propDesc = texts[1] || "";

    // Extract value labels from Contents cards
    const contentsFrame = findChildByName(body, "Contents");
    const values = [];
    if (contentsFrame && contentsFrame.children) {
      for (const card of contentsFrame.children) {
        // Find label text in card (usually a direct TEXT child or nested)
        const cardTexts = findAllTexts(card);
        // Use the last text (label below image), skip if it looks like time "03:25"
        const label = [...cardTexts].reverse().find((t) => t && !/^\d{2}:\d{2}$/.test(t) && !/^배지$/.test(t) && !/^프로필명$/.test(t));
        if (label) {
          values.push({ label: label.trim(), isDefault: values.length === 0 });
        }
      }
    }

    const contentsId = contentsFrame?.id || "";
    if (contentsId) contentsNodeIds.push(contentsId);

    properties.push({
      title: propTitle.trim(),
      description: propDesc.trim(),
      imageUrl: "", // filled after screenshot
      figmaNodeId: contentsId,
      values,
    });
  }

  // 4) Batch export screenshots for all Contents frames
  if (contentsNodeIds.length > 0) {
    const imageMap = await exportFigmaImages(token, fileKey, contentsNodeIds);
    for (const prop of properties) {
      if (prop.figmaNodeId && imageMap[prop.figmaNodeId]) {
        // Download and save locally
        const localUrl = await downloadImage(imageMap[prop.figmaNodeId], prop.figmaNodeId);
        prop.imageUrl = localUrl;
      }
    }
  }

  // 5) Also screenshot the anatomy image (anatomyImage frame)
  let anatomyImageUrl = "";
  if (anatomyFrame) {
    const anatomyImgFrame = findChildByName(anatomyFrame, "anatomyImage");
    if (anatomyImgFrame) {
      const imgMap = await exportFigmaImages(token, fileKey, [anatomyImgFrame.id]);
      if (imgMap[anatomyImgFrame.id]) {
        anatomyImageUrl = await downloadImage(imgMap[anatomyImgFrame.id], anatomyImgFrame.id);
      }
    }
  }

  return { name: componentName, description, properties, slots, anatomyImageUrl };
}

// ─── Figma image export ────────────────────────────────────

async function exportFigmaImages(token, fileKey, nodeIds) {
  const ids = nodeIds.join(",");
  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=2`;
  const res = await fetch(url, { headers: { "X-FIGMA-TOKEN": token } });
  if (!res.ok) throw new Error(`Figma image export error: ${res.status}`);
  const data = await res.json();
  return data.images || {};
}

async function downloadImage(imageUrl, nodeId) {
  const res = await fetch(imageUrl);
  if (!res.ok) return "";
  const buffer = Buffer.from(await res.arrayBuffer());
  const safeName = nodeId.replace(/:/g, "-");
  const filename = `figma-${safeName}.png`;
  writeFileSync(join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

// ─── Figma tree helpers ────────────────────────────────────

function findChildByName(node, name) {
  if (!node?.children) return null;
  return node.children.find((c) => c.name === name) || null;
}

function findAllTexts(node) {
  const texts = [];
  if (!node) return texts;
  if (node.type === "TEXT") texts.push(node.characters || node.name || "");
  if (node.children) {
    for (const child of node.children) texts.push(...findAllTexts(child));
  }
  return texts;
}

// ─── Confluence API ────────────────────────────────────────

async function publishToConfluence(config, title, htmlBody) {
  const { confluenceBaseUrl, spaceKey, parentPageId, confluenceUser, token } = config;

  // Basic Auth for Confluence Server/Data Center
  const authHeader = confluenceUser
    ? `Basic ${Buffer.from(`${confluenceUser}:${token}`).toString("base64")}`
    : `Bearer ${token}`;

  // Wrap in Confluence HTML macro
  const storageBody = `<ac:structured-macro ac:name="html">
  <ac:plain-text-body><![CDATA[${htmlBody}]]></ac:plain-text-body>
</ac:structured-macro>`;

  // Check if page already exists UNDER the parent page only
  let existingPage = null;
  if (parentPageId) {
    const childrenUrl = `${confluenceBaseUrl}/rest/api/content/${parentPageId}/child/page?expand=version&limit=200`;
    const childrenRes = await fetch(childrenUrl, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });
    if (childrenRes.ok) {
      const childrenData = await childrenRes.json();
      existingPage = (childrenData.results || []).find((p) => p.title === title) || null;
    }
  }

  if (existingPage) {
    // Update existing child page
    const page = existingPage;
    const updateUrl = `${confluenceBaseUrl}/rest/api/content/${page.id}`;
    const updateRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: page.id,
        type: "page",
        title,
        space: { key: spaceKey },
        body: { storage: { value: storageBody, representation: "storage" } },
        version: { number: page.version.number + 1 },
      }),
    });
    if (!updateRes.ok) throw new Error(`Update failed: ${updateRes.status} ${await updateRes.text()}`);
    const result = await updateRes.json();
    return { ok: true, url: `${confluenceBaseUrl}${result._links.webui}`, action: "updated" };
  } else {
    // Create new page
    const createUrl = `${confluenceBaseUrl}/rest/api/content`;
    const payload = {
      type: "page",
      title,
      space: { key: spaceKey },
      body: { storage: { value: storageBody, representation: "storage" } },
    };
    if (parentPageId) payload.ancestors = [{ id: parentPageId }];

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!createRes.ok) throw new Error(`Create failed: ${createRes.status} ${await createRes.text()}`);
    const result = await createRes.json();
    return { ok: true, url: `${confluenceBaseUrl}${result._links.webui}`, action: "created" };
  }
}

// ─── Generate HTML from Guide Frame Images ───────────────

function generateGuideImageHtml(d) {
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Measurement 섹션
  let measurementHtml = "";
  if (d.measurement) {
    const m = d.measurement;
    let anatomyImg = "";
    if (m.anatomyImage) {
      anatomyImg = `<div style="background:#f8f9fa;border-radius:16px;overflow:hidden;padding:50px;text-align:center;margin-bottom:20px;">
        <img src="${m.anatomyImage}" alt="Anatomy" style="max-width:100%;height:auto;display:inline-block;" />
      </div>`;
    }

    const slotsRows = (m.slots || []).map((s) => `
      <tr>
        <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:14px;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:100px;border:1.2px solid #111122;background:rgba(0,0,0,0.04);font-size:10px;font-weight:800;letter-spacing:-0.5px;color:#111122;margin-right:8px;">${esc(s.number)}</span>${esc(s.name)}
        </td>
        <td style="font-size:14px;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.description)}</td>
        <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:14px;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.value)}</td>
      </tr>`).join("");

    const slotsTable = slotsRows ? `<table style="width:100%;border-collapse:collapse;border:1px solid rgba(0,0,0,0.15);border-radius:12px;overflow:hidden;margin-bottom:40px;">
      <thead><tr>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:14px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Slots Name</th>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:14px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.08);">Description</th>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:14px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Value</th>
      </tr></thead>
      <tbody>${slotsRows}</tbody>
    </table>` : "";

    measurementHtml = `<div style="margin-bottom:60px;">
      <h2 style="font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;">Measurement</h2>
      ${anatomyImg}
      ${slotsTable}
    </div>
    <hr style="border:none;border-top:1px solid #E4E4EE;margin:60px 0;"/>`;
  }

  // Properties 섹션
  const propertySections = (d.properties || []).map((p) => {
    const tags = (p.tags || []).map((t) => {
      const bg = t.isDefault ? "#E6F9EE" : "#f0f0f5";
      const color = t.isDefault ? "#03A94D" : "#55557A";
      const suffix = t.isDefault ? " (default)" : "";
      return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${bg};font-family:'SF Mono','Fira Code',monospace;font-size:13px;color:${color};margin-right:4px;">${esc(t.label)}${suffix}</span>`;
    }).join(" ");

    let gridImg = "";
    if (p.variantGridImage) {
      gridImg = `<div style="margin-top:20px;">
        <img src="${p.variantGridImage}" alt="${esc(p.title)}" style="max-width:100%;height:auto;display:block;border-radius:16px;" />
      </div>`;
    }

    return `<div style="margin-bottom:40px;">
      <h3 style="font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;">${esc(p.title)}</h3>
      <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 20px;">${esc(p.description)}</p>
      ${tags ? `<p style="margin:0 0 20px;">${tags}</p>` : ""}
      ${gridImg}
    </div>`;
  }).join("");

  return `<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css');
</style>
<div style="font-family:'Pretendard Variable','Pretendard',-apple-system,sans-serif;color:#111122;max-width:1400px;margin:0 auto;padding:100px 80px;background:#fff;">
  <div style="font-size:64px;font-weight:800;letter-spacing:-0.3px;line-height:1.1;margin:0 0 12px;">${esc(d.name)}</div>
  <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 60px;">${esc(d.description)}</p>
  ${measurementHtml}
  <div style="margin-bottom:60px;">
    <h2 style="font-size:40px;font-weight:700;line-height:48px;letter-spacing:-0.3px;margin:0 0 40px;">Properties</h2>
    ${propertySections}
  </div>
</div>`;
}

// ─── Generate HTML from Figma Plugin Data ────────────────

function generatePluginHtml(d) {
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Slots table rows
  const slotsRows = (d.slots || []).map((s) => `
    <tr>
      <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:16px;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:100px;border:1.2px solid #111122;background:rgba(0,0,0,0.04);font-size:10px;font-weight:800;letter-spacing:-0.5px;color:#111122;margin-right:8px;">${s.number}</span>${esc(s.name)}
      </td>
      <td style="font-size:16px;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.description)}</td>
      <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:16px;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.value)}</td>
    </tr>
  `).join("");

  // Anatomy image (base64 from plugin)
  let anatomySection = "";
  if (d.anatomyImage) {
    anatomySection = `<div style="position:relative;width:100%;background:#f8f9fa;border-radius:16px;overflow:hidden;padding:50px;box-sizing:border-box;text-align:center;">
      <img src="${d.anatomyImage}" alt="Anatomy" style="max-width:100%;height:auto;display:inline-block;" />
    </div>`;
  }

  // Properties sections
  const propertySections = (d.properties || []).map((p) => {
    const tags = (p.values || []).map((v) => {
      const bg = v.isDefault ? "#E6F9EE" : "#f0f0f5";
      const color = v.isDefault ? "#03A94D" : "#55557A";
      const suffix = v.isDefault ? " (default)" : "";
      return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${bg};font-family:'SF Mono','Fira Code',monospace;font-size:13px;color:${color};margin-right:4px;">${esc(v.label)}${suffix}</span>`;
    }).join(" ");

    let img = "";
    if (p.variantImages && p.variantImages.length > 0) {
      const items = p.variantImages.map((vi) => {
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
          <img src="${vi.base64}" alt="${esc(vi.label)}" style="max-height:120px;width:auto;object-fit:contain;" />
          <span style="font-size:13px;font-family:'SF Mono','Fira Code',monospace;color:#55557A;white-space:nowrap;">${esc(vi.label)}</span>
        </div>`;
      }).join("");
      img = `<div style="display:flex;flex-wrap:wrap;gap:20px;background:#f8f9fa;border-radius:16px;padding:100px 24px;align-items:flex-end;justify-content:center;">${items}</div>`;
    }

    return `<div style="margin-bottom:40px;">
      <h3 style="font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;">${esc(p.title)}</h3>
      <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 20px;">${esc(p.description)}</p>
      ${tags ? `<p style="margin:0 0 20px;">${tags}</p>` : ""}
      ${img}
    </div>`;
  }).join("");

  const hasMeasurement = d.anatomyImage || (d.slots && d.slots.length > 0);

  return `<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css');
</style>
<div style="font-family:'Pretendard Variable','Pretendard',-apple-system,sans-serif;color:#111122;max-width:1400px;margin:0 auto;padding:100px 80px;background:#fff;">
  <div style="font-size:64px;font-weight:800;letter-spacing:-0.3px;line-height:1.1;margin:0 0 12px;">${esc(d.name)}</div>
  <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 60px;">${esc(d.description)}</p>
  ${hasMeasurement ? `<div style="margin-bottom:60px;">
    <h2 style="font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;">Measurement</h2>
    <div style="margin-bottom:20px;">${anatomySection}</div>
    ${slotsRows ? `<table style="width:100%;border-collapse:collapse;border:1px solid rgba(0,0,0,0.15);border-radius:12px;overflow:hidden;margin-bottom:40px;">
      <thead><tr>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Slots Name</th>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);">Description</th>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Value</th>
      </tr></thead>
      <tbody>${slotsRows}</tbody>
    </table>` : ""}
  </div>
  <hr style="border:none;border-top:1px solid #E4E4EE;margin:60px 0;"/>` : ""}
  <div style="margin-bottom:60px;">
    <h2 style="font-size:40px;font-weight:700;line-height:48px;letter-spacing:-0.3px;margin:0 0 40px;">Properties</h2>
    ${propertySections}
  </div>
</div>`;
}

// ─── Standalone Preview (for Figma capture) ───────────────

function generateStandalonePreview(d) {
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Slots table rows
  const slotsRows = (d.anatomy?.slots || []).map((s) => `
    <tr>
      <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:16px;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:100px;border:1.2px solid #111122;background:rgba(0,0,0,0.04);font-size:10px;font-weight:800;letter-spacing:-0.5px;color:#111122;margin-right:8px;">${s.number}</span>${esc(s.name)}
      </td>
      <td style="font-size:16px;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.description)}</td>
      <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:16px;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.value)}</td>
    </tr>
  `).join("");

  // Anatomy image section
  let anatomySection = "";
  if (d.anatomy?.imageUrl) {
    const guides = d.anatomy.guides || [];
    const markers = d.anatomy.markers || [];
    let guideHtml = "";
    guides.forEach((g) => {
      guideHtml += `<div style="position:absolute;left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;border:1.5px solid rgba(180,60,200,0.45);background:rgba(180,60,200,0.06);border-radius:3px;z-index:2;"></div>`;
    });
    let markerHtml = "";
    markers.forEach((m) => {
      const line = {up:`width:1.5px;height:20px;bottom:100%;left:50%;transform:translateX(-50%)`,down:`width:1.5px;height:20px;top:100%;left:50%;transform:translateX(-50%)`,left:`height:1.5px;width:20px;right:100%;top:50%;transform:translateY(-50%)`,right:`height:1.5px;width:20px;left:100%;top:50%;transform:translateY(-50%)`}[m.direction]||`width:1.5px;height:20px;bottom:100%;left:50%;transform:translateX(-50%)`;
      markerHtml += `<div style="position:absolute;left:${m.x}%;top:${m.y}%;transform:translate(-50%,-50%);z-index:3;">
        <div style="position:absolute;${line};background:#111122;"></div>
        <div style="width:17px;height:17px;border-radius:100px;background:rgba(0,0,0,0.04);color:#111122;border:1.2px solid #111122;font-size:10px;font-weight:800;letter-spacing:-0.5px;display:flex;align-items:center;justify-content:center;">${m.number}</div>
      </div>`;
    });
    const aw = d.anatomy.imageWidth ? ` width="${d.anatomy.imageWidth}"` : "";
    const ah = d.anatomy.imageHeight ? ` height="${d.anatomy.imageHeight}"` : "";
    anatomySection = `<div style="position:relative;width:100%;background:#f8f9fa;border-radius:16px;overflow:hidden;padding:50px;box-sizing:border-box;text-align:center;">
      <div style="position:relative;margin:0 auto;overflow:visible;display:inline-block;">
        <img src="${d.anatomy.imageUrl}" alt="Anatomy"${aw}${ah} style="max-width:100%;height:auto;border-radius:8px;display:block;" />
        ${guideHtml}
      </div>
      ${markerHtml}
    </div>`;
  }

  // Properties sections
  const propertySections = (d.properties || []).map((p) => {
    const tags = (p.values || []).map((v) => {
      const isDefault = v.isDefault;
      const bg = isDefault ? "#E6F9EE" : "#f0f0f5";
      const color = isDefault ? "#03A94D" : "#55557A";
      const suffix = isDefault ? " (default)" : "";
      return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${bg};font-family:'SF Mono','Fira Code',monospace;font-size:13px;color:${color};margin-right:4px;">${esc(v.label)}${suffix}</span>`;
    }).join(" ");

    let img = "";
    if (p.variantImages && p.variantImages.length > 0) {
      const items = p.variantImages.map((vi) => {
        const sizeAttr = vi.width && vi.height ? `width="${vi.width}" height="${vi.height}"` : "";
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
          <img src="${vi.imageUrl}" alt="${esc(vi.label)}" ${sizeAttr} style="max-height:120px;width:auto;object-fit:contain;" />
          <span style="font-size:13px;font-family:'SF Mono','Fira Code',monospace;color:#55557A;white-space:nowrap;">${esc(vi.label)}</span>
        </div>`;
      }).join("");
      img = `<div style="display:flex;flex-wrap:wrap;gap:20px;background:#f8f9fa;border-radius:16px;padding:100px 24px;align-items:flex-end;justify-content:center;">${items}</div>`;
    } else if (p.imageUrl) {
      img = `<div style="background:#f8f9fa;border-radius:20px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:300px;padding:40px;"><img src="${p.imageUrl}" alt="${esc(p.title)}" style="max-width:100%;height:auto;" /></div>`;
    }

    return `<div style="margin-bottom:40px;">
      <h3 style="font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;">${esc(p.title)}</h3>
      <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 20px;">${esc(p.description)}</p>
      ${tags ? `<p style="margin:0 0 20px;">${tags}</p>` : ""}
      ${img}
    </div>`;
  }).join("");

  const hasMeasurement = d.anatomy?.imageUrl || (d.anatomy?.slots && d.anatomy.slots.length > 0);

  const body = `<div style="font-family:'Pretendard Variable','Pretendard',-apple-system,sans-serif;color:#111122;max-width:1400px;margin:0 auto;padding:100px 80px;background:#fff;">
    <div style="font-size:64px;font-weight:800;letter-spacing:-0.3px;line-height:1.1;margin:0 0 12px;">${esc(d.name)}</div>
    <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 60px;">${esc(d.description)}</p>
    ${hasMeasurement ? `<div style="margin-bottom:60px;">
      <h2 style="font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;">Measurement</h2>
      <div style="margin-bottom:20px;">${anatomySection}</div>
      ${slotsRows ? `<table style="width:100%;border-collapse:collapse;border:1px solid rgba(0,0,0,0.15);border-radius:12px;overflow:hidden;margin-bottom:40px;">
        <thead><tr>
          <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Slots Name</th>
          <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);">Description</th>
          <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:10px 20px;height:44px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Value</th>
        </tr></thead>
        <tbody>${slotsRows}</tbody>
      </table>` : ""}
    </div>
    <hr style="border:none;border-top:1px solid #E4E4EE;margin:60px 0;"/>` : ""}
    <div style="margin-bottom:60px;">
      <h2 style="font-size:40px;font-weight:700;line-height:48px;letter-spacing:-0.3px;margin:0 0 40px;">Properties</h2>
      ${propertySections}
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(d.name)} — Preview</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="preload" as="style" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; font-family: 'Pretendard Variable', 'Pretendard', -apple-system, sans-serif; }
  </style>
</head>
<body>${body}
<script>
  // Wait for fonts to fully load before Figma capture
  document.fonts.ready.then(() => {
    const s = document.createElement('script');
    s.src = 'https://mcp.figma.com/mcp/html-to-design/capture.js';
    s.async = true;
    document.head.appendChild(s);
  });
</script>
</body>
</html>`;
}

// ─── Start ─────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n  MDS Wiki Editor`);
  console.log(`  http://localhost:${PORT}\n`);
});
