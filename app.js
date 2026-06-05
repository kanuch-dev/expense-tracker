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

// ── State ────────────────────────────────────────────────────────────
let db = null;
let unsubscribe = null;
let allItems = [];   // all items from Firestore
let editId = null;

const now = new Date();
let curMonth = now.getMonth();
let curYear = now.getFullYear();

// ── Config helpers ───────────────────────────────────────────────────
function getConfig() {
  try { return JSON.parse(localStorage.getItem("fb_config") || "null"); }
  catch { return null; }
}
function saveConfig() {
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
}
window.saveConfig = saveConfig;

function resetConfig() {
  if (!confirm("ลบ Config ออก? (ข้อมูลใน Firestore จะยังอยู่)")) return;
  localStorage.removeItem("fb_config");
  location.reload();
}
window.resetConfig = resetConfig;

function updateConfig() {
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
}
window.updateConfig = updateConfig;

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

  document.getElementById("total-all").textContent   = fmt(total);
  document.getElementById("total-paid").textContent  = fmt(paid);
  document.getElementById("total-unpaid").textContent = fmt(unpaid);
  document.getElementById("count-all").textContent   = mi.length + " รายการ";
  document.getElementById("count-paid").textContent  = paidCount + " รายการ";
  document.getElementById("count-unpaid").textContent = unpaidCount + " รายการ";
  document.getElementById("progress-pct").textContent = pct + "%";
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("header-sub").textContent  =
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

function renderList() {
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
      </div>`;
    return;
  }

  el.innerHTML = mi.map(item => {
    const c = catInfo(item.cat);
    const paidCls = item.paid ? "paid" : "";
    const badgeCls = item.paid ? "paid" : "unpaid";
    const badgeText = item.paid ? "✓ จ่ายแล้ว" : "ค้างจ่าย";
    const amtCls = item.paid ? "paid-amount" : "";
    return `
      <div class="expense-item ${paidCls}">
        <div class="item-icon" style="background:${c.bg}">${c.icon}</div>
        <div class="item-info">
          <div class="item-name">${item.name || ""}</div>
          <div class="item-meta">${item.cat}${item.due ? " · วันที่ " + item.due : ""}${item.note ? " · " + item.note : ""}</div>
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
}

// ── Modal ─────────────────────────────────────────────────────────────
window.openModal = (id = null) => {
  editId = id;
  const item = id ? allItems.find(x => x.id === id) : null;

  document.getElementById("modal-title").textContent = id ? "แก้ไขรายการ" : "เพิ่มรายการ";

  // Cat options
  const catSel = document.getElementById("f-cat");
  catSel.innerHTML = CATS.map(c =>
    `<option value="${c.name}" ${item && item.cat === c.name ? "selected" : ""}>${c.icon} ${c.name}</option>`
  ).join("");

  // Month options
  const mSel = document.getElementById("f-month");
  mSel.innerHTML = TH_MONTHS.map((m, i) =>
    `<option value="${i}" ${(item ? item.month : curMonth) === i ? "selected" : ""}>${m}</option>`
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
  const month  = parseInt(document.getElementById("f-month").value);
  const yearBE = parseInt(document.getElementById("f-year").value) || (curYear + 543);
  const year   = yearBE - 543;
  const note   = document.getElementById("f-note").value.trim();
  const paid   = document.getElementById("f-paid").checked;

  if (!name) { showToast("กรุณากรอกชื่อรายการ"); return; }
  if (isNaN(amount) || amount <= 0) { showToast("กรุณากรอกจำนวนเงิน"); return; }

  const data = { name, amount, cat, due, month, year, note, paid };

  try {
    if (editId) {
      await updateItem(editId, data);
      showToast("แก้ไขแล้ว ✓");
    } else {
      await addItem(data);
      showToast("เพิ่มแล้ว ✓");
    }
    closeModal();
  } catch (e) {
    showToast("เกิดข้อผิดพลาด: " + e.message);
  }
};

// ── Settings ──────────────────────────────────────────────────────────
window.toggleSettings = () => {
  const panel = document.getElementById("settings-panel");
  const overlay = document.getElementById("settings-overlay");
  const cfg = getConfig() || {};
  document.getElementById("s-apiKey").value    = cfg.apiKey    || "";
  document.getElementById("s-projectId").value = cfg.projectId || "";
  document.getElementById("s-appId").value     = cfg.appId     || "";
  panel.classList.toggle("hidden");
  overlay.classList.toggle("hidden");
};

// ── Export ────────────────────────────────────────────────────────────
window.exportData = () => {
  const json = JSON.stringify(allItems, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `expenses_${curYear}.json`;
  a.click();
  showToast("Export แล้ว ✓");
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
  window._toastTimer = setTimeout(() => t.classList.add("hidden"), 2500);
}

// ── Boot ──────────────────────────────────────────────────────────────
(function boot() {
  const cfg = getConfig();

  if (!cfg) {
    // Show setup screen
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
