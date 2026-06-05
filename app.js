import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Constants ────────────────────────────────────────────────────────
const CATS = [
  { name:"ที่อยู่อาศัย", icon:"🏠", bg:"#E6F1FB" },
  { name:"อาหาร",        icon:"🍜", bg:"#EAF3DE" },
  { name:"การเดินทาง",   icon:"🚗", bg:"#FAEEDA" },
  { name:"สุขภาพ",       icon:"💊", bg:"#FCEBEB" },
  { name:"การศึกษา",     icon:"📚", bg:"#EEEDFE" },
  { name:"ความบันเทิง",  icon:"🎮", bg:"#FBEAF0" },
  { name:"สาธารณูปโภค", icon:"💡", bg:"#E1F5EE" },
  { name:"การสื่อสาร",   icon:"📱", bg:"#F1EFE8" },
  { name:"ประกัน",       icon:"🛡️", bg:"#E6F1FB" },
  { name:"อื่นๆ",        icon:"📋", bg:"#F1EFE8" },
];
const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// ── State ────────────────────────────────────────────────────────────
let db = null;
let allItems = [];
let allRecurring = [];
let editId = null;
let editRecId = null;

const now = new Date();
let curMonth = now.getMonth();
let curYear  = now.getFullYear();

// ── Config ───────────────────────────────────────────────────────────
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
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) { showToast("กรุณากรอกข้อมูลให้ครบ"); return; }
  localStorage.setItem("fb_config", JSON.stringify(cfg));
  location.reload();
};
window.resetConfig = () => {
  if (!confirm("ลบ Config ออก?")) return;
  localStorage.removeItem("fb_config"); location.reload();
};
window.updateConfig = () => {
  const cfg = {
    apiKey:    document.getElementById("s-apiKey").value.trim(),
    projectId: document.getElementById("s-projectId").value.trim(),
    appId:     document.getElementById("s-appId").value.trim(),
  };
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) { showToast("กรุณากรอกข้อมูลให้ครบ"); return; }
  localStorage.setItem("fb_config", JSON.stringify(cfg));
  showToast("บันทึก Config แล้ว"); toggleSettings(); location.reload();
};

// ── Firebase ─────────────────────────────────────────────────────────
function initFirebase(cfg) {
  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: `${cfg.projectId}.firebaseapp.com`,
    projectId: cfg.projectId,
    storageBucket: `${cfg.projectId}.appspot.com`,
    messagingSenderId: "000000000000",
    appId: cfg.appId,
  });
  db = getFirestore(app);
}

function startListeners() {
  // Expenses
  onSnapshot(query(collection(db, "expenses"), orderBy("createdAt","desc")), snap => {
    allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSyncStatus("🟢 ซิงค์แล้ว");
    renderAll();
  }, err => setSyncStatus("🔴 " + err.code));

  // Recurring templates
  onSnapshot(query(collection(db, "recurring"), orderBy("createdAt","desc")), snap => {
    allRecurring = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRecurringList();
  });
}

// ── CRUD: Expenses ───────────────────────────────────────────────────
async function addExpense(data) {
  data.createdAt = Date.now();
  await addDoc(collection(db, "expenses"), data);
}
async function updateExpense(id, data) {
  await updateDoc(doc(db, "expenses", id), data);
}
window.deleteItem = async id => {
  if (!confirm("ลบรายการนี้?")) return;
  await deleteDoc(doc(db, "expenses", id));
  showToast("ลบแล้ว");
};
window.togglePaid = async id => {
  const item = allItems.find(x => x.id === id);
  if (item) await updateExpense(id, { paid: !item.paid });
};

// ── CRUD: Recurring ──────────────────────────────────────────────────
async function addRecurring(data) {
  data.createdAt = Date.now();
  await addDoc(collection(db, "recurring"), data);
}
async function updateRecurring(id, data) {
  await updateDoc(doc(db, "recurring", id), data);
}
window.deleteRecurring = async id => {
  if (!confirm("ลบรายจ่ายประจำนี้? (จะไม่ลบรายการที่สร้างไปแล้ว)")) return;
  await deleteDoc(doc(db, "recurring", id));
  showToast("ลบแล้ว");
};

// Apply recurring → create this month's expenses
window.applyRecurring = async () => {
  const month  = parseInt(document.getElementById("apply-month").value);
  const yearBE = parseInt(document.getElementById("apply-year").value) || (curYear + 543);
  const year   = yearBE - 543;
  if (allRecurring.length === 0) { showToast("ยังไม่มีรายจ่ายประจำ"); return; }
  const existing = allItems.filter(i => i.month === month && i.year === year && i.fromRecurring);
  if (existing.length > 0) {
    if (!confirm(`มีรายการจาก recurring เดือน ${TH_MONTHS[month]} ${yearBE} อยู่แล้ว ${existing.length} รายการ\nต้องการเพิ่มซ้ำหรือไม่?`)) return;
  }
  const batch = writeBatch(db);
  allRecurring.forEach(r => {
    const ref = doc(collection(db, "expenses"));
    batch.set(ref, { name: r.name, amount: r.amount, cat: r.cat, due: r.due, note: r.note || "", paid: false, month, year, fromRecurring: true, recurringId: r.id, createdAt: Date.now() });
  });
  await batch.commit();
  showToast(`สร้าง ${allRecurring.length} รายการสำเร็จ ✓`);
};

// ── Bulk Add ─────────────────────────────────────────────────────────
window.bulkAdd = async () => {
  const name   = document.getElementById("b-name").value.trim();
  const amount = parseFloat(document.getElementById("b-amount").value);
  const cat    = document.getElementById("b-cat").value;
  const due    = parseInt(document.getElementById("b-due").value) || null;
  const note   = document.getElementById("b-note").value.trim();
  const from   = document.getElementById("b-from").value;
  const to     = document.getElementById("b-to").value;

  if (!name)           { showToast("กรุณากรอกชื่อรายการ"); return; }
  if (!amount || amount <= 0) { showToast("กรุณากรอกจำนวนเงิน"); return; }
  if (!from || !to)    { showToast("กรุณาเลือกช่วงเวลา"); return; }

  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (fy > ty || (fy === ty && fm > tm)) { showToast("ช่วงเวลาไม่ถูกต้อง"); return; }

  const months = [];
  let y = fy, m = fm - 1;
  while (y < ty || (y === ty && m <= tm - 1)) {
    months.push({ year: y, month: m });
    m++; if (m > 11) { m = 0; y++; }
  }

  if (!confirm(`จะเพิ่มรายการ "${name}" ทั้งหมด ${months.length} เดือน ใช่ไหม?`)) return;

  const batch = writeBatch(db);
  months.forEach(({ year, month }) => {
    const ref = doc(collection(db, "expenses"));
    batch.set(ref, { name, amount, cat, due, note, paid: false, month, year, createdAt: Date.now() });
  });
  await batch.commit();
  showToast(`เพิ่ม ${months.length} รายการสำเร็จ ✓`);
  document.getElementById("b-name").value = "";
  document.getElementById("b-amount").value = "";
  document.getElementById("bulk-preview").innerHTML = "";
};

// Preview bulk
function updateBulkPreview() {
  const from = document.getElementById("b-from").value;
  const to   = document.getElementById("b-to").value;
  const el   = document.getElementById("bulk-preview");
  if (!from || !to) { el.innerHTML = ""; return; }
  const [fy,fm] = from.split("-").map(Number);
  const [ty,tm] = to.split("-").map(Number);
  let count = 0, y = fy, m = fm - 1;
  while (y < ty || (y === ty && m <= tm - 1)) { count++; m++; if(m>11){m=0;y++;} }
  el.innerHTML = count > 0
    ? `<div class="preview-badge">จะเพิ่ม <strong>${count} เดือน</strong> (${TH_MONTHS[fm-1]} ${fy+543} – ${TH_MONTHS[tm-1]} ${ty+543})</div>`
    : `<div class="preview-badge error">ช่วงเวลาไม่ถูกต้อง</div>`;
}

// ── Report & Excel ────────────────────────────────────────────────────
window.generateReport = () => {
  const month  = parseInt(document.getElementById("r-month").value);
  const yearBE = parseInt(document.getElementById("r-year").value) || (curYear + 543);
  const year   = yearBE - 543;
  const mi     = allItems.filter(i => i.month === month && i.year === year);
  mi.sort((a,b) => (a.due||0)-(b.due||0));

  const total  = mi.reduce((s,i) => s + (i.amount||0), 0);
  const paid   = mi.filter(i=>i.paid).reduce((s,i) => s+(i.amount||0), 0);

  // Group by cat
  const byCat = {};
  mi.forEach(i => { byCat[i.cat] = (byCat[i.cat]||0) + (i.amount||0); });
  const catRows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => {
    const c = catInfo(cat);
    return `<div class="report-cat-row"><span>${c.icon} ${cat}</span><span>${fmt(amt)}</span></div>`;
  }).join("");

  const rows = mi.map(i => {
    const c = catInfo(i.cat);
    return `<tr>
      <td>${i.due||"-"}</td>
      <td>${c.icon} ${i.name||""}</td>
      <td>${i.cat}</td>
      <td style="text-align:right">${fmt(i.amount||0)}</td>
      <td><span class="status-badge ${i.paid?'paid':'unpaid'}">${i.paid?"✓ จ่ายแล้ว":"ค้างจ่าย"}</span></td>
      <td>${i.note||""}</td>
    </tr>`;
  }).join("");

  document.getElementById("report-content").innerHTML = `
    <div class="report-summary">
      <div class="report-stat"><div class="stat-label">รายการทั้งหมด</div><div class="stat-value red">${fmt(total)}</div></div>
      <div class="report-stat"><div class="stat-label">จ่ายแล้ว</div><div class="stat-value green">${fmt(paid)}</div></div>
      <div class="report-stat"><div class="stat-label">ค้างจ่าย</div><div class="stat-value orange">${fmt(total-paid)}</div></div>
    </div>
    <div class="card" style="margin:0 1rem 1rem">
      <div class="report-section-title">สรุปตามหมวดหมู่</div>
      ${catRows}
    </div>
    <div class="table-wrap">
      <table class="report-table">
        <thead><tr><th>วันที่</th><th>รายการ</th><th>หมวด</th><th>จำนวน</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

window.exportExcel = () => {
  const month  = parseInt(document.getElementById("r-month").value);
  const yearBE = parseInt(document.getElementById("r-year").value) || (curYear + 543);
  const year   = yearBE - 543;
  exportToExcel(allItems.filter(i => i.month===month && i.year===year),
    `รายจ่าย_${TH_MONTHS[month]}_${yearBE}`);
};

window.exportExcelYear = () => {
  const yearBE = parseInt(document.getElementById("r-year").value) || (curYear + 543);
  const year   = yearBE - 543;
  const wb = XLSX.utils.book_new();
  TH_MONTHS.forEach((mName, m) => {
    const mi = allItems.filter(i => i.month===m && i.year===year);
    if (mi.length === 0) return;
    const ws = buildSheet(mi);
    XLSX.utils.book_append_sheet(wb, ws, mName);
  });
  XLSX.writeFile(wb, `รายจ่ายทั้งปี_${yearBE}.xlsx`);
  showToast("Export Excel ทั้งปีแล้ว ✓");
};

function exportToExcel(items, filename) {
  if (items.length === 0) { showToast("ไม่มีข้อมูล"); return; }
  const wb = XLSX.utils.book_new();
  const ws = buildSheet(items);
  XLSX.utils.book_append_sheet(wb, ws, "รายจ่าย");
  XLSX.writeFile(wb, filename + ".xlsx");
  showToast("Export Excel แล้ว ✓");
}

function buildSheet(items) {
  const sorted = [...items].sort((a,b) => (a.due||0)-(b.due||0));
  const total  = sorted.reduce((s,i)=>s+(i.amount||0),0);
  const paid   = sorted.filter(i=>i.paid).reduce((s,i)=>s+(i.amount||0),0);

  const header = [["วันที่ครบกำหนด","ชื่อรายการ","หมวดหมู่","จำนวนเงิน (฿)","สถานะ","หมายเหตุ"]];
  const rows   = sorted.map(i => [
    i.due || "", i.name || "", i.cat || "", i.amount || 0,
    i.paid ? "จ่ายแล้ว" : "ค้างจ่าย", i.note || ""
  ]);
  const summary = [
    [], ["","","รวมทั้งหมด", total],
    ["","","จ่ายแล้ว", paid],
    ["","","ค้างจ่าย", total-paid],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows, ...summary]);
  ws["!cols"] = [{wch:14},{wch:24},{wch:16},{wch:16},{wch:12},{wch:20}];

  // Style header row
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({r:0,c})];
    if (cell) cell.s = { font:{bold:true}, fill:{fgColor:{rgb:"E6F1FB"}} };
  }
  return ws;
}

// ── Month nav ────────────────────────────────────────────────────────
window.changeMonth = d => {
  curMonth += d;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  if (curMonth < 0)  { curMonth = 11; curYear--; }
  renderAll();
};

// ── Render ───────────────────────────────────────────────────────────
function getMonthItems() {
  return allItems.filter(i => i.month===curMonth && i.year===curYear);
}
function fmt(n) { return "฿" + Math.round(n).toLocaleString("th-TH"); }
function catInfo(name) { return CATS.find(c=>c.name===name) || CATS[CATS.length-1]; }

function renderAll() {
  // Dashboard
  document.getElementById("month-label").textContent = TH_MONTHS[curMonth] + " " + (curYear+543);
  const mi     = getMonthItems();
  const total  = mi.reduce((s,i)=>s+(i.amount||0),0);
  const paid   = mi.filter(i=>i.paid).reduce((s,i)=>s+(i.amount||0),0);
  const pct    = total>0 ? Math.round((paid/total)*100) : 0;
  document.getElementById("total-all").textContent    = fmt(total);
  document.getElementById("total-paid").textContent   = fmt(paid);
  document.getElementById("total-unpaid").textContent = fmt(total-paid);
  document.getElementById("count-all").textContent    = mi.length+" รายการ";
  document.getElementById("count-paid").textContent   = mi.filter(i=>i.paid).length+" รายการ";
  document.getElementById("count-unpaid").textContent = mi.filter(i=>!i.paid).length+" รายการ";
  document.getElementById("progress-pct").textContent = pct+"%";
  document.getElementById("progress-fill").style.width = pct+"%";
  document.getElementById("header-sub").textContent   = mi.length+" รายการ · "+fmt(total);
  updateCatFilter();
  renderList();
}

function updateCatFilter() {
  const sel = document.getElementById("filter-cat");
  const cur = sel.value;
  const used = [...new Set(allItems.map(i=>i.cat))];
  sel.innerHTML = '<option value="">ทุกหมวด</option>';
  CATS.filter(c=>used.includes(c.name)).forEach(c=>{
    const o = document.createElement("option");
    o.value=c.name; o.textContent=c.icon+" "+c.name; sel.appendChild(o);
  });
  sel.value = cur;
}

function renderList() {
  const q      = (document.getElementById("search-input").value||"").toLowerCase();
  const cat    = document.getElementById("filter-cat").value;
  const status = document.getElementById("filter-status").value;
  let mi = getMonthItems();
  if (q)   mi = mi.filter(i=>(i.name||"").toLowerCase().includes(q)||(i.note||"").toLowerCase().includes(q));
  if (cat) mi = mi.filter(i=>i.cat===cat);
  if (status==="paid")   mi = mi.filter(i=>i.paid);
  if (status==="unpaid") mi = mi.filter(i=>!i.paid);
  mi.sort((a,b)=>(a.due||0)-(b.due||0));
  const el = document.getElementById("list-container");
  if (!mi.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div>ไม่มีรายการในเดือนนี้</div></div>`;
    return;
  }
  el.innerHTML = mi.map(item => {
    const c = catInfo(item.cat);
    const recurBadge = item.fromRecurring ? `<span style="font-size:10px;color:var(--text-hint)">🔁</span>` : "";
    return `<div class="expense-item ${item.paid?"paid":""}">
      <div class="item-icon" style="background:${c.bg}">${c.icon}</div>
      <div class="item-info">
        <div class="item-name">${item.name||""} ${recurBadge}</div>
        <div class="item-meta">${item.cat}${item.due?" · วันที่ "+item.due:""}${item.note?" · "+item.note:""}</div>
      </div>
      <div class="item-right">
        <div class="item-amount ${item.paid?"paid-amount":""}">${fmt(item.amount||0)}</div>
        <div class="item-actions">
          <button class="status-badge ${item.paid?"paid":"unpaid"}" onclick="togglePaid('${item.id}')">${item.paid?"✓ จ่ายแล้ว":"ค้างจ่าย"}</button>
          <button class="action-btn" onclick="openModal('${item.id}')" title="แก้ไข">✏️</button>
          <button class="action-btn" onclick="deleteItem('${item.id}')" title="ลบ">🗑</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

function renderRecurringList() {
  const el = document.getElementById("recurring-list");
  if (!el) return;
  if (!allRecurring.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔁</div><div>ยังไม่มีรายจ่ายประจำ</div></div>`;
    return;
  }
  el.innerHTML = allRecurring.map(r => {
    const c = catInfo(r.cat);
    return `<div class="expense-item">
      <div class="item-icon" style="background:${c.bg}">${c.icon}</div>
      <div class="item-info">
        <div class="item-name">${r.name}</div>
        <div class="item-meta">${r.cat}${r.due?" · วันที่ "+r.due:""}${r.note?" · "+r.note:""}</div>
      </div>
      <div class="item-right">
        <div class="item-amount">${fmt(r.amount||0)}</div>
        <div class="item-actions">
          <button class="action-btn" onclick="openRecurringModal('${r.id}')" title="แก้ไข">✏️</button>
          <button class="action-btn" onclick="deleteRecurring('${r.id}')" title="ลบ">🗑</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

// ── Modal: Expense ───────────────────────────────────────────────────
window.openModal = (id=null) => {
  editId = id;
  const item = id ? allItems.find(x=>x.id===id) : null;
  document.getElementById("modal-title").textContent = id ? "แก้ไขรายการ" : "เพิ่มรายการ";
  document.getElementById("f-cat").innerHTML = CATS.map(c=>`<option value="${c.name}" ${item&&item.cat===c.name?"selected":""}>${c.icon} ${c.name}</option>`).join("");
  document.getElementById("f-month").innerHTML = TH_MONTHS.map((m,i)=>`<option value="${i}" ${(item?item.month:curMonth)===i?"selected":""}>${m}</option>`).join("");
  document.getElementById("f-name").value   = item ? (item.name||"") : "";
  document.getElementById("f-amount").value = item ? (item.amount||"") : "";
  document.getElementById("f-due").value    = item ? (item.due||"") : "";
  document.getElementById("f-year").value   = item ? (item.year+543) : (curYear+543);
  document.getElementById("f-note").value   = item ? (item.note||"") : "";
  document.getElementById("f-paid").checked = item ? !!item.paid : false;
  document.getElementById("modal-overlay").classList.remove("hidden");
  setTimeout(()=>document.getElementById("f-name").focus(),100);
};
window.closeModal = () => { document.getElementById("modal-overlay").classList.add("hidden"); editId=null; };
window.saveItem = async () => {
  const name   = document.getElementById("f-name").value.trim();
  const amount = parseFloat(document.getElementById("f-amount").value);
  const cat    = document.getElementById("f-cat").value;
  const due    = parseInt(document.getElementById("f-due").value)||null;
  const month  = parseInt(document.getElementById("f-month").value);
  const year   = (parseInt(document.getElementById("f-year").value)||(curYear+543)) - 543;
  const note   = document.getElementById("f-note").value.trim();
  const paid   = document.getElementById("f-paid").checked;
  if (!name) { showToast("กรุณากรอกชื่อรายการ"); return; }
  if (isNaN(amount)||amount<=0) { showToast("กรุณากรอกจำนวนเงิน"); return; }
  const data = {name,amount,cat,due,month,year,note,paid};
  try {
    if (editId) { await updateExpense(editId,data); showToast("แก้ไขแล้ว ✓"); }
    else        { await addExpense(data); showToast("เพิ่มแล้ว ✓"); }
    closeModal();
  } catch(e) { showToast("เกิดข้อผิดพลาด: "+e.message); }
};

// ── Modal: Recurring ─────────────────────────────────────────────────
window.openRecurringModal = (id=null) => {
  editRecId = id;
  const r = id ? allRecurring.find(x=>x.id===id) : null;
  document.getElementById("rec-modal-title").textContent = id ? "แก้ไขรายจ่ายประจำ" : "เพิ่มรายจ่ายประจำ";
  document.getElementById("r-cat").innerHTML = CATS.map(c=>`<option value="${c.name}" ${r&&r.cat===c.name?"selected":""}>${c.icon} ${c.name}</option>`).join("");
  document.getElementById("r-name").value   = r ? (r.name||"") : "";
  document.getElementById("r-amount").value = r ? (r.amount||"") : "";
  document.getElementById("r-due").value    = r ? (r.due||"") : "";
  document.getElementById("r-note").value   = r ? (r.note||"") : "";
  document.getElementById("rec-modal-overlay").classList.remove("hidden");
  setTimeout(()=>document.getElementById("r-name").focus(),100);
};
window.closeRecurringModal = () => { document.getElementById("rec-modal-overlay").classList.add("hidden"); editRecId=null; };
window.saveRecurring = async () => {
  const name   = document.getElementById("r-name").value.trim();
  const amount = parseFloat(document.getElementById("r-amount").value);
  const cat    = document.getElementById("r-cat").value;
  const due    = parseInt(document.getElementById("r-due").value)||null;
  const note   = document.getElementById("r-note").value.trim();
  if (!name) { showToast("กรุณากรอกชื่อรายการ"); return; }
  if (isNaN(amount)||amount<=0) { showToast("กรุณากรอกจำนวนเงิน"); return; }
  const data = {name,amount,cat,due,note};
  try {
    if (editRecId) { await updateRecurring(editRecId,data); showToast("แก้ไขแล้ว ✓"); }
    else           { await addRecurring(data); showToast("เพิ่มแล้ว ✓"); }
    closeRecurringModal();
  } catch(e) { showToast("เกิดข้อผิดพลาด: "+e.message); }
};

// ── Tabs ─────────────────────────────────────────────────────────────
window.switchTab = tab => {
  ["dashboard","recurring","bulk","report"].forEach(t => {
    document.getElementById("page-"+t).classList.toggle("hidden", t!==tab);
    document.getElementById("tab-"+t).classList.toggle("active", t===tab);
  });
};

// ── Settings ─────────────────────────────────────────────────────────
window.toggleSettings = () => {
  const panel = document.getElementById("settings-panel");
  const overlay = document.getElementById("settings-overlay");
  const cfg = getConfig()||{};
  document.getElementById("s-apiKey").value    = cfg.apiKey    ||"";
  document.getElementById("s-projectId").value = cfg.projectId ||"";
  document.getElementById("s-appId").value     = cfg.appId     ||"";
  panel.classList.toggle("hidden");
  overlay.classList.toggle("hidden");
};

// ── Export JSON ───────────────────────────────────────────────────────
window.exportData = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(allItems,null,2)],{type:"application/json"}));
  a.download = `expenses_${curYear}.json`; a.click();
  showToast("Export JSON แล้ว ✓");
};

// ── Helpers ───────────────────────────────────────────────────────────
function setSyncStatus(msg) { document.getElementById("sync-text").textContent = msg; }
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(window._tt);
  window._tt = setTimeout(()=>t.classList.add("hidden"), 2800);
}

// ── Init dropdowns ───────────────────────────────────────────────────
function initDropdowns() {
  // Apply recurring month selector
  const am = document.getElementById("apply-month");
  am.innerHTML = TH_MONTHS.map((m,i)=>`<option value="${i}" ${i===curMonth?"selected":""}>${m}</option>`).join("");
  document.getElementById("apply-year").value = curYear+543;

  // Report selectors
  const rm = document.getElementById("r-month");
  rm.innerHTML = TH_MONTHS.map((m,i)=>`<option value="${i}" ${i===curMonth?"selected":""}>${m}</option>`).join("");
  document.getElementById("r-year").value = curYear+543;

  // Bulk cat
  document.getElementById("b-cat").innerHTML = CATS.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join("");

  // Bulk preview on change
  document.getElementById("b-from").addEventListener("change", updateBulkPreview);
  document.getElementById("b-to").addEventListener("change", updateBulkPreview);
}

// ── Boot ──────────────────────────────────────────────────────────────
(function boot() {
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
    initDropdowns();
    startListeners();
    setSyncStatus("🟡 กำลังเชื่อมต่อ...");
  } catch(e) {
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    console.error(e);
  }
})();
