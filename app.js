"use strict";
const $ = (id) => document.getElementById(id);
const storageKey = "delta-thermal-tools-v1";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const add = {
  id: "+",
  name: "新增工具",
  short: "新增工具",
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
  [...$("cars").children].forEach((el, i) => {
    const a = (i * 2 * Math.PI) / slots.length + angle;
    el.style.left = 50 + 34 * Math.sin(a) + "%";
    el.style.top = 50 - 38 * Math.cos(a) + "%";
    $("spokes").children[i].style.transform = "rotate(" + a + "rad)";
  });
}
function preview() {
  const t = slots[current],
    isAdd = t.id === "+",
    blocked = busy || target !== current;
  safeImage($("hero"), t);
  $("fig").textContent = isAdd
    ? "TOOL LIBRARY"
    : "TOOL / " + String(group * 7 + current + 1).padStart(2, "0");
  $("category").textContent = t.category + "  /  " + t.tag;
  $("name").textContent = t.name;
  $("en").textContent = t.en || "";
  $("summary").textContent = t.summary;
  $("launch").textContent = isAdd ? "＋ 新增工具" : "開啟工具 ↗";
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
      "發佈後，工具名稱、簡介和網址將顯示在公開工具輪盤。自訂圖片僅保留於原瀏覽器。\n\n" +
        JSON.stringify(record),
    );
    $("share").href = issue.href;
  }
  $("repo").hidden = blocked || !validUrl(t.repoUrl);
  if (!$("repo").hidden) $("repo").href = t.repoUrl;
  [...$("cars").children].forEach((c, i) => {
    c.classList.toggle("active", i === current);
    c.setAttribute("aria-pressed", String(i === current));
  });
}
function render(selected = 0) {
  epoch++;
  busy = false;
  slots = [...all.slice(group * 7, group * 7 + 7), add];
  current = target = selected;
  rotation = (-selected * 2 * Math.PI) / slots.length;
  $("cars").replaceChildren();
  $("spokes").replaceChildren();
  slots.forEach((t, i) => {
    const c = document.createElement("button");
    c.className = "car";
    c.setAttribute("aria-label", t.name);
    const label = document.createElement("span");
    label.textContent = t.short || t.name;
    if (t === add) {
      c.classList.add("add");
      const plus = document.createElement("b");
      plus.textContent = "＋";
      c.append(plus);
    } else {
      const image = new Image();
      image.alt = "";
      safeImage(image, t);
      c.append(image);
    }
    c.append(label);
    c.onclick = () => {
      if (suppressClick) return;
      if (t === add) openForm();
      else choose(i);
    };
    $("cars").append(c);
    const spoke = document.createElement("div");
    spoke.className = "spoke";
    $("spokes").append(spoke);
  });
  $("total").textContent = String(all.length).padStart(2, "0") + " TOOLS";
  $("groups").replaceChildren();
  if (all.length > 7) {
    const pages = Math.ceil(all.length / 7);
    [-1, 1].forEach((d) => {
      const btn = document.createElement("button");
      btn.textContent = d < 0 ? "上一組" : "下一組";
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
  if (target === current) {
    busy = false;
    preview();
    return;
  }
  const n = slots.length,
    d = mod(target - current, n) <= n / 2 ? 1 : -1,
    offset = rotation,
    change = (-d * 2 * Math.PI) / n,
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
    current = mod(current + d, n);
    if (!reduce.matches)
      $("preview").animate([{ opacity: 0.55 }, { opacity: 1 }], {
        duration: 210,
      });
    step();
  }
  requestAnimationFrame(frame);
}
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
$("theme").value = mode;
$("theme").onchange = (e) => {
  mode = e.target.value;
  try {
    localStorage.setItem("backgroundMode", mode);
  } catch {}
  scene();
};
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
    r.onerror = () => reject(Error("圖片讀取失敗。"));
    r.readAsDataURL(file);
  });
}
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
      throw Error("網址須以 http 或 https 開頭。");
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
        ? "儲存空間不足，請縮小圖片後重試。"
        : error.message;
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
