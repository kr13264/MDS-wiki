// ─── State ─────────────────────────────────────────────────
let currentId = null;
let componentData = null;
let propsEditMode = false;

// ─── API ───────────────────────────────────────────────────
const api = {
  async get(path) { return (await fetch(path)).json(); },
  async put(path, data) {
    return (await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
  },
  async post(path, data) {
    return (await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
  },
  async del(path) {
    return (await fetch(path, { method: "DELETE" })).json();
  },
};

// ─── Toast ─────────────────────────────────────────────────
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => (el.className = "toast"), 2500);
}

// ─── Sidebar ───────────────────────────────────────────────
async function loadSidebar() {
  const list = await api.get("/api/web/components");
  const ul = document.getElementById("component-list");
  ul.innerHTML = "";
  list.forEach((c) => {
    const li = document.createElement("li");
    li.dataset.id = c.id;
    if (c.id === currentId) li.classList.add("active");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = c.name;
    nameSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    li.appendChild(nameSpan);

    const delBtn = document.createElement("button");
    delBtn.innerHTML = "&times;";
    delBtn.className = "sidebar-del";
    delBtn.title = "삭제";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`"${c.name}" 컴포넌트를 삭제하시겠습니까?`)) return;
      await api.del(`/api/web/components/${c.id}`);
      if (currentId === c.id) {
        currentId = null;
        componentData = null;
        document.getElementById("empty-state").style.display = "";
        document.getElementById("editor").style.display = "none";
      }
      loadSidebar();
      toast(`${c.name} 삭제됨`, "success");
    };
    li.appendChild(delBtn);

    li.onclick = () => selectComponent(c.id);
    ul.appendChild(li);
  });
}

// ─── Select Component ──────────────────────────────────────
async function selectComponent(id) {
  currentId = id;
  componentData = await api.get(`/api/web/components/${id}`);
  propsEditMode = false;
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("editor").style.display = "";
  renderEditor();
  loadSidebar();
}

// ─── New Component ─────────────────────────────────────────
document.getElementById("btn-new-component").onclick = async () => {
  const name = prompt("컴포넌트 이름 (영문):");
  if (!name) return;
  const data = {
    name,
    description: "",
    figmaUrl: "",
    anatomy: { imageUrl: "", figmaNodeId: "", slots: [] },
    properties: [],
  };
  const res = await api.post("/api/web/components", data);
  await loadSidebar();
  selectComponent(res.id);
  toast(`${name} 생성됨`, "success");
};

// ─── Render Editor ─────────────────────────────────────────
function renderEditor() {
  const d = componentData;
  document.getElementById("field-name").value = d.name || "";
  document.getElementById("field-desc").value = d.description || "";
  document.getElementById("field-figma-url").value = d.figmaUrl || "";

  // Anatomy image + overlay
  renderDropZone("anatomy-image", d.anatomy.imageUrl, (url) => { d.anatomy.imageUrl = url; });
  renderAnatomyOverlay();

  // Slots
  renderSlots();

  // Properties
  renderProperties();
}

// ─── Anatomy Editor ────────────────────────────────────────
let anatomyEditMode = false;

function ensureAnatomyData() {
  const a = componentData.anatomy;
  if (!a.markers) a.markers = [];
  if (!a.guides) a.guides = [];
}

function renderAnatomyOverlay() {
  const overlay = document.getElementById("anatomy-overlay");
  const dropZone = document.getElementById("anatomy-image");
  const btn = document.getElementById("btn-anatomy-edit");
  const d = componentData;
  ensureAnatomyData();

  btn.textContent = anatomyEditMode ? "편집 완료" : "편집 모드";
  btn.className = anatomyEditMode ? "btn-primary" : "btn-secondary";
  btn.style.width = "auto";
  btn.style.padding = "6px 14px";

  if (anatomyEditMode) {
    dropZone.style.display = "none";
    overlay.classList.add("active", "edit-mode");
    renderAnatomyEditor(overlay);
    return;
  }

  // Read-only mode
  overlay.classList.remove("edit-mode");
  if (!d.anatomy.imageUrl) {
    overlay.classList.remove("active");
    overlay.innerHTML = "";
    dropZone.style.display = "";
    renderDropZone("anatomy-image", d.anatomy.imageUrl, (url) => { d.anatomy.imageUrl = url; });
    return;
  }

  dropZone.style.display = "none";
  overlay.classList.add("active");
  renderAnatomyReadonly(overlay);
}

function renderAnatomyReadonly(overlay) {
  const d = componentData;
  const markers = d.anatomy.markers || [];
  const guides = d.anatomy.guides || [];

  // Guides inside image div (% relative to image)
  let guideHtml = "";
  guides.forEach((g) => {
    guideHtml += `<div class="slot-box" style="left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;"></div>`;
  });

  // Markers on overlay (positioned via JS after render)
  let markerHtml = "";
  markers.forEach((m) => {
    const lineStyle = getMarkerLineStyle(m);
    markerHtml += `<div class="slot-marker" data-x="${m.x}" data-y="${m.y}">
      <div class="slot-marker-line" style="${lineStyle}"></div>
      <div class="slot-number-badge">${m.number}</div>
    </div>`;
  });

  const aw = d.anatomy.imageWidth ? ` width="${d.anatomy.imageWidth}"` : "";
  const ah = d.anatomy.imageHeight ? ` height="${d.anatomy.imageHeight}"` : "";
  let html = `<div class="anatomy-img-dropzone has-img" id="anatomy-readonly-img">
    <img src="${d.anatomy.imageUrl}" alt="Anatomy"${aw}${ah} style="max-width:100%;height:auto;border-radius:8px;z-index:0;display:block;" />
    ${guideHtml}
  </div>${markerHtml}`;
  overlay.innerHTML = html;

  // Position markers relative to image
  const imgZone = document.getElementById("anatomy-readonly-img");
  requestAnimationFrame(() => {
    const imgRect = imgZone.getBoundingClientRect();
    const oRect = overlay.getBoundingClientRect();
    overlay.querySelectorAll(".slot-marker").forEach((el) => {
      const mx = parseFloat(el.dataset.x);
      const my = parseFloat(el.dataset.y);
      el.style.left = ((imgRect.left - oRect.left) + (mx / 100) * imgRect.width) + "px";
      el.style.top = ((imgRect.top - oRect.top) + (my / 100) * imgRect.height) + "px";
    });
  });
}

function getMarkerLineStyle(m) {
  const len = 20;
  switch (m.direction) {
    case "up": return `width:1.5px;height:${len}px;bottom:100%;left:50%;transform:translateX(-50%);`;
    case "down": return `width:1.5px;height:${len}px;top:100%;left:50%;transform:translateX(-50%);`;
    case "left": return `height:1.5px;width:${len}px;right:100%;top:50%;transform:translateY(-50%);`;
    case "right": return `height:1.5px;width:${len}px;left:100%;top:50%;transform:translateY(-50%);`;
    default: return `width:1.5px;height:${len}px;bottom:100%;left:50%;transform:translateX(-50%);`;
  }
}

function renderAnatomyEditor(overlay) {
  const d = componentData;
  const markers = d.anatomy.markers || [];
  const guides = d.anatomy.guides || [];

  // Toolbar
  let html = `<div class="anatomy-toolbar">
    <button id="anatomy-add-marker" class="anatomy-tool-btn" title="번호 추가" ${markers.length >= 6 ? "disabled" : ""}>＋ 번호 (${markers.length}/6)</button>
    <button id="anatomy-add-guide" class="anatomy-tool-btn" title="가이드 추가" ${guides.length >= 6 ? "disabled" : ""}>＋ 가이드 (${guides.length}/6)</button>
  </div>`;

  // Image drop zone in center — markers/guides are children of this so positions are relative to image
  let imgContent = "";
  if (d.anatomy.imageUrl) {
    const eaw = d.anatomy.imageWidth ? ` width="${d.anatomy.imageWidth}"` : "";
    const eah = d.anatomy.imageHeight ? ` height="${d.anatomy.imageHeight}"` : "";
    imgContent = `<img src="${d.anatomy.imageUrl}" alt="Anatomy"${eaw}${eah} style="max-width:100%;height:auto;border-radius:8px;pointer-events:none;z-index:0;display:block;" />`;
  } else {
    imgContent = `<span style="pointer-events:none;">이미지를 여기에 드래그하거나 클릭</span>`;
  }

  // Guides — inside image dropzone (% relative to image)
  let guideHtml = "";
  guides.forEach((g, i) => {
    guideHtml += `<div class="slot-box edit-guide" data-idx="${i}" style="left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;cursor:move;">
      <div class="guide-resize" data-idx="${i}"></div>
      <button class="guide-del" data-idx="${i}">×</button>
    </div>`;
  });

  html += `<div class="anatomy-img-dropzone ${d.anatomy.imageUrl ? "has-img" : ""}" id="anatomy-edit-img">
    ${imgContent}
    ${guideHtml}
  </div>`;

  // Markers — on overlay, positioned will be set after render via JS
  markers.forEach((m, i) => {
    const lineStyle = getMarkerLineStyle(m);
    html += `<div class="slot-marker edit-marker" data-idx="${i}" style="cursor:move;">
      <div class="slot-marker-line" style="${lineStyle}"></div>
      <div class="slot-number-badge">${m.number}</div>
      <button class="marker-dir" data-idx="${i}" title="방향 변경">${{up:"↑",down:"↓",left:"←",right:"→"}[m.direction]||"↑"}</button>
      <button class="marker-del" data-idx="${i}">×</button>
    </div>`;
  });

  overlay.innerHTML = html;

  // Image drop/click handling
  const imgZone = document.getElementById("anatomy-edit-img");
  const imgInput = document.createElement("input");
  imgInput.type = "file"; imgInput.accept = "image/*"; imgInput.style.display = "none";
  overlay.appendChild(imgInput);

  imgZone.addEventListener("click", () => { if (!d.anatomy.imageUrl) imgInput.click(); });
  imgZone.addEventListener("dragover", (e) => { e.preventDefault(); imgZone.style.borderColor = "#3283FD"; });
  imgZone.addEventListener("dragleave", () => { imgZone.style.borderColor = ""; });
  imgZone.addEventListener("drop", (e) => {
    e.preventDefault(); imgZone.style.borderColor = "";
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      uploadFile(file, null, null, null, null, (url) => { d.anatomy.imageUrl = url; renderAnatomyEditor(overlay); });
    }
  });
  imgInput.onchange = () => {
    if (imgInput.files[0]) uploadFile(imgInput.files[0], null, null, null, null, (url) => {
      d.anatomy.imageUrl = url; renderAnatomyEditor(overlay);
    });
  };
  // Right-click on image to replace
  if (d.anatomy.imageUrl) {
    imgZone.addEventListener("dblclick", () => imgInput.click());
    imgZone.title = "더블클릭하여 이미지 교체";
    imgZone.style.cursor = "pointer";
  }

  document.getElementById("anatomy-add-marker").onclick = () => {
    if (markers.length >= 6) return;
    markers.push({ number: markers.length + 1, x: 50, y: 50, direction: "up" });
    renderAnatomyEditor(overlay);
  };

  document.getElementById("anatomy-add-guide").onclick = () => {
    if (guides.length >= 6) return;
    const last = guides[guides.length - 1];
    const w = last ? last.w : 30;
    const h = last ? last.h : 25;
    guides.push({ x: 20 + guides.length * 5, y: 20 + guides.length * 5, w, h });
    renderAnatomyEditor(overlay);
  };

  // Marker direction toggle + delete
  overlay.querySelectorAll(".marker-dir").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      const dirs = ["up", "right", "down", "left"];
      const cur = dirs.indexOf(markers[idx].direction);
      markers[idx].direction = dirs[(cur + 1) % 4];
      renderAnatomyEditor(overlay);
    };
  });
  overlay.querySelectorAll(".marker-del").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      markers.splice(+btn.dataset.idx, 1);
      markers.forEach((m, i) => m.number = i + 1);
      renderAnatomyEditor(overlay);
    };
  });

  // Guide delete
  overlay.querySelectorAll(".guide-del").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      guides.splice(+btn.dataset.idx, 1);
      renderAnatomyEditor(overlay);
    };
  });

  // Position markers on overlay using px offset from imgZone
  function positionMarkers() {
    const imgRect = imgZone.getBoundingClientRect();
    const oRect = overlay.getBoundingClientRect();
    overlay.querySelectorAll(".edit-marker").forEach((el) => {
      const idx = +el.dataset.idx;
      const m = markers[idx];
      const px = (imgRect.left - oRect.left) + (m.x / 100) * imgRect.width;
      const py = (imgRect.top - oRect.top) + (m.y / 100) * imgRect.height;
      el.style.left = px + "px";
      el.style.top = py + "px";
    });
  }
  positionMarkers();

  // Dragging for markers — free drag on overlay, save as % of imgZone
  overlay.querySelectorAll(".edit-marker").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      const startMouseX = e.clientX, startMouseY = e.clientY;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      function move(ev) {
        const px = startLeft + (ev.clientX - startMouseX);
        const py = startTop + (ev.clientY - startMouseY);
        el.style.left = px + "px";
        el.style.top = py + "px";
        // Convert back to % of image
        const imgRect = imgZone.getBoundingClientRect();
        const oRect = overlay.getBoundingClientRect();
        const relX = (px - (imgRect.left - oRect.left)) / imgRect.width * 100;
        const relY = (py - (imgRect.top - oRect.top)) / imgRect.height * 100;
        const idx = +el.dataset.idx;
        markers[idx].x = Math.round(relX * 10) / 10;
        markers[idx].y = Math.round(relY * 10) / 10;
      }
      function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  });

  // Dragging for guides
  imgZone.querySelectorAll(".edit-guide").forEach((el) => {
    makeDraggable(el, imgZone, (x, y) => {
      const idx = +el.dataset.idx;
      guides[idx].x = x; guides[idx].y = y;
    });
  });

  // Resize for guides
  imgZone.querySelectorAll(".guide-resize").forEach((handle) => {
    makeResizable(handle, imgZone, (w, h) => {
      const idx = +handle.dataset.idx;
      guides[idx].w = Math.max(5, w);
      guides[idx].h = Math.max(5, h);
    });
  });
}

function makeDraggable(el, container, onMove) {
  el.addEventListener("mousedown", (e) => {
    if (e.target.closest("button") || e.target.closest(".guide-resize")) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const startMouseX = e.clientX, startMouseY = e.clientY;
    const startLeft = parseFloat(el.style.left) || 0;
    const startTop = parseFloat(el.style.top) || 0;
    function move(ev) {
      const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
      const dy = ((ev.clientY - startMouseY) / rect.height) * 100;
      const x = Math.max(0, Math.min(100, startLeft + dx));
      const y = Math.max(0, Math.min(100, startTop + dy));
      el.style.left = x + "%"; el.style.top = y + "%";
      onMove(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    }
    function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}

function makeResizable(handle, container, onResize) {
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = container.getBoundingClientRect();
    const parent = handle.parentElement;
    const startX = parseFloat(parent.style.left);
    const startY = parseFloat(parent.style.top);
    function move(ev) {
      const w = ((ev.clientX - rect.left) / rect.width) * 100 - startX;
      const h = ((ev.clientY - rect.top) / rect.height) * 100 - startY;
      parent.style.width = Math.max(5, w) + "%"; parent.style.height = Math.max(5, h) + "%";
      onResize(Math.round(w * 10) / 10, Math.round(h * 10) / 10);
    }
    function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}

document.getElementById("btn-anatomy-edit").onclick = () => {
  anatomyEditMode = !anatomyEditMode;
  renderAnatomyOverlay();
};

// ─── Image Drop Zone ───────────────────────────────────────
function renderDropZone(elementId, imageUrl, onUpdate) {
  const zone = document.getElementById(elementId);
  if (!zone) return;

  const placeholder = zone.querySelector(".drop-placeholder");
  const preview = zone.querySelector(".drop-preview");
  const removeBtn = zone.querySelector(".drop-remove");

  function showImage(url) {
    placeholder.style.display = "none";
    preview.style.display = "block";
    preview.src = url;
    removeBtn.style.display = "flex";
    zone.classList.add("has-image");
  }

  function clearImage() {
    placeholder.style.display = "flex";
    preview.style.display = "none";
    preview.removeAttribute("src");
    removeBtn.style.display = "none";
    zone.classList.remove("has-image");
    onUpdate("");
  }

  if (imageUrl) {
    showImage(imageUrl);
  }

  // File input
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  zone.appendChild(input);

  zone.addEventListener("click", (e) => {
    if (e.target === removeBtn || e.target.closest(".drop-remove")) return;
    if (!zone.classList.contains("has-image")) input.click();
  });

  input.addEventListener("change", () => {
    if (input.files[0]) uploadFile(input.files[0], zone, placeholder, preview, removeBtn, onUpdate);
  });

  // Drag & drop
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      uploadFile(file, zone, placeholder, preview, removeBtn, onUpdate);
    }
  });

  // Paste support
  zone.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        uploadFile(item.getAsFile(), zone, placeholder, preview, removeBtn, onUpdate);
        break;
      }
    }
  });
  zone.setAttribute("tabindex", "0");

  // Remove
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearImage();
  });
}

async function uploadFile(file, zone, placeholder, preview, removeBtn, onUpdate) {
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    const res = await api.post("/api/web/upload", { data: base64, filename: file.name });
    const url = res.url;

    if (placeholder) placeholder.style.display = "none";
    if (preview) { preview.style.display = "block"; preview.src = url; }
    if (removeBtn) removeBtn.style.display = "flex";
    if (zone) zone.classList.add("has-image");
    onUpdate(url);
    toast("이미지 업로드 완료", "success");
  };
  reader.readAsDataURL(file);
}

// ─── Slots ─────────────────────────────────────────────────
function renderSlots() {
  const container = document.getElementById("slots-list");
  container.innerHTML = "";
  componentData.anatomy.slots.forEach((slot, i) => {
    const div = document.createElement("div");
    div.className = "slot-card";
    div.innerHTML = `
      <div class="card-header">
        <span>#${slot.number} Slot</span>
        <button class="card-remove" data-idx="${i}">&times;</button>
      </div>
      <div class="form-row">
        <label>Name</label>
        <input type="text" value="${esc(slot.name)}" data-idx="${i}" data-field="name" />
      </div>
      <div class="form-row">
        <label>Description</label>
        <input type="text" value="${esc(slot.description)}" data-idx="${i}" data-field="description" />
      </div>
      <div class="form-row">
        <label>Value</label>
        <input type="text" value="${esc(slot.value)}" data-idx="${i}" data-field="value" />
      </div>
    `;
    div.querySelector(".card-remove").onclick = () => {
      componentData.anatomy.slots.splice(i, 1);
      renumberSlots();
      renderSlots();
    };
    div.querySelectorAll("input").forEach((inp) => {
      inp.oninput = () => {
        componentData.anatomy.slots[inp.dataset.idx][inp.dataset.field] = inp.value;
      };
    });
    container.appendChild(div);
  });
}

function renumberSlots() {
  componentData.anatomy.slots.forEach((s, i) => (s.number = i + 1));
}

document.getElementById("btn-add-slot").onclick = () => {
  if (!componentData) return;
  const n = componentData.anatomy.slots.length + 1;
  componentData.anatomy.slots.push({ number: n, name: "", description: "", value: "True / False" });
  renderSlots();
};

// ─── Properties ────────────────────────────────────────────

function renderProperties() {
  const container = document.getElementById("properties-list");
  const editActions = document.getElementById("properties-edit-actions");
  const toggleBtn = document.getElementById("btn-toggle-edit");
  container.innerHTML = "";

  toggleBtn.textContent = propsEditMode ? "편집 완료" : "편집 모드";
  toggleBtn.className = propsEditMode ? "btn-primary" : "btn-secondary";
  toggleBtn.style.width = "auto";
  toggleBtn.style.padding = "6px 14px";
  editActions.style.display = propsEditMode ? "" : "none";

  if (propsEditMode) {
    renderPropertiesEdit(container);
  } else {
    renderPropertiesReadonly(container);
  }
}

// ── Read-only mode ──
function renderPropertiesReadonly(container) {
  if (!componentData.properties || componentData.properties.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#9999B8;">
      <p>Figma URL을 입력하고 <strong>"Figma에서 가져오기"</strong> 버튼을 눌러 자동 추출하세요.</p>
    </div>`;
    return;
  }

  componentData.properties.forEach((prop, i) => {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "40px";

    const chips = (prop.values || []).map((v) => {
      const cls = v.isDefault ? "value-chip default" : "value-chip";
      return `<span class="${cls}">${esc(v.label)}${v.isDefault ? " ✓" : ""}</span>`;
    }).join(" ");

    const hasVariantImages = prop.variantImages && prop.variantImages.length > 0;
    const hasImage = prop.imageUrl && !hasVariantImages;

    // Variant images grid (Storybook style)
    let imageSection = "";
    if (hasVariantImages) {
      const grid = prop.variantImages.map((vi) => {
        const sizeAttr = vi.width && vi.height
          ? `width="${vi.width}" height="${vi.height}"`
          : `onload="this.width=this.naturalWidth/2;this.height=this.naturalHeight/2;"`;
        return `
        <div class="variant-item">
          <img src="${vi.imageUrl}" alt="${esc(vi.label)}" ${sizeAttr} />
          <span class="variant-label">${esc(vi.label)}</span>
        </div>`;
      }).join("");
      imageSection = `<div class="variant-grid">${grid}</div>`;
    } else {
      imageSection = `
        <div class="image-drop-zone" id="prop-image-${i}" data-field="properties[${i}].imageUrl" style="min-height:160px;">
          <div class="drop-placeholder" ${hasImage ? 'style="display:none;"' : ""}>
            <svg width="24" height="24" fill="none" stroke="#9999B8" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
            <p>이미지 드래그 또는 클릭</p>
          </div>
          <img class="drop-preview" ${hasImage ? `src="${prop.imageUrl}" style="display:block;"` : 'style="display:none;"'} />
          <button class="drop-remove" ${hasImage ? 'style="display:flex;"' : 'style="display:none;"'}>×</button>
        </div>`;
    }

    wrapper.innerHTML = `
      <h3 style="font-size:16px;font-weight:700;color:#111122;margin:0 0 8px;">${esc(prop.title) || `Property ${i + 1}`}</h3>
      ${prop.description ? `<p style="font-size:14px;color:#55557A;margin:0 0 12px;">${esc(prop.description)}</p>` : ""}
      ${chips ? `<div class="values-row" style="margin-bottom:16px;">${chips}</div>` : ""}
      ${imageSection}
    `;

    container.appendChild(wrapper);

    // Image upload only for non-variant (doc frame) mode
    if (!hasVariantImages) {
      renderDropZone(`prop-image-${i}`, prop.imageUrl || "", (url) => {
        componentData.properties[i].imageUrl = url;
      });
    }
  });
}

// ── Edit mode ──
function renderPropertiesEdit(container) {
  componentData.properties.forEach((prop, i) => {
    const div = document.createElement("div");
    div.className = "property-card";

    const chips = (prop.values || [])
      .map((v, vi) => `
        <span class="value-chip ${v.isDefault ? "default" : ""}" data-pi="${i}" data-vi="${vi}">
          ${esc(v.label)}${v.isDefault ? " ✓" : ""}
          <button class="chip-default" title="기본값 토글">◉</button>
          <button class="chip-remove" title="삭제">&times;</button>
        </span>
      `).join("");

    div.innerHTML = `
      <div class="card-header">
        <span>Property ${i + 1}</span>
        <button class="card-remove" data-idx="${i}">&times;</button>
      </div>
      <div class="form-row">
        <label>Title</label>
        <input type="text" value="${esc(prop.title)}" data-idx="${i}" data-field="title" />
      </div>
      <div class="form-row">
        <label>Description</label>
        <input type="text" value="${esc(prop.description)}" data-idx="${i}" data-field="description" />
      </div>
      <div class="form-row">
        <label>Values</label>
        <div class="values-row">
          ${chips}
          <button class="value-chip-add" data-idx="${i}">+ 추가</button>
        </div>
      </div>
      <div class="form-row">
        <label>이미지</label>
        <div class="image-drop-zone" id="prop-image-${i}" data-field="properties[${i}].imageUrl">
          <div class="drop-placeholder">
            <svg width="24" height="24" fill="none" stroke="#9999B8" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
            <p>이미지 드래그 또는 클릭</p>
          </div>
          <img class="drop-preview" style="display:none;" />
          <button class="drop-remove" style="display:none;">×</button>
        </div>
      </div>
    `;

    // Events
    div.querySelector(".card-remove").onclick = () => {
      componentData.properties.splice(i, 1);
      renderProperties();
    };

    div.querySelectorAll("input[data-field]").forEach((inp) => {
      inp.oninput = () => {
        componentData.properties[inp.dataset.idx][inp.dataset.field] = inp.value;
      };
    });

    div.querySelectorAll(".chip-remove").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const chip = btn.closest(".value-chip");
        const pi = +chip.dataset.pi, vi = +chip.dataset.vi;
        componentData.properties[pi].values.splice(vi, 1);
        renderProperties();
      };
    });
    div.querySelectorAll(".chip-default").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const chip = btn.closest(".value-chip");
        const pi = +chip.dataset.pi, vi = +chip.dataset.vi;
        componentData.properties[pi].values.forEach((v, j) => (v.isDefault = j === vi));
        renderProperties();
      };
    });

    div.querySelector(".value-chip-add").onclick = () => {
      const label = prompt("Value 이름:");
      if (!label) return;
      if (!componentData.properties[i].values) componentData.properties[i].values = [];
      componentData.properties[i].values.push({ label });
      renderProperties();
    };

    container.appendChild(div);

    renderDropZone(`prop-image-${i}`, prop.imageUrl || "", (url) => {
      componentData.properties[i].imageUrl = url;
    });
  });
}

// ── Toggle edit mode ──
document.getElementById("btn-toggle-edit").onclick = () => {
  propsEditMode = !propsEditMode;
  renderProperties();
};

document.getElementById("btn-add-property").onclick = () => {
  if (!componentData) return;
  componentData.properties.push({ title: "", description: "", imageUrl: "", figmaNodeId: "", values: [] });
  renderProperties();
};

// ── Figma extract ──
document.getElementById("btn-figma-extract").onclick = async () => {
  const url = document.getElementById("field-figma-url").value.trim();
  if (!url) { toast("Figma URL을 입력해주세요.", "error"); return; }

  const btn = document.getElementById("btn-figma-extract");
  btn.disabled = true;
  btn.textContent = "가져오는 중...";

  try {
    const res = await api.post("/api/web/figma/extract", { figmaUrl: url });
    if (res.error) {
      toast(res.error, "error");
      return;
    }

    let extracted = 0;

    // Auto-fill name & description
    if (res.name) {
      document.getElementById("field-name").value = res.name;
      componentData.name = res.name;
    }
    if (res.description) {
      document.getElementById("field-desc").value = res.description;
      componentData.description = res.description;
    }

    // Auto-fill anatomy image
    if (res.anatomyImageUrl) {
      componentData.anatomy.imageUrl = res.anatomyImageUrl;
      componentData.anatomy.imageWidth = res.anatomyWidth || 0;
      componentData.anatomy.imageHeight = res.anatomyHeight || 0;
      renderDropZone("anatomy-image", res.anatomyImageUrl, (u) => { componentData.anatomy.imageUrl = u; });
    }

    // Auto-fill slots
    if (res.slots && res.slots.length > 0) {
      componentData.anatomy.slots = res.slots;
      renderSlots();
      extracted += res.slots.length;
    }

    // Render anatomy overlay with slot boxes
    renderAnatomyOverlay();

    // Merge properties (keep user edits, update values + auto-fill images)
    if (res.properties && res.properties.length > 0) {
      const existing = new Map(componentData.properties.map((p) => [p.title, p]));
      const merged = res.properties.map((newProp) => {
        const old = existing.get(newProp.title);
        if (old) {
          return {
            ...old,
            values: newProp.values,
            description: newProp.description || old.description,
            imageUrl: newProp.imageUrl || old.imageUrl,
            variantImages: newProp.variantImages || old.variantImages || [],
          };
        }
        return newProp;
      });
      componentData.properties = merged;
      extracted += res.properties.length;
    }

    propsEditMode = false;
    renderProperties();

    if (extracted > 0) {
      // Auto-save after extraction so images persist
      componentData.name = document.getElementById("field-name").value;
      componentData.description = document.getElementById("field-desc").value;
      componentData.figmaUrl = document.getElementById("field-figma-url").value;
      await api.put(`/api/web/components/${currentId}`, componentData);
      toast(`Slots ${res.slots?.length || 0}개 + Property ${res.properties?.length || 0}개 추출 완료! (이미지 포함, 자동 저장됨)`, "success");
    } else {
      toast("추출된 항목이 없습니다. 문서 프레임 또는 컴포넌트 셋 노드를 선택해주세요.", "error");
    }
  } catch (err) {
    toast("Figma 연결 실패: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Figma에서 가져오기";
  }
};

// ─── Save ──────────────────────────────────────────────────
document.getElementById("btn-save").onclick = async () => {
  if (!currentId || !componentData) return;
  componentData.name = document.getElementById("field-name").value;
  componentData.description = document.getElementById("field-desc").value;
  componentData.figmaUrl = document.getElementById("field-figma-url").value;
  await api.put(`/api/web/components/${currentId}`, componentData);
  await loadSidebar();
  toast("저장 완료!", "success");
};

// ─── Tabs ──────────────────────────────────────────────────
document.querySelectorAll(".editor-tabs .tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".editor-tabs .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("tab-edit").style.display = target === "edit" ? "" : "none";
    document.getElementById("tab-preview").style.display = target === "preview" ? "" : "none";
    if (target === "preview") renderPreview();
  };
});

// ─── Preview ───────────────────────────────────────────────
function renderPreview() {
  const d = componentData;
  if (!d) return;
  const html = generatePreviewHTML(d);
  const frame = document.getElementById("preview-frame");
  frame.srcdoc = html;
}

function generatePreviewHTML(d) {
  const slotsRows = (d.anatomy.slots || []).map((s) => `
    <tr>
      <td class="slot-name"><span class="mds-num">${s.number}</span>${esc(s.name)}</td>
      <td>${esc(s.description)}</td>
      <td class="slot-name">${esc(s.value)}</td>
    </tr>
  `).join("");

  let anatomyImg = "";
  const markers = d.anatomy.markers || [];
  const guides = d.anatomy.guides || [];
  if (d.anatomy.imageUrl) {
    let guideHtml = "";
    guides.forEach((g) => {
      guideHtml += `<div style="position:absolute;left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;border:1.5px solid rgba(180,60,200,0.45);background:rgba(180,60,200,0.06);border-radius:3px;z-index:2;"></div>`;
    });
    let markerHtml = "";
    markers.forEach((m) => {
      const line = {up:`width:1.5px;height:20px;bottom:100%;left:50%;transform:translateX(-50%)`,down:`width:1.5px;height:20px;top:100%;left:50%;transform:translateX(-50%)`,left:`height:1.5px;width:20px;right:100%;top:50%;transform:translateY(-50%)`,right:`height:1.5px;width:20px;left:100%;top:50%;transform:translateY(-50%)`}[m.direction]||`width:1.5px;height:20px;bottom:100%;left:50%;transform:translateX(-50%)`;
      markerHtml += `<div class="anat-marker" data-x="${m.x}" data-y="${m.y}" style="position:absolute;transform:translate(-50%,-50%);z-index:3;">
        <div style="position:absolute;${line};background:#111122;"></div>
        <div style="width:17px;height:17px;border-radius:100px;background:rgba(0,0,0,0.04);color:#111122;border:1.2px solid #111122;font-size:10px;font-weight:800;letter-spacing:-0.5px;display:flex;align-items:center;justify-content:center;">${m.number}</div>
      </div>`;
    });
    anatomyImg = `<div id="anat-wrap" style="position:relative;width:100%;background:#f8f9fa;border-radius:16px;overflow:hidden;padding:50px;box-sizing:border-box;text-align:center;">
      <div id="anat-img" style="position:relative;margin:0 auto;overflow:visible;display:inline-block;">
        <img src="${d.anatomy.imageUrl}" alt="Anatomy"${d.anatomy.imageWidth ? ` width="${d.anatomy.imageWidth}"` : ""}${d.anatomy.imageHeight ? ` height="${d.anatomy.imageHeight}"` : ""} style="max-width:100%;height:auto;border-radius:8px;z-index:0;display:block;" />
        ${guideHtml}
      </div>
      ${markerHtml}
    </div>
    <script>
      requestAnimationFrame(()=>{
        const wrap=document.getElementById('anat-wrap');
        const img=document.getElementById('anat-img');
        if(!wrap||!img)return;
        const wr=wrap.getBoundingClientRect();
        const ir=img.getBoundingClientRect();
        document.querySelectorAll('.anat-marker').forEach(el=>{
          const x=parseFloat(el.dataset.x),y=parseFloat(el.dataset.y);
          el.style.left=((ir.left-wr.left)+(x/100)*ir.width)+'px';
          el.style.top=((ir.top-wr.top)+(y/100)*ir.height)+'px';
        });
      });
    </script>`;
  } else {
    anatomyImg = `<p style="color:#9999B8;font-size:14px;">Anatomy 이미지를 편집 탭에서 업로드하세요</p>`;
  }

  const propertySections = (d.properties || []).map((p) => {
    const tags = (p.values || []).map((v) => {
      const cls = v.isDefault ? "mds-tag mds-tag-default" : "mds-tag";
      const suffix = v.isDefault ? " (default)" : "";
      return `<span class="${cls}">${esc(v.label)}${suffix}</span>`;
    }).join(" ");

    let img = "";
    if (p.variantImages && p.variantImages.length > 0) {
      const items = p.variantImages.map((vi) => {
        const sizeAttr = vi.width && vi.height
          ? `width="${vi.width}" height="${vi.height}"`
          : `onload="this.width=this.naturalWidth/2;this.height=this.naturalHeight/2;"`;
        return `
        <div class="mds-variant-item">
          <img src="${vi.imageUrl}" alt="${esc(vi.label)}" ${sizeAttr} />
          <span>${esc(vi.label)}</span>
        </div>`;
      }).join("");
      img = `<div class="mds-variant-grid">${items}</div>`;
    } else if (p.imageUrl) {
      img = `<div class="mds-preview"><img src="${p.imageUrl}" alt="${esc(p.title)}" style="max-width:100%;height:auto;" /></div>`;
    } else {
      img = `<div class="mds-preview"><p style="color:#9999B8;font-size:14px;">이미지를 편집 탭에서 업로드하세요</p></div>`;
    }

    return `
      <div class="mds-section" style="margin-bottom:40px;">
        <h3 class="mds-subsection-title">${esc(p.title)}</h3>
        <p class="mds-subsection-desc">${esc(p.description)}</p>
        ${tags ? `<p style="margin:0 0 20px;">${tags}</p>` : ""}
        ${img}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"/>
<style>
body{margin:0;padding:0;background:#fff;}
.mds-wiki{font-family:'Pretendard Variable','Pretendard',sans-serif;color:#111122;max-width:1400px;margin:0 auto;padding:100px 80px;border-radius:36px;}
.mds-title{font-size:64px;font-weight:800;letter-spacing:-0.3px;line-height:1.1;margin:0 0 12px;background:none;}
.mds-desc{font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 60px;}
.mds-section{margin-bottom:60px;}
.mds-section-title{font-size:40px;font-weight:700;line-height:48px;letter-spacing:-0.3px;margin:0 0 40px;}
.mds-subsection-title{font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.3px;margin:0 0 16px;}
.mds-subsection-desc{font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 20px;}
.mds-anatomy-image{background:none;border-radius:0;overflow:hidden;margin-bottom:20px;}
.mds-anatomy-image img{max-width:100%;height:auto;}
.mds-table{width:100%;border-collapse:collapse;border:1px solid rgba(0,0,0,0.15);border-radius:12px;overflow:hidden;margin-bottom:40px;}
.mds-table th{background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);}
.mds-table td{font-size:16px;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;}
.mds-table td.slot-name{font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;}
.mds-num{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:100px;border:1.2px solid #111122;background:rgba(0,0,0,0.04);font-size:10px;font-weight:800;letter-spacing:-0.5px;color:#111122;margin-right:8px;flex-shrink:0;}
.mds-preview{background:#f8f9fa;border-radius:20px;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:30px;min-height:300px;padding:40px;flex-wrap:wrap;}
.mds-tag{display:inline-block;padding:3px 10px;border-radius:6px;background:#f0f0f5;font-family:'SF Mono','Fira Code',monospace;font-size:13px;color:#55557A;margin-right:4px;}
.mds-tag-default{background:#E6F9EE;color:#03A94D;}
.mds-variant-grid{display:flex;flex-wrap:wrap;gap:20px;background:#f8f9fa;border-radius:16px;padding:100px 24px;align-items:flex-end;justify-content:center;}
.mds-variant-item{display:flex;flex-direction:column;align-items:center;gap:10px;}
.mds-variant-item img{max-height:120px;width:auto;object-fit:contain;}
.mds-variant-item span{font-size:13px;font-family:'SF Mono','Fira Code',monospace;color:#55557A;white-space:nowrap;}
.mds-divider{border:none;border-top:1px solid #E4E4EE;margin:60px 0;}
</style></head><body>
<div class="mds-wiki">
  <h1 class="mds-title">${esc(d.name)}</h1>
  <p class="mds-desc">${esc(d.description)}</p>
  ${d.anatomy.imageUrl || (d.anatomy.slots && d.anatomy.slots.length > 0) ? `<div class="mds-section">
    <h2 class="mds-subsection-title">Measurement</h2>
    <div class="mds-anatomy-image">${anatomyImg}</div>
    ${slotsRows ? `<table class="mds-table">
      <thead><tr><th style="width:220px;">Slots Name</th><th>Description</th><th style="width:220px;">Value</th></tr></thead>
      <tbody>${slotsRows}</tbody>
    </table>` : ""}
  </div>
  <hr class="mds-divider"/>` : ""}
  <div class="mds-section">
    <h2 class="mds-section-title">Properties</h2>
    ${propertySections}
  </div>
</div>
</body></html>`;
}

// ─── Publish to Figma (open standalone preview) ──────────
document.getElementById("btn-figma-publish").onclick = () => {
  if (!currentId) return;
  window.open(`/preview/${currentId}`, "_blank");
  toast("Figma에서 이 페이지를 캡처하세요", "success");
};

// ─── Publish to Confluence ─────────────────────────────────
document.getElementById("btn-publish").onclick = async () => {
  if (!componentData) return;

  // Sync fields
  componentData.name = document.getElementById("field-name").value;
  componentData.description = document.getElementById("field-desc").value;

  const title = componentData.name;
  const html = generateConfluenceHTML(componentData);

  if (!confirm(`"${title}" 페이지를 Confluence에 발행합니다.\n계속하시겠습니까?`)) return;

  try {
    const res = await api.post("/api/web/publish", { componentId: currentId, title, html });
    if (res.error) {
      toast(res.error, "error");
    } else {
      toast(`${res.action === "created" ? "새 페이지 생성" : "페이지 업데이트"} 완료!`, "success");
      if (res.url) window.open(res.url, "_blank");
    }
  } catch (err) {
    toast("발행 실패: " + err.message, "error");
  }
};

function generateConfluenceHTML(d) {
  // All inline styles for Confluence compatibility (no <style> tags)
  const slotsRows = (d.anatomy.slots || []).map((s) => `
    <tr>
      <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:16px;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:100px;border:1.2px solid #111122;background:rgba(0,0,0,0.04);font-size:10px;font-weight:800;letter-spacing:-0.5px;color:#111122;margin-right:8px;">${s.number}</span>${esc(s.name)}
      </td>
      <td style="font-size:16px;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.description)}</td>
      <td style="font-family:'SF Mono','Fira Code',monospace;color:#2e2e2e;font-size:16px;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);vertical-align:middle;">${esc(s.value)}</td>
    </tr>
  `).join("");

  // Anatomy image with markers and guides
  let anatomySection = "";
  if (d.anatomy.imageUrl) {
    const guides = d.anatomy.guides || [];
    const markers = d.anatomy.markers || [];
    let guideHtml = "";
    guides.forEach((g) => {
      guideHtml += `<div style="position:absolute;left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;border:1.5px solid rgba(180,60,200,0.45);background:rgba(180,60,200,0.06);border-radius:3px;z-index:2;"></div>`;
    });
    let markerHtml = "";
    markers.forEach((m) => {
      const line = {up:`width:1.5px;height:20px;bottom:100%;left:50%;transform:translateX(-50%)`,down:`width:1.5px;height:20px;top:100%;left:50%;transform:translateX(-50%)`,left:`height:1.5px;width:20px;right:100%;top:50%;transform:translateY(-50%)`,right:`height:1.5px;width:20px;left:100%;top:50%;transform:translateY(-50%)`}[m.direction]||`width:1.5px;height:20px;bottom:100%;left:50%;transform:translateX(-50%)`;
      markerHtml += `<div data-x="${m.x}" data-y="${m.y}" style="position:absolute;transform:translate(-50%,-50%);z-index:3;">
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
        const sizeAttr = vi.width && vi.height
          ? `width="${vi.width}" height="${vi.height}"`
          : "";
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
          <img src="${vi.imageUrl}" alt="${esc(vi.label)}" ${sizeAttr} style="max-height:120px;width:auto;object-fit:contain;" />
          <span style="font-size:13px;font-family:'SF Mono','Fira Code',monospace;color:#55557A;white-space:nowrap;">${esc(vi.label)}</span>
        </div>`;
      }).join("");
      img = `<div style="display:flex;flex-wrap:wrap;gap:20px;background:#f8f9fa;border-radius:16px;padding:100px 24px;align-items:flex-end;justify-content:center;">${items}</div>`;
    } else if (p.imageUrl) {
      img = `<div style="background:#f8f9fa;border-radius:20px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:300px;padding:40px;"><img src="${p.imageUrl}" alt="${esc(p.title)}" style="max-width:100%;height:auto;" /></div>`;
    }

    return `
      <div style="margin-bottom:40px;">
        <h3 style="font-size:24px;font-weight:700;line-height:32px;letter-spacing:-0.3px;margin:0 0 16px;">${esc(p.title)}</h3>
        <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 20px;">${esc(p.description)}</p>
        ${tags ? `<p style="margin:0 0 20px;">${tags}</p>` : ""}
        ${img}
      </div>`;
  }).join("");

  return `<div style="font-family:'Pretendard Variable','Pretendard',-apple-system,sans-serif;color:#111122;max-width:1024px;margin:0 auto;padding:50px 40px;border-radius:36px;background:#fff;">
  <div style="font-size:40px;font-weight:800;letter-spacing:-0.3px;line-height:1.1;margin:0 0 12px;background:transparent;">${esc(d.name)}</div>
  <p style="font-size:16px;font-weight:400;line-height:21px;letter-spacing:-0.3px;margin:0 0 60px;">${esc(d.description)}</p>
  ${d.anatomy.imageUrl || (d.anatomy.slots && d.anatomy.slots.length > 0) ? `<div style="margin-bottom:60px;">
    <h2 style="font-size:24px;font-weight:700;line-height:32px;letter-spacing:-0.3px;margin:0 0 16px;">Measurement</h2>
    <div style="margin-bottom:20px;">${anatomySection}</div>
    ${slotsRows ? `<table style="width:100%;border-collapse:collapse;border:1px solid rgba(0,0,0,0.15);border-radius:12px;overflow:hidden;margin-bottom:40px;">
      <thead><tr>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Slots Name</th>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);">Description</th>
        <th style="background:#f8f9fa;font-family:'SF Mono','Fira Code',monospace;font-size:16px;font-weight:700;color:#2e2e2e;text-align:left;padding:6px 20px;height:34px;border-bottom:1px solid rgba(0,0,0,0.08);width:220px;">Value</th>
      </tr></thead>
      <tbody>${slotsRows}</tbody>
    </table>` : ""}
  </div>
  <hr style="border:none;border-top:1px solid #E4E4EE;margin:60px 0;"/>` : ""}
  ${propertySections}
</div>`;
}

// ─── Settings Modal ────────────────────────────────────────
document.getElementById("btn-settings").onclick = async () => {
  const config = await api.get("/api/web/config");
  document.getElementById("cfg-figma-token").value = config.figmaToken || "";
  document.getElementById("cfg-base-url").value = config.confluenceBaseUrl || "";
  document.getElementById("cfg-space-key").value = config.spaceKey || "";
  document.getElementById("cfg-parent-page").value = config.parentPageId || "";
  document.getElementById("cfg-confluence-user").value = config.confluenceUser || "";
  document.getElementById("cfg-token").value = config.token || "";
  document.getElementById("modal-settings").style.display = "flex";
};
document.getElementById("btn-cfg-cancel").onclick = () => {
  document.getElementById("modal-settings").style.display = "none";
};
document.querySelector(".modal-backdrop").onclick = () => {
  document.getElementById("modal-settings").style.display = "none";
};
document.getElementById("btn-cfg-save").onclick = async () => {
  await api.put("/api/web/config", {
    figmaToken: document.getElementById("cfg-figma-token").value,
    confluenceBaseUrl: document.getElementById("cfg-base-url").value.replace(/\/$/, ""),
    spaceKey: document.getElementById("cfg-space-key").value,
    parentPageId: document.getElementById("cfg-parent-page").value,
    confluenceUser: document.getElementById("cfg-confluence-user").value,
    token: document.getElementById("cfg-token").value,
  });
  document.getElementById("modal-settings").style.display = "none";
  toast("설정 저장 완료", "success");
};

// ─── Utils ─────────────────────────────────────────────────
function esc(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Init ──────────────────────────────────────────────────
loadSidebar();
