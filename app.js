// ── Firebase SDK (ESM) ──────────────────────────────────────────────
import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
let currentUser = null; // { username, collection }

const now = new Date();
let curMonth = now.getMonth();
let curYear  = now.getFullYear();

// ── Theme ────────────────────────────────────────────────────────────
const THEMES = ["warm", "ocean", "forest", "midnight"];

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = "warm";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("app_theme", theme);
  THEMES.forEach(t => {
    const btn = document.getElementById("theme-" + t);
    if (btn) btn.classList.toggle("active", t === theme);
  });
}
window.setTheme = (theme) => applyTheme(theme);

// ── Confirm Modal ────────────────────────────────────────────────────
let _confirmResolve = null;

function showConfirm({ icon = "⚠️", title, msg, okText = "ยืนยัน", okDanger = false }) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById("confirm-icon").textContent = icon;
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-msg").textContent = msg;
    const okBtn = document.getElementById("confirm-ok-btn");
    okBtn.textContent = okText;
    okBtn.className = okDanger ? "btn-primary btn-danger-primary" : "btn-primary";
    document.getElementById("confirm-overlay").classList.remove("hidden");
  });
}
window.closeConfirm = (result) => {
  document.getElementById("confirm-overlay").classList.add("hidden");
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
};

// ── Firebase Help Modal ───────────────────────────────────────────────
window.openFbHelp  = () => document.getElementById("fbhelp-overlay").classList.remove("hidden");
window.closeFbHelp = () => document.getElementById("fbhelp-overlay").classList.add("hidden");

// ── Import Account Modal ──────────────────────────────────────────────
window.openImportModal  = () => {
  document.getElementById("import-code").value = "";
  document.getElementById("import-error").classList.add("hidden");
  document.getElementById("import-overlay").classList.remove("hidden");
};
window.closeImportModal = () => document.getElementById("import-overlay").classList.add("hidden");


window.togglePw = (inputId, btn) => {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
};

// ── Screen navigation ────────────────────────────────────────────────
window.showScreen = (name) => {
  ["login-screen", "register-screen", "pin-screen"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(name + "-screen").classList.remove("hidden");
  // clear errors
  ["login-error","reg-error","pin-error"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add("hidden"); el.textContent = ""; }
  });
};

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ── User storage helpers ─────────────────────────────────────────────
// Users stored as: users_db = { username: { passwordHash, pin, apiKey, projectId, appId } }
function getUsers() {
  try { return JSON.parse(localStorage.getItem("app_users") || "{}"); }
  catch { return {}; }
}
function saveUsers(users) {
  localStorage.setItem("app_users", JSON.stringify(users));
}

// Simple hash (not cryptographic — just obfuscation for localStorage)
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function getSession() {
  try { return JSON.parse(sessionStorage.getItem("app_session") || "null"); }
  catch { return null; }
}
function saveSession(username) {
  sessionStorage.setItem("app_session", JSON.stringify({ username }));
}
function clearSession() {
  sessionStorage.removeItem("app_session");
}

// ── Auth: Register ───────────────────────────────────────────────────
window.doRegister = () => {
  const username  = document.getElementById("reg-username").value.trim().toLowerCase();
  const password  = document.getElementById("reg-password").value;
  const pin       = document.getElementById("reg-pin").value.trim();
  const apiKey    = document.getElementById("reg-apiKey").value.trim();
  const projectId = document.getElementById("reg-projectId").value.trim();
  const appId     = document.getElementById("reg-appId").value.trim();

  if (!username)            return showError("reg-error", "กรุณากรอก username");
  if (username.length < 3)  return showError("reg-error", "username ต้องมีอย่างน้อย 3 ตัวอักษร");
  if (password.length < 4)  return showError("reg-error", "password ต้องมีอย่างน้อย 4 ตัวอักษร");
  if (!/^\d{4}$/.test(pin)) return showError("reg-error", "PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น");
  if (!apiKey || !projectId || !appId)
                            return showError("reg-error", "กรุณากรอก Firebase Config ให้ครบ");

  const users = getUsers();
  if (users[username])      return showError("reg-error", "username นี้มีอยู่แล้ว");

  users[username] = {
    passwordHash: simpleHash(password),
    pin,
    apiKey,
    projectId,
    appId,
  };
  saveUsers(users);
  showToast("สมัครสมาชิกสำเร็จ! กรุณา login");
  showScreen("login");
  document.getElementById("login-username").value = username;
};

// ── Auth: Login ──────────────────────────────────────────────────────
window.doLogin = () => {
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;

  if (!username || !password) return showError("login-error", "กรุณากรอก username และ password");

  const users = getUsers();
  const user  = users[username];

  if (!user)                              return showError("login-error", "ไม่พบ username นี้");
  if (user.passwordHash !== simpleHash(password))
                                          return showError("login-error", "password ไม่ถูกต้อง");

  saveSession(username);
  startApp(username, user);
};

// ── Auth: Forgot PIN ─────────────────────────────────────────────────
let pinVerified = false;

window.doVerifyPin = () => {
  const username = document.getElementById("pin-username").value.trim().toLowerCase();
  const pinInput = document.getElementById("pin-code").value.trim();

  const users = getUsers();
  const user  = users[username];

  if (!user)               return showError("pin-error", "ไม่พบ username นี้");

  if (!pinVerified) {
    if (user.pin !== pinInput) return showError("pin-error", "PIN ไม่ถูกต้อง");
    // PIN correct — show new password field
    pinVerified = true;
    document.getElementById("new-pw-group").classList.remove("hidden");
    document.getElementById("pin-btn").textContent = "ตั้ง Password ใหม่";
    document.getElementById("pin-error").classList.add("hidden");
    showToast("PIN ถูกต้อง! ตั้ง password ใหม่ได้เลย");
    return;
  }

  // Set new password
  const newPw = document.getElementById("pin-new-pw").value;
  if (newPw.length < 4) return showError("pin-error", "password ต้องมีอย่างน้อย 4 ตัวอักษร");

  users[username].passwordHash = simpleHash(newPw);
  saveUsers(users);
  pinVerified = false;
  document.getElementById("new-pw-group").classList.add("hidden");
  document.getElementById("pin-btn").textContent = "ยืนยัน PIN";
  showToast("เปลี่ยน password สำเร็จ! กรุณา login");
  showScreen("login");
  document.getElementById("login-username").value = username;
};

// ── Auth: Logout ─────────────────────────────────────────────────────
window.doLogout = async () => {
  const ok = await showConfirm({ icon: "🚪", title: "ออกจากระบบ?", msg: "Session จะถูกล้าง ต้องล็อกอินใหม่ครั้งหน้า", okText: "ออกจากระบบ", okDanger: true });
  if (!ok) return;
  clearSession();
  if (unsubscribe) unsubscribe();
  // Clean up firebase apps
  getApps().forEach(a => deleteApp(a));
  db = null; allItems = []; currentUser = null;
  document.getElementById("main-app").classList.add("hidden");
  toggleSettings(); // close panel if open
  showScreen("login");
};

// ── Start app after login ────────────────────────────────────────────
function startApp(username, user) {
  currentUser = { username, collection: "expenses_" + username };

  try {
    // Clean up existing Firebase apps
    getApps().forEach(a => deleteApp(a));

    initFirebaseWith({
      apiKey:    user.apiKey,
      projectId: user.projectId,
      appId:     user.appId,
    });

    // Hide auth, show main
    ["login-screen","register-screen","pin-screen"].forEach(id => {
      document.getElementById(id).classList.add("hidden");
    });
    document.getElementById("main-app").classList.remove("hidden");

    // Update settings display
    document.getElementById("settings-username").textContent = username;
    document.getElementById("cfg-display-apiKey").textContent    = user.apiKey.slice(0,12) + "...";
    document.getElementById("cfg-display-projectId").textContent = user.projectId;
    document.getElementById("cfg-display-appId").textContent     = user.appId.slice(0,18) + "...";
    document.getElementById("sync-user").textContent             = "👤 " + username;

    startListener();
    setSyncStatus("🟡 กำลังเชื่อมต่อ...");

    // Apply saved theme
    const savedTheme = localStorage.getItem("app_theme") || "warm";
    applyTheme(savedTheme);

  } catch (e) {
    console.error(e);
    showScreen("login");
    showError("login-error", "Firebase error: " + e.message);
  }
}

// ── Firebase init ────────────────────────────────────────────────────
function initFirebaseWith(cfg) {
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
  if (unsubscribe) unsubscribe();
  const col = currentUser.collection;
  const q = query(collection(db, col), orderBy("createdAt", "desc"));
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
  await addDoc(collection(db, currentUser.collection), data);
}

async function updateItem(id, data) {
  await updateDoc(doc(db, currentUser.collection, id), data);
}

window.deleteItem = async (id) => {
  const item = allItems.find(x => x.id === id);
  const name = item ? item.name : "รายการนี้";
  const ok = await showConfirm({ icon: "🗑️", title: "ลบรายการ?", msg: `"${name}" จะถูกลบถาวรจาก Firebase`, okText: "ลบ", okDanger: true });
  if (!ok) return;
  await deleteDoc(doc(db, currentUser.collection, id));
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
  document.getElementById("r-from-month").value = String(curMonth);
  document.getElementById("r-from-year").value  = String(curYear);
  document.getElementById("r-to-month").value   = String(curMonth);
  document.getElementById("r-to-year").value    = String(curYear + 1);
}

window.onModeChange = function() {
  const mode = document.querySelector('input[name="add-mode"]:checked').value;
  document.querySelectorAll(".mode-option").forEach(el => {
    const radio = el.querySelector("input[type=radio]");
    el.classList.toggle("selected", radio && radio.checked);
  });
  document.getElementById("range-picker").classList.toggle("hidden", mode !== "range");
  document.getElementById("single-month-fields").classList.toggle("hidden", mode !== "single");
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

  const catSel = document.getElementById("f-cat");
  catSel.innerHTML = CATS.map(c =>
    `<option value="${c.name}" ${item && item.cat === c.name ? "selected":""}>${c.icon} ${c.name}</option>`
  ).join("");

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

  const mode = document.querySelector('input[name="add-mode"]:checked')?.value || "single";
  let monthList = [];

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
  panel.classList.toggle("hidden");
  overlay.classList.toggle("hidden");
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
function buildExcelMonth(items, month, year) {
  const monthTH = TH_MONTHS[month] + " " + (year + 543);
  const total  = items.reduce((s, i) => s + (i.amount || 0), 0);
  const paid   = items.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
  const unpaid = total - paid;
  const headers = ["#", "ชื่อรายการ", "หมวดหมู่", "จำนวนเงิน (฿)", "วันที่ครบกำหนด", "สถานะ", "หมายเหตุ"];
  const rows = items.map((item, idx) => [
    idx + 1, item.name || "",
    (catInfo(item.cat).icon + " " + item.cat) || "",
    item.amount || 0, item.due || "",
    item.paid ? "จ่ายแล้ว" : "ค้างจ่าย",
    item.note || ""
  ]);
  const wsData = [
    [`รายงานรายจ่าย — ${monthTH}`], [],
    ["รายจ่ายทั้งหมด", total, "", "จ่ายแล้ว", paid, "", "ค้างจ่าย", unpaid],
    [], headers, ...rows, [],
    ["", "", "รวมทั้งหมด", total, "", "", ""],
    ["", "", "จ่ายแล้ว", paid, "", "", ""],
    ["", "", "ค้างจ่าย", unpaid, "", "", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 22 }];
  return ws;
}

window.exportExcel = () => {
  if (typeof XLSX === "undefined") { showToast("กำลังโหลด SheetJS..."); return; }
  const items = getMonthItems().sort((a, b) => (a.due || 0) - (b.due || 0));
  if (!items.length) { showToast("ไม่มีรายการในเดือนนี้"); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildExcelMonth(items, curMonth, curYear), TH_MONTHS_SHORT[curMonth] + (curYear + 543));
  XLSX.writeFile(wb, `รายจ่าย_${TH_MONTHS[curMonth]}_${curYear + 543}.xlsx`);
  showToast("Export Excel แล้ว ✓");
};

window.exportExcelYear = () => {
  if (typeof XLSX === "undefined") { showToast("กำลังโหลด SheetJS..."); return; }
  const wb = XLSX.utils.book_new();
  let hasAny = false;
  const summaryRows = [
    [`สรุปรายจ่ายประจำปี ${curYear + 543}`], [],
    ["เดือน", "รายจ่ายทั้งหมด (฿)", "จ่ายแล้ว (฿)", "ค้างจ่าย (฿)", "จำนวนรายการ"],
  ];
  let grandTotal = 0, grandPaid = 0, grandUnpaid = 0, grandCount = 0;
  for (let m = 0; m < 12; m++) {
    const monthItems = allItems.filter(i => i.month === m && i.year === curYear).sort((a, b) => (a.due||0) - (b.due||0));
    const total  = monthItems.reduce((s, i) => s + (i.amount || 0), 0);
    const paid   = monthItems.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
    const unpaid = total - paid;
    summaryRows.push([TH_MONTHS[m] + " " + (curYear + 543), total, paid, unpaid, monthItems.length]);
    grandTotal += total; grandPaid += paid; grandUnpaid += unpaid; grandCount += monthItems.length;
    if (monthItems.length) {
      hasAny = true;
      XLSX.utils.book_append_sheet(wb, buildExcelMonth(monthItems, m, curYear), TH_MONTHS_SHORT[m]);
    }
  }
  summaryRows.push([], ["รวมทั้งปี", grandTotal, grandPaid, grandUnpaid, grandCount]);
  if (!hasAny) { showToast("ไม่มีข้อมูลในปีนี้"); return; }
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "สรุปทั้งปี");
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

// ── Export / Import Account (ย้ายเครื่อง) ────────────────────────────
window.doExportAccount = () => {
  if (!currentUser) return;
  const users = getUsers();
  const user  = users[currentUser.username];
  if (!user) return;

  const payload = btoa(JSON.stringify({ username: currentUser.username, ...user }));
  // Show in a small prompt-style modal via confirm (reuse confirm overlay as info)
  document.getElementById("confirm-icon").textContent  = "📤";
  document.getElementById("confirm-title").textContent = "โค้ดบัญชีของคุณ";
  document.getElementById("confirm-msg").textContent   = "Copy โค้ดด้านล่างไปวางที่เครื่องใหม่ผ่านปุ่ม "นำเข้าจากเครื่องอื่น"";

  // Inject a textarea inside confirm-msg temporarily
  const ta = document.createElement("textarea");
  ta.value = payload;
  ta.readOnly = true;
  ta.style.cssText = "width:100%;margin-top:10px;font-size:11px;font-family:monospace;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);resize:none;height:80px";
  document.getElementById("confirm-msg").appendChild(ta);

  const okBtn = document.getElementById("confirm-ok-btn");
  okBtn.textContent = "Copy & ปิด";
  okBtn.className = "btn-primary";
  document.getElementById("confirm-cancel-btn").style.display = "none";
  document.getElementById("confirm-overlay").classList.remove("hidden");

  _confirmResolve = () => {
    navigator.clipboard?.writeText(payload).catch(() => {});
    document.getElementById("confirm-msg").innerHTML = "";
    document.getElementById("confirm-cancel-btn").style.display = "";
    document.getElementById("confirm-overlay").classList.add("hidden");
    _confirmResolve = null;
    showToast("Copy โค้ดแล้ว ✓");
  };
};

window.doImportAccount = () => {
  const raw = document.getElementById("import-code").value.trim();
  const errEl = document.getElementById("import-error");
  errEl.classList.add("hidden");

  let data;
  try {
    data = JSON.parse(atob(raw));
  } catch {
    errEl.textContent = "โค้ดไม่ถูกต้อง กรุณาลองใหม่";
    errEl.classList.remove("hidden");
    return;
  }

  const { username, passwordHash, pin, apiKey, projectId, appId } = data;
  if (!username || !passwordHash || !apiKey || !projectId || !appId) {
    errEl.textContent = "ข้อมูลบัญชีไม่ครบ";
    errEl.classList.remove("hidden");
    return;
  }

  const users = getUsers();
  if (users[username]) {
    errEl.textContent = `username "${username}" มีอยู่แล้วในเครื่องนี้`;
    errEl.classList.remove("hidden");
    return;
  }

  users[username] = { passwordHash, pin, apiKey, projectId, appId };
  saveUsers(users);
  closeImportModal();
  showToast(`นำเข้าบัญชี "${username}" สำเร็จ! กรุณา login`);
  showScreen("login");
  document.getElementById("login-username").value = username;
};

// ── Boot ──────────────────────────────────────────────────────────────
(function boot() {
  const savedTheme = localStorage.getItem("app_theme") || "warm";
  applyTheme(savedTheme);

  document.getElementById("loading-screen").classList.add("hidden");

  // Check session
  const session = getSession();
  if (session) {
    const users = getUsers();
    const user  = users[session.username];
    if (user) {
      startApp(session.username, user);
      return;
    }
  }

  // No session → show login
  showScreen("login");
})();
