// ── Firebase SDK (ESM) ──────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Constants ───────────────────────────────────────────────────────
const CATS = [
  { name: "ที่อยู่อาศัย",    icon: "🏠", bg: "#E6F1FB" },
  { name: "อาหาร",           icon: "🍜", bg: "#EAF3DE" },
  { name: "การเดินทาง",      icon: "🚗", bg: "#FAEEDA" },
  { name: "สุขภาพ",          icon: "💊", bg: "#FCEBEB" },
  { name: "การศึกษา",        icon: "📚", bg: "#EEEDFE" },
  { name: "ความบันเทิง",     icon: "🎮", bg: "#FBEAF0" },
  { name: "สาธารณูปโภค",    icon: "💡", bg: "#E1F5EE" },
  { name: "การสื่อสาร",      icon: "📱", bg: "#F1EFE8" },
  { name: "ประกัน",          icon: "🛡️", bg: "#E6F1FB" },
  { name: "อื่นๆ",           icon: "📋", bg: "#F1EFE8" },
];

const TH_MONTHS = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"
];
const TH_MONTHS_SHORT = [
  "ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
  "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."
];

// ── State ────────────────────────────────────────────────────────────
let db = null;
let unsubscribe = null;
let allItems = [];
let editId = null;

const now = new Date();
let curMonth = now.getMonth();
let curYear  = now.getFullYear();

// ── Theme ────────────────────────────────────────────────────────────
const THEMES = ["warm", "ocean", "forest", "midnight"];

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = "warm";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("app_theme", theme);
  // Update active button
  THEMES.forEach(t => {
    const btn = document.getElementById("theme-" + t);
    if (btn) btn.classList.toggle("active", t === theme);
  });
}

window.setTheme = (theme) => applyTheme(theme);

// ── Config helpers ───────────────────────────────────────────────────
function getConfig() {
  try { return JSON.parse(localStorage.getItem("fb_config") || "null"); }
  catch { return null; }
}

window.saveConfig = () => {
  const cfg = {
    apiKey:    document.getElementById("cfg-apiKey").value.trim(),
    projectId: document.getElementById("cfg-projectId").value.trim(),
    appId:     document.getElementById("cfg-appId").value.trim(),
  };
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    showToast("กรุณากรอกข้อมูลให้ครบ"); return;
  }
  localStorage.setItem("fb_config", JSON.stringify(cfg));
  location.reload();
};

window.resetConfig = () => {
  if (!confirm("ลบ Config ออก? (ข้อมูลใน Firestore จะยังอยู่)")) return;
  localStorage.removeItem("fb_config");
  location.reload();
};

window.updateConfig = () => {
  const cfg = {
    apiKey:    document.getElementById("s-apiKey").value.trim(),
    projectId: document.getElementById("s-projectId").value.trim(),
    appId:     document.getElementById("s-appId").value.trim(),
  };
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    showToast("กรุณากรอกข้อมูลให้ครบ"); return;
  }
  localStorage.setItem("fb_config", JSON.stringify(cfg));
  showToast("บันทึก Config แล้ว");
  toggleSettings();
  location.reload();
};

// ── Firebase init ────────────────────────────────────────────────────
function initFirebase(cfg) {
  const app = initializeApp({
    apiKey:            cfg.apiKey,
    authDomain:        `${cfg.projectId}.firebaseapp.com`,
    projectId:         cfg.projectId,
    storageBucket:     `${cfg.projectId}.appspot.com`,
    messagingSenderId: "000000000000",
    appId:             cfg.appId,
  });
  db = getFirestore(app);
}

// ── Realtime listener ────────────────────────────────────────────────
function startListener() {
  const q = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q,
    (snap) => {
      allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSyncStatus("🟢 ซิงค์แล้ว");
      renderAll();
    },
    (err) => {
      console.error(err);
      setSyncStatus("🔴 เชื่อมต่อไม่ได้: " + err.code);
    }
  );
}

// ── CRUD ─────────────────────────────────────────────────────────────
async function addItem(data) {
  data.createdAt = Date.now();
  await addDoc(collection(db, "expenses"), data);
}

async function updateItem(id, data) {
  await updateDoc(doc(db, "expenses", id), data);
}

window.deleteItem = async (id) => {
  if (!confirm("ลบรายการนี้?")) return;
  await deleteDoc(doc(db, "expenses", id));
  showToast("ลบแล้ว");
};

window.togglePaid = async (id) => {
  const item = allItems.find(x => x.id === id);
  if (!item) return;
  await updateItem(id, { paid: !item.paid });
};

// ── Month navigation ─────────────────────────────────────────────────
window.changeMonth = (d) => {
  curMonth += d;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  if (curMonth < 0)  { curMonth = 11; curYear--; }
  renderAll();
};

// ── Render ───────────────────────────────────────────────────────────
function getMonthItems() {
  return allItems.filter(i => i.month === curMonth && i.year === curYear);
}

function fmt(n) {
  return "฿" + Math.round(n).toLocaleString("th-TH");
}

function catInfo(name) {
  return CATS.find(c => c.name === name) || CATS[CATS.length - 1];
}

function renderAll() {
  updateHeader();
  updateSummary();
  updateCatFilter();
  renderList();
}

function updateHeader() {
  document.getElementById("month-label").textContent =
    TH_MONTHS[curMonth] + " " + (curYear + 543);
}

function updateSummary() {
  const mi = getMonthItems();
  const total  = mi.reduce((s, i) => s + (i.amount || 0), 0);
  const paid   = mi.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
  const unpaid = total - paid;
  const paidCount   = mi.filter(i => i.paid).length;
  const unpaidCount = mi.filter(i => !i.paid).length;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;

  document.getElementById("total-all").textContent    = fmt(total);
  document.getElementById("total-paid").textContent   = fmt(paid);
  document.getElementById("total-unpaid").textContent = fmt(unpaid);
  document.getElementById("count-all").textContent    = mi.length + " รายการ";
  document.getElementById("count-paid").textContent   = paidCount + " รายการ";
  document.getElementById("count-unpaid").textContent = unpaidCount + " รายการ";
  document.getElementById("progress-pct").textContent = pct + "%";
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("header-sub").textContent   =
    mi.length + " รายการ · " + fmt(total);
}

function updateCatFilter() {
  const sel = document.getElementById("filter-cat");
  const cur = sel.value;
  const used = [...new Set(allItems.map(i => i.cat))];
  sel.innerHTML = '<option value="">ทุกหมวด</option>';
  CATS.filter(c => used.includes(c.name)).forEach(c => {
    const o = document.createElement("option");
    o.value = c.name; o.textContent = c.icon + " " + c.name;
    sel.appendChild(o);
  });
  sel.value = cur;
}

window.renderList = function() {
  const q      = (document.getElementById("search-input").value || "").toLowerCase();
  const cat    = document.getElementById("filter-cat").value;
  const status = document.getElementById("filter-status").value;

  let mi = getMonthItems();
  if (q)   mi = mi.filter(i => (i.name||"").toLowerCase().includes(q) || (i.note||"").toLowerCase().includes(q));
  if (cat) mi = mi.filter(i => i.cat === cat);
  if (status === "paid")   mi = mi.filter(i => i.paid);
  if (status === "unpaid") mi = mi.filter(i => !i.paid);
  mi.sort((a, b) => (a.due || 0) - (b.due || 0));

  const el = document.getElementById("list-container");
  if (!mi.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div>ไม่มีรายการในเดือนนี้</div>
        <p>กด "+ เพิ่ม" เพื่อเริ่มบันทึกรายจ่าย</p>
      </div>`;
    return;
  }

  el.innerHTML = mi.map(item => {
    const c = catInfo(item.cat);
    const paidCls   = item.paid ? "paid" : "";
    const badgeCls  = item.paid ? "paid" : "unpaid";
    const badgeText = item.paid ? "✓ จ่ายแล้ว" : "⏳ ค้างจ่าย";
    const amtCls    = item.paid ? "paid-amount" : "";
    const dueTxt    = item.due ? `วันที่ ${item.due}` : "";
    const noteTxt   = item.note ? ` · ${item.note}` : "";
    return `
      <div class="expense-item ${paidCls}">
        <div class="item-icon" style="background:${c.bg}">${c.icon}</div>
        <div class="item-info">
          <div class="item-name">${item.name || ""}</div>
          <div class="item-meta">${item.cat}${dueTxt ? " · " + dueTxt : ""}${noteTxt}</div>
        </div>
        <div class="item-right">
          <div class="item-amount ${amtCls}">${fmt(item.amount || 0)}</div>
          <div class="item-actions">
            <button class="status-badge ${badgeCls}" onclick="togglePaid('${item.id}')">${badgeText}</button>
            <button class="action-btn" onclick="openModal('${item.id}')" title="แก้ไข">✏️</button>
            <button class="action-btn" onclick="deleteItem('${item.id}')" title="ลบ">🗑</button>
          </div>
        </div>
      </div>`;
  }).join("");
};

// ── Modal ─────────────────────────────────────────────────────────────
function buildRangePickers() {
  const years = [];
  for (let y = 2024; y <= 2030; y++) years.push(y);

  ["r-from-month", "r-to-month"].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = TH_MONTHS_SHORT.map((m, i) =>
      `<option value="${i}">${m}</option>`
    ).join("");
  });
  ["r-from-year", "r-to-year"].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = years.map(y =>
      `<option value="${y}" ${y === curYear ? "selected":""}>${y + 543}</option>`
    ).join("");
  });
  // defaults: from = 2026-04 (index 3), to = 2027-03 (index 2, year 2027)
  document.getElementById("r-from-month").value = "4"; // May 2026
  document.getElementById("r-from-year").value  = "2026";
  document.getElementById("r-to-month").value   = "3"; // April 2027
  document.getElementById("r-to-year").value    = "2027";
}

window.onModeChange = function() {
  const mode = document.querySelector('input[name="add-mode"]:checked').value;
  // Update selected style
  document.querySelectorAll(".mode-option").forEach(el => {
    const radio = el.querySelector("input[type=radio]");
    el.classList.toggle("selected", radio && radio.checked);
  });
  // Show/hide range picker
  document.getElementById("range-picker").classList.toggle("hidden", mode !== "range");
  // Show/hide single-month fields
  document.getElementById("single-month-fields").classList.toggle("hidden", mode !== "single");
  // Update save button text
  const texts = { single: "บันทึก", year: "เพิ่ม 12 เดือน", range: "เพิ่มตามช่วง" };
  document.getElementById("save-btn").textContent = texts[mode] || "บันทึก";
};

window.openModal = (id = null) => {
  editId = id;
  const item = id ? allItems.find(x => x.id === id) : null;
  const isEdit = !!id;

  document.getElementById("modal-title").textContent = id ? "แก้ไขรายการ" : "เพิ่มรายการ";
  document.getElementById("add-mode-section").classList.toggle("hidden", isEdit);
  document.getElementById("single-month-fields").classList.remove("hidden");

  // Reset radio to single when adding
  if (!isEdit) {
    const radios = document.querySelectorAll('input[name="add-mode"]');
    radios.forEach(r => r.checked = r.value === "single");
    document.querySelectorAll(".mode-option").forEach(el => {
      const radio = el.querySelector("input[type=radio]");
      el.classList.toggle("selected", radio && radio.value === "single");
    });
    document.getElementById("range-picker").classList.add("hidden");
    document.getElementById("save-btn").textContent = "บันทึก";
    buildRangePickers();
  } else {
    document.getElementById("save-btn").textContent = "บันทึก";
  }

  // Cat options
  const catSel = document.getElementById("f-cat");
  catSel.innerHTML = CATS.map(c =>
    `<option value="${c.name}" ${item && item.cat === c.name ? "selected":""}>${c.icon} ${c.name}</option>`
  ).join("");

  // Month options
  const mSel = document.getElementById("f-month");
  mSel.innerHTML = TH_MONTHS.map((m, i) =>
    `<option value="${i}" ${(item ? item.month : curMonth) === i ? "selected":""}>${m}</option>`
  ).join("");

  document.getElementById("f-name").value   = item ? (item.name || "") : "";
  document.getElementById("f-amount").value = item ? (item.amount || "") : "";
  document.getElementById("f-due").value    = item ? (item.due || "") : "";
  document.getElementById("f-year").value   = item ? (item.year + 543) : (curYear + 543);
  document.getElementById("f-note").value   = item ? (item.note || "") : "";
  document.getElementById("f-paid").checked = item ? !!item.paid : false;

  document.getElementById("modal-overlay").classList.remove("hidden");
  setTimeout(() => document.getElementById("f-name").focus(), 100);
};

window.closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  editId = null;
};

window.saveItem = async () => {
  const name   = document.getElementById("f-name").value.trim();
  const amount = parseFloat(document.getElementById("f-amount").value);
  const cat    = document.getElementById("f-cat").value;
  const due    = parseInt(document.getElementById("f-due").value) || null;
  const note   = document.getElementById("f-note").value.trim();
  const paid   = document.getElementById("f-paid").checked;

  if (!name)                        { showToast("กรุณากรอกชื่อรายการ"); return; }
  if (isNaN(amount) || amount <= 0) { showToast("กรุณากรอกจำนวนเงิน"); return; }

  if (editId) {
    // Edit existing — single item
    const month  = parseInt(document.getElementById("f-month").value);
    const yearBE = parseInt(document.getElementById("f-year").value) || (curYear + 543);
    const year   = yearBE - 543;
    try {
      await updateItem(editId, { name, amount, cat, due, month, year, note, paid });
      showToast("แก้ไขแล้ว ✓");
      closeModal();
    } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message); }
    return;
  }

  // Determine which months to add
  const mode = document.querySelector('input[name="add-mode"]:checked')?.value || "single";
  let monthList = []; // [{month, year}]

  if (mode === "single") {
    const month  = parseInt(document.getElementById("f-month").value);
    const yearBE = parseInt(document.getElementById("f-year").value) || (curYear + 543);
    monthList = [{ month, year: yearBE - 543 }];

  } else if (mode === "year") {
    for (let m = 0; m < 12; m++) monthList.push({ month: m, year: curYear });

  } else if (mode === "range") {
    const fromM = parseInt(document.getElementById("r-from-month").value);
    const fromY = parseInt(document.getElementById("r-from-year").value);
    const toM   = parseInt(document.getElementById("r-to-month").value);
    const toY   = parseInt(document.getElementById("r-to-year").value);
    let m = fromM, y = fromY;
    let safety = 0;
    while ((y < toY || (y === toY && m <= toM)) && safety < 60) {
      monthList.push({ month: m, year: y });
      m++; if (m > 11) { m = 0; y++; }
      safety++;
    }
    if (!monthList.length) { showToast("กรุณาเลือกช่วงเดือนที่ถูกต้อง"); return; }
  }

  try {
    await Promise.all(monthList.map(({ month, year }) =>
      addItem({ name, amount, cat, due, month, year, note, paid })
    ));
    const cnt = monthList.length;
    showToast(cnt > 1 ? `เพิ่ม ${cnt} เดือนแล้ว ✓` : "เพิ่มแล้ว ✓");
    closeModal();
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message); }
};

// ── Settings ──────────────────────────────────────────────────────────
window.toggleSettings = () => {
  const panel   = document.getElementById("settings-panel");
  const overlay = document.getElementById("settings-overlay");
  const cfg = getConfig() || {};
  document.getElementById("s-apiKey").value    = cfg.apiKey    || "";
  document.getElementById("s-projectId").value = cfg.projectId || "";
  document.getElementById("s-appId").value     = cfg.appId     || "";
  panel.classList.toggle("hidden");
  overlay.classList.toggle("hidden");
  // Refresh active theme button
  const theme = localStorage.getItem("app_theme") || "warm";
  THEMES.forEach(t => {
    const btn = document.getElementById("theme-" + t);
    if (btn) btn.classList.toggle("active", t === theme);
  });
};

// ── Export JSON ───────────────────────────────────────────────────────
window.exportData = () => {
  const json = JSON.stringify(allItems, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `expenses_${curYear}.json`;
  a.click();
  showToast("Export JSON แล้ว ✓");
};

// ── Export Excel ─────────────────────────────────────────────────────
function buildExcelMonth(items, month, year, sheetName) {
  const monthTH = TH_MONTHS[month] + " " + (year + 543);

  // Summary rows
  const total  = items.reduce((s, i) => s + (i.amount || 0), 0);
  const paid   = items.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
  const unpaid = total - paid;

  const headers = ["#", "ชื่อรายการ", "หมวดหมู่", "จำนวนเงิน (฿)", "วันที่ครบกำหนด", "สถานะ", "หมายเหตุ"];

  const rows = items.map((item, idx) => [
    idx + 1,
    item.name || "",
    (catInfo(item.cat).icon + " " + item.cat) || "",
    item.amount || 0,
    item.due || "",
    item.paid ? "จ่ายแล้ว" : "ค้างจ่าย",
    item.note || ""
  ]);

  // Build worksheet data
  const wsData = [
    [`รายงานรายจ่าย — ${monthTH}`],
    [],
    ["รายจ่ายทั้งหมด", total, "", "จ่ายแล้ว", paid, "", "ค้างจ่าย", unpaid],
    [],
    headers,
    ...rows,
    [],
    ["", "", "รวมทั้งหมด", total, "", "", ""],
    ["", "", "จ่ายแล้ว", paid, "", "", ""],
    ["", "", "ค้างจ่าย", unpaid, "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 16 },
    { wch: 14 }, { wch: 12 }, { wch: 22 }
  ];

  return ws;
}

window.exportExcel = () => {
  if (typeof XLSX === "undefined") { showToast("กำลังโหลด SheetJS..."); return; }
  const items = getMonthItems().sort((a, b) => (a.due || 0) - (b.due || 0));
  if (!items.length) { showToast("ไม่มีรายการในเดือนนี้"); return; }

  const wb = XLSX.utils.book_new();
  const ws = buildExcelMonth(items, curMonth, curYear, "รายการ");
  XLSX.utils.book_append_sheet(wb, ws, TH_MONTHS_SHORT[curMonth] + (curYear + 543));
  XLSX.writeFile(wb, `รายจ่าย_${TH_MONTHS[curMonth]}_${curYear + 543}.xlsx`);
  showToast("Export Excel แล้ว ✓");
};

window.exportExcelYear = () => {
  if (typeof XLSX === "undefined") { showToast("กำลังโหลด SheetJS..."); return; }
  const wb = XLSX.utils.book_new();
  let hasAny = false;

  // Summary sheet
  const summaryRows = [
    [`สรุปรายจ่ายประจำปี ${curYear + 543}`],
    [],
    ["เดือน", "รายจ่ายทั้งหมด (฿)", "จ่ายแล้ว (฿)", "ค้างจ่าย (฿)", "จำนวนรายการ"],
  ];
  let grandTotal = 0, grandPaid = 0, grandUnpaid = 0, grandCount = 0;

  for (let m = 0; m < 12; m++) {
    const monthItems = allItems.filter(i => i.month === m && i.year === curYear)
                               .sort((a, b) => (a.due||0) - (b.due||0));
    const total  = monthItems.reduce((s, i) => s + (i.amount || 0), 0);
    const paid   = monthItems.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
    const unpaid = total - paid;
    summaryRows.push([TH_MONTHS[m] + " " + (curYear + 543), total, paid, unpaid, monthItems.length]);
    grandTotal  += total;
    grandPaid   += paid;
    grandUnpaid += unpaid;
    grandCount  += monthItems.length;

    if (monthItems.length) {
      hasAny = true;
      const ws = buildExcelMonth(monthItems, m, curYear);
      XLSX.utils.book_append_sheet(wb, ws, TH_MONTHS_SHORT[m]);
    }
  }
  summaryRows.push([]);
  summaryRows.push(["รวมทั้งปี", grandTotal, grandPaid, grandUnpaid, grandCount]);

  if (!hasAny) { showToast("ไม่มีข้อมูลในปีนี้"); return; }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "สรุปทั้งปี");

  // Move summary to first
  wb.SheetNames = ["สรุปทั้งปี", ...wb.SheetNames.filter(n => n !== "สรุปทั้งปี")];
  XLSX.writeFile(wb, `รายจ่าย_${curYear + 543}.xlsx`);
  showToast("Export Excel ทั้งปีแล้ว ✓");
};

// ── Helpers ───────────────────────────────────────────────────────────
function setSyncStatus(msg) {
  document.getElementById("sync-text").textContent = msg;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add("hidden"), 2800);
}

function catInfo(name) {
  return CATS.find(c => c.name === name) || CATS[CATS.length - 1];
}

// ── Boot ──────────────────────────────────────────────────────────────
(function boot() {
  // Apply saved theme
  const savedTheme = localStorage.getItem("app_theme") || "warm";
  applyTheme(savedTheme);

  const cfg = getConfig();
  if (!cfg) {
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    return;
  }

  try {
    initFirebase(cfg);
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    startListener();
    setSyncStatus("🟡 กำลังเชื่อมต่อ...");
  } catch (e) {
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    console.error(e);
  }
})();
