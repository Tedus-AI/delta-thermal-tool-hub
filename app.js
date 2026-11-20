"use strict";
const $ = (id) => document.getElementById(id);
const storageKey = "delta-thermal-tools-v1";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const add = {
  id: "+",
  name: "Add tool",
  short: "Add tool",
  category: "工具管理",
  tag: "TOOL LIBRARY",
  summary: "將常用工具加入輪盤，快速開啟下一個工程任務。",
};
function validUrl(value) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function listTools() {
  const items = JSON.parse(localStorage.getItem(storageKey) || "[]");
  return Array.isArray(items)
    ? items.filter(
        (t) => t && typeof t.name === "string" && validUrl(t.launchUrl),
      )
    : [];
}
function createTool(t) {
  const items = listTools();
  if (!items.some((x) => x.id === t.id))
    localStorage.setItem(storageKey, JSON.stringify([...items, t]));
}
let local = [];
try {
  local = listTools();
} catch {}
let shared = [];
function catalog() {
  return [
    ...defaults,
    ...shared,
    ...local.filter((t) => !shared.some((s) => s.id === t.id)),
  ];
}
let all = catalog(),
  group = 0,
  slots = [],
  current = 0,
  target = 0,
  rotation = 0,
  busy = false,
  epoch = 0;
const mod = (n, m) => ((n % m) + m) % m;
function safeImage(img, t) {
  img.onerror = () => {
    img.onerror = null;
    img.src = "assets/delta.png";
    img.style.objectFit = "contain";
  };
  img.style.objectFit = "";
  img.src = t.image || "assets/delta.png";
}
function position(angle) {
  $("rotor").style.transform = "rotate(" + angle + "rad)";
  [...$("cars").children].forEach((el, i) => {
    const a = (i * 2 * Math.PI) / slots.length + angle;
    el.style.left = 50 + 38 * Math.sin(a) + "%";
    el.style.top = 46 - 38 * Math.cos(a) + "%";
  });
}
function preview() {
  const t = slots[current],
    isAdd = t.id === "+",
    blocked = busy || target !== current;
  const hero = $("hero");
  hero.closest("figure").hidden = isAdd;
  if (!isAdd) safeImage(hero, t);
  $("fig").textContent = isAdd
    ? "TOOL LIBRARY"
    : "TOOL / " + String(group * 7 + current + 1).padStart(2, "0");
  $("category").textContent = t.tag;
  $("name").textContent = t.name;
  $("en").textContent = t.en || "";
  $("summary").textContent = t.summary;
  $("launch").textContent = isAdd ? "Add tool" : "Open tool ↗";
  $("launch").setAttribute("aria-disabled", String(blocked));
  if (blocked) $("launch").removeAttribute("href");
  else $("launch").href = isAdd ? "#add" : t.launchUrl;
  const localOnly =
    local.some((x) => x.id === t.id) && !shared.some((x) => x.id === t.id);
  $("share").hidden = !localOnly || blocked;
  if (localOnly) {
    const record = {
      id: t.id,
      name: t.name,
      short: t.short,
      summary: t.summary,
      launchUrl: t.launchUrl,
      repoUrl: t.repoUrl,
    };
    const issue = new URL(
      "https://github.com/Tedus-AI/delta-thermal-tool-hub/issues/new",
    );
    issue.searchParams.set("title", "[Tool Hub] " + t.name);
    issue.searchParams.set(
      "body",
      "Publishing shares the tool name, description and URL on the public wheel. Custom images stay in this browser.\n\n" +
        JSON.stringify(record),
    );
    $("share").href = issue.href;
  }
  [...$("cars").children].forEach((c, i) => {
    c.classList.toggle("active", i === current);
    c.setAttribute("aria-pressed", String(i === current));
  });
}
function render(selected = 0) {
  hoveredCar = null;
  epoch++;
  busy = false;
  slots = [...all.slice(group * 7, group * 7 + 7), add];
  current = target = selected;
  rotation = (-selected * 2 * Math.PI) / slots.length;
  $("cars").replaceChildren();

  slots.forEach((t, i) => {
    const c = document.createElement("button");
    c.className = "car";
    const cabinName = /^[\x20-\x7e]+$/.test(t.short || "")
      ? t.short
      : "Tool " + (group * 7 + i + 1);
    c.setAttribute("aria-label", t.en || cabinName);
    const label = document.createElement("span");
    label.textContent = cabinName;
    if (t === add) {
      c.classList.add("add");
      const window = document.createElement("i");
      window.className = "empty-window";
      c.append(window);
    } else {
      const image = new Image();
      image.alt = "";
      safeImage(image, t);
      c.append(image);
    }
    c.append(label);
    c.onpointerenter = (e) => {
      if (e.pointerType !== "touch") hoveredCar = c;
    };
    c.onpointerleave = () => {
      if (hoveredCar === c) hoveredCar = null;
    };
    c.onclick = () => {
      if (suppressClick) return;
      if (t === add) openForm();
      else choose(i);
    };
    $("cars").append(c);
  });
  $("groups").replaceChildren();
  if (all.length > 7) {
    const pages = Math.ceil(all.length / 7);
    [-1, 1].forEach((d) => {
      const btn = document.createElement("button");
      btn.textContent = d < 0 ? "Previous group" : "Next group";
      btn.disabled = group + d < 0 || group + d >= pages;
      btn.onclick = () => {
        group += d;
        render();
      };
      $("groups").append(btn);
    });
  }
  position(rotation);
  preview();
}
function choose(i) {
  target = mod(i, slots.length);
  if (!busy) step();
}
function step() {
  const n = slots.length,
    spacing = (2 * Math.PI) / n;
  const aligned = Math.round(-rotation / spacing);
  const distance = mod(target - aligned, n);
  const next = aligned + (distance === 0 ? 0 : distance <= n / 2 ? 1 : -1);
  const destination = -next * spacing;
  if (Math.abs(destination - rotation) < 1e-9 && target === current) {
    busy = false;
    preview();
    return;
  }
  const offset = rotation,
    change = destination - offset,
    key = epoch;
  busy = true;
  preview();
  const start = performance.now();
  function frame(now) {
    if (key !== epoch) return;
    const p = reduce.matches ? 1 : Math.min(1, (now - start) / 390);
    rotation = offset + change * (0.5 - 0.5 * Math.cos(p * Math.PI));
    position(rotation);
    if (p < 1) {
      requestAnimationFrame(frame);
      return;
    }
    rotation = destination;
    current = mod(next, n);
    if (!reduce.matches)
      $("preview").animate([{ opacity: 0.55 }, { opacity: 1 }], {
        duration: 210,
      });
    step();
  }
  requestAnimationFrame(frame);
}
const revolutionMs = 120000;
let hoveredCar = null;
let previousFrame = null;
function cruise(now) {
  const elapsed =
    previousFrame === null ? 0 : Math.min(now - previousFrame, 100);
  previousFrame = now;
  if (
    !busy &&
    !hoveredCar &&
    !document.hidden &&
    !$("dialog").open &&
    !reduce.matches
  ) {
    const turn = 2 * Math.PI;
    rotation = -mod(-rotation + (turn * elapsed) / revolutionMs, turn);
    position(rotation);
    // Keep the last arrival selected until the next cabin crosses twelve o'clock.
    const arrived = mod(
      Math.floor((-rotation * slots.length) / turn + 1e-10),
      slots.length,
    );
    if (arrived !== current) {
      current = target = arrived;
      preview();
    }
  }
  requestAnimationFrame(cruise);
}
document.addEventListener("visibilitychange", () => {
  previousFrame = null;
});
requestAnimationFrame(cruise);
$("prev").onclick = () => choose(target - 1);
$("next").onclick = () => choose(target + 1);
let startX = null,
  suppressClick = false,
  lastWheel = 0;
$("stage").onpointerdown = (e) => {
  startX = e.clientX;
  suppressClick = false;
};
window.addEventListener("pointerup", (e) => {
  if (startX !== null && Math.abs(e.clientX - startX) > 30) {
    suppressClick = true;
    choose(target + (e.clientX < startX ? 1 : -1));
    setTimeout(() => (suppressClick = false), 100);
  }
  startX = null;
});
window.addEventListener("pointercancel", () => (startX = null));
$("stage").addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 3) return;
    e.preventDefault();
    if (Date.now() - lastWheel > 350) {
      choose(target + Math.sign(e.deltaY || e.deltaX));
      lastWheel = Date.now();
    }
  },
  { passive: false },
);
document.addEventListener("keydown", (e) => {
  if (
    $("dialog").open ||
    e.target.matches("input,select,textarea") ||
    e.altKey ||
    e.metaKey ||
    e.ctrlKey
  )
    return;
  if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    choose(target + (e.key === "ArrowRight" ? 1 : -1));
  }
});
const picker = $("theme");
const track = picker.querySelector(".scene-track");
const drop = picker.querySelector(".scene-drop");
const choices = [...picker.querySelectorAll("input")];

let drag = null;
let suppressPickerClick = false;

function placeDrop(index) {
  track.style.setProperty("--position", index);
}
function selectScene(choice, persist) {
  choice.checked = true;
  mode = choice.value;
  placeDrop(choices.indexOf(choice));
  if (persist) {
    try {
      localStorage.setItem("backgroundMode", mode);
    } catch {}
    if (!reduce.matches && drop.animate) {
      drop.firstElementChild.animate(
        [
          { transform: "scale(1.12,.86)" },
          { transform: "scale(.96,1.07)", offset: 0.48 },
          { transform: "scale(1)" },
        ],
        { duration: 320, easing: "ease-out" },
      );
    }
  }
  scene();
}
selectScene(
  choices.find((choice) => choice.value === mode) || choices[0],
  false,
);
picker.addEventListener("change", (e) => selectScene(e.target, true));
track.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary || e.button !== 0) return;
  suppressPickerClick = false;
  drag = { id: e.pointerId, start: e.clientX, moved: false };
});
function dropIndex(x) {
  const bounds = track.getBoundingClientRect();
  return Math.max(0, Math.min(3, ((x - bounds.left) * 4) / bounds.width - 0.5));
}
track.addEventListener("pointermove", (e) => {
  if (drag?.id !== e.pointerId) return;
  if (!drag.moved && Math.abs(e.clientX - drag.start) < 4) return;
  if (!drag.moved) {
    track.setPointerCapture(e.pointerId);
    drag.moved = true;
    track.classList.add("dragging");
  }
  placeDrop(dropIndex(e.clientX));
});
function finishDrag(e, commit) {
  if (drag?.id !== e.pointerId) return;
  const moved = drag.moved;
  drag = null;
  track.classList.remove("dragging");
  if (moved && commit) {
    suppressPickerClick = true;
    const choice = choices[Math.round(dropIndex(e.clientX))];
    selectScene(choice, true);
    choice.focus({ preventScroll: true });
  } else placeDrop(choices.findIndex((choice) => choice.checked));
}
window.addEventListener("pointerup", (e) => finishDrag(e, true));
window.addEventListener("pointercancel", (e) => finishDrag(e, false));
track.addEventListener(
  "click",
  (e) => {
    if (suppressPickerClick && e.detail) {
      e.preventDefault();
      suppressPickerClick = false;
    }
  },
  true,
);
setInterval(scene, 1000);
document.addEventListener("visibilitychange", scene);
let returnTo;
function openForm() {
  returnTo = document.activeElement;
  $("dialog").showModal();
}
$("dialog").onclose = () => {
  if (returnTo?.isConnected) returnTo.focus();
  else $("cars").children[current].focus();
};
$("launch").onclick = (e) => {
  if (busy || slots[current] === add) {
    e.preventDefault();
    if (!busy) openForm();
  }
};
$("cancel").onclick = () => $("dialog").close();
function readImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("無法讀取圖片，請重新選擇。"));
    r.readAsDataURL(file);
  });
}
const toolForm = $("form");
toolForm.addEventListener(
  "invalid",
  (e) => {
    const field = e.target;
    if (field.validity.valueMissing)
      field.setCustomValidity("請填寫這個欄位。");
    else if (field.validity.typeMismatch)
      field.setCustomValidity("請輸入完整網址，例如 https://example.com。");
  },
  true,
);
toolForm.addEventListener("input", (e) => e.target.setCustomValidity(""));
toolForm.elements.image.addEventListener("change", (e) => {
  $("file-name").textContent = e.target.files[0]?.name || "尚未選擇圖片";
});
toolForm.addEventListener("reset", () => {
  $("file-name").textContent = "尚未選擇圖片";
});
$("form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target,
    b = f.querySelector(".primary");
  if (b.disabled) return;
  b.disabled = true;
  $("error").textContent = "";
  try {
    const data = new FormData(f),
      get = (k) => String(data.get(k) || "").trim(),
      name = get("name"),
      summary = get("summary"),
      launchUrl = get("launchUrl"),
      repoUrl = get("repoUrl");
    if (!name || !summary) throw Error("請填寫工具名稱和簡介。");
    if (!validUrl(launchUrl) || (repoUrl && !validUrl(repoUrl)))
      throw Error("網址須以 http:// 或 https:// 開頭。");
    const file = data.get("image");
    if (
      file.size > 1024 * 1024 ||
      (file.size &&
        !["image/png", "image/jpeg", "image/webp"].includes(file.type))
    )
      throw Error("請選擇 1 MB 以內的 PNG、JPEG 或 WebP 圖片。");
    const t = {
      id: crypto.randomUUID(),
      name,
      summary,
      short: get("short") || name,
      category: "自訂工具",
      tag: "CUSTOM TOOL",
      launchUrl,
      repoUrl,
      image: file.size ? await readImage(file) : "",
    };
    createTool(t);
    local = listTools();
    all = catalog();
    const idx = all.findIndex((x) => x.id === t.id);
    group = Math.floor(idx / 7);
    render(idx % 7);
    f.reset();
    $("dialog").close();
  } catch (error) {
    $("error").textContent =
      error.name === "QuotaExceededError"
        ? "儲存空間不足，請縮小圖片後再試。"
        : /[\u3400-\u9fff]/.test(error.message)
          ? error.message
          : "儲存失敗，請確認瀏覽器允許儲存資料後再試。";
  } finally {
    b.disabled = false;
  }
};
render();

async function loadSharedTools() {
  const items = new Map();
  let page = 1;
  try {
    while (true) {
      const url = new URL(
        "https://api.github.com/repos/Tedus-AI/delta-thermal-tool-hub/issues",
      );
      url.search = new URLSearchParams({
        state: "open",
        per_page: "100",
        page: String(page),
      });
      const res = await fetch(url);
      if (!res.ok) return;
      const issues = await res.json();
      for (const issue of issues) {
        if (
          issue.pull_request ||
          !["OWNER", "MEMBER", "COLLABORATOR"].includes(
            issue.author_association,
          ) ||
          !issue.title.startsWith("[Tool Hub] ")
        )
          continue;
        try {
          const t = JSON.parse(issue.body.trim().split("\n").pop());
          if (
            !/^[0-9a-f-]{36}$/i.test(t.id) ||
            typeof t.name !== "string" ||
            typeof t.summary !== "string" ||
            !validUrl(t.launchUrl)
          )
            continue;
          items.set(t.id, {
            id: t.id,
            name: t.name.slice(0, 100),
            short: String(t.short || t.name).slice(0, 16),
            summary: t.summary.slice(0, 360),
            launchUrl: t.launchUrl,
            repoUrl: validUrl(t.repoUrl) ? t.repoUrl : "",
            image: local.find((x) => x.id === t.id)?.image,
            category: "團隊工具",
            tag: "TEAM TOOL",
          });
        } catch {}
      }
      if (issues.length < 100) break;
      page++;
    }
    if (!items.size) return;
    const selected = slots[target].id;
    shared = [...items.values()].reverse();
    all = catalog();
    if (selected === add.id) {
      render(Math.min(7, all.length - group * 7));
      return;
    }
    const index = all.findIndex((t) => t.id === selected);
    group = Math.floor(index / 7);
    render(index % 7);
  } catch {}
}
loadSharedTools();

// Background settings: location picker and live defocus slider.
const settingsBtn = $("settings-btn");
const settings = $("settings");
const blur = $("blur");
const blurValue = $("blur-value");
const blurControl = $("blur-control");
const BLUR_DEFAULT = 95;

function openSettings(open) {
  settings.hidden = !open;
  settingsBtn.setAttribute("aria-expanded", open);
}
settingsBtn.addEventListener("click", () => openSettings(settings.hidden));
document.addEventListener("pointerdown", (e) => {
  if (!settings.hidden && !settings.contains(e.target) && !settingsBtn.contains(e.target))
    openSettings(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settings.hidden) {
    openSettings(false);
    settingsBtn.focus();
  }
});

function syncBlurControl() {
  const off = document.documentElement.dataset.backdrop === "none";
  blur.disabled = off;
  blurControl.classList.toggle("disabled", off);
}
for (const input of document.querySelectorAll('input[name="backdrop"]')) {
  input.checked = input.value === document.documentElement.dataset.backdrop;
  input.addEventListener("change", () => {
    document.documentElement.dataset.backdrop = input.value;
    syncBlurControl();
    try {
      localStorage.setItem("backdrop", input.value);
    } catch {}
  });
}
syncBlurControl();

function setBlur(pct, persist) {
  blur.value = pct;
  blurValue.textContent = pct + "%";
  applyBlur(pct);
  if (persist) {
    try {
      localStorage.setItem("backdropBlur", pct);
    } catch {}
  }
}
setBlur(blurPct, false);
blur.addEventListener("input", () => setBlur(+blur.value, true));
// 3D centre mark: rounded tetrahedron with optional RGB lighting on the mark.
const TETRA_DEFAULTS = { radius: 0.01, period: 120, mode: "static" };
const tetraOpts = { ...TETRA_DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem("tetra") || "{}");
  if (saved.radius >= 0 && saved.radius <= 0.05) tetraOpts.radius = saved.radius;
  if (saved.period >= 10 && saved.period <= 240) tetraOpts.period = saved.period;
  if (["static", "wave", "breathe"].includes(saved.mode)) tetraOpts.mode = saved.mode;
} catch {}
let tetra = null;
const tetraR = $("tetra-r");
const tetraPeriod = $("tetra-period");
const lightInputs = [...document.querySelectorAll('input[name="tetraLight"]')];

function saveTetra() {
  try {
    localStorage.setItem("tetra", JSON.stringify(tetraOpts));
  } catch {}
}
function syncTetraControls() {
  tetraR.value = tetraOpts.radius;
  $("tetra-r-out").textContent = tetraOpts.radius.toFixed(3);
  tetraPeriod.value = tetraOpts.period;
  $("tetra-period-out").textContent = tetraOpts.period + " 秒";
  lightInputs.forEach((i) => (i.checked = i.value === tetraOpts.mode));
}
syncTetraControls();
tetraR.addEventListener("input", () => {
  tetraOpts.radius = +tetraR.value;
  syncTetraControls();
  tetra?.setRadius(tetraOpts.radius);
  saveTetra();
});
tetraPeriod.addEventListener("input", () => {
  tetraOpts.period = +tetraPeriod.value;
  syncTetraControls();
  tetra?.setPeriod(tetraOpts.period);
  saveTetra();
});
lightInputs.forEach((input) =>
  input.addEventListener("change", () => {
    tetraOpts.mode = input.value;
    tetra?.setMode(tetraOpts.mode);
    saveTetra();
  }),
);
if (window.DeltaTetra) {
  DeltaTetra.mount($("tetra"), {
    ...tetraOpts,
    fit: 0.8,
    playing: !reduce.matches,
  })
    .then((ctrl) => {
      tetra = ctrl;
      $("tetra").parentElement.classList.add("is-3d");
      reduce.addEventListener?.("change", () => (ctrl.state.playing = !reduce.matches));
    })
    .catch(() => {}); // no WebGL / offline: keep the flat logo
}

$("blur-reset").addEventListener("click", () => {
  setBlur(BLUR_DEFAULT, true);
  Object.assign(tetraOpts, TETRA_DEFAULTS);
  syncTetraControls();
  tetra?.setRadius(tetraOpts.radius);
  tetra?.setPeriod(tetraOpts.period);
  tetra?.setMode(tetraOpts.mode);
  saveTetra();
});
