# 💰 รายจ่ายประจำเดือน

แอปจัดการรายจ่ายส่วนตัว ใช้งานบน GitHub Pages + Firebase Firestore
ข้อมูลซิงค์ข้ามอุปกรณ์แบบ realtime

---

## 📁 โครงสร้างไฟล์

```
expense-tracker/
├── index.html   ← หน้าหลัก
├── style.css    ← สไตล์ (responsive)
├── app.js       ← logic + Firebase
└── README.md    ← คู่มือนี้
```

---

## 🔥 ขั้นตอนตั้งค่า Firebase (ทำครั้งเดียว ~5 นาที)

### 1. สร้าง Firebase Project
1. ไปที่ https://console.firebase.google.com
2. คลิก **"Add project"** → ตั้งชื่อโปรเจกต์ → สร้าง

### 2. เพิ่ม Firestore Database
1. ในเมนูซ้าย → **Build → Firestore Database**
2. คลิก **"Create database"**
3. เลือก **Production mode** → เลือก region ใกล้ (asia-southeast1)
4. คลิก **Enable**

### 3. ตั้ง Firestore Rules (สำหรับใช้คนเดียว)
1. ไปที่ Firestore → แท็บ **Rules**
2. แก้ rules เป็น:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Rules นี้เปิดให้ทุกคนเข้าถึงได้ ใช้ได้ถ้าข้อมูลไม่ sensitive
> ถ้าต้องการล็อก ให้เพิ่ม Authentication ทีหลัง

3. คลิก **Publish**

### 4. สร้าง Web App และคัดลอก Config
1. ไปที่ Project Settings (icon ⚙️ บนซ้าย)
2. เลื่อนลงมาหา **"Your apps"** → คลิก **"</> Web"**
3. ตั้งชื่อ App → คลิก **Register app**
4. จะได้ config แบบนี้:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "my-project.firebaseapp.com",
  projectId: "my-project-12345",
  storageBucket: "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

5. คัดลอก **apiKey**, **projectId**, **appId** ไว้

---

## 🚀 Deploy บน GitHub Pages

### 1. สร้าง GitHub Repository
1. ไปที่ https://github.com/new
2. ตั้งชื่อ repo เช่น `expense-tracker`
3. เลือก **Public** (GitHub Pages ฟรีต้องเป็น Public)
4. คลิก **Create repository**

### 2. อัปโหลดไฟล์
**วิธีง่าย (ผ่านเว็บ):**
1. เปิด repo → คลิก **"Add file" → "Upload files"**
2. ลาก `index.html`, `style.css`, `app.js` ไปวาง
3. คลิก **Commit changes**

**วิธี git:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/expense-tracker.git
git push -u origin main
```

### 3. เปิด GitHub Pages
1. ไปที่ repo → **Settings → Pages**
2. Source: เลือก **Deploy from a branch**
3. Branch: **main** → folder: **/ (root)**
4. คลิก **Save**
5. รอสักครู่ จะได้ URL เช่น: `https://username.github.io/expense-tracker`

---

## 📱 วิธีใช้งาน

1. เปิด URL จาก GitHub Pages
2. กรอก Firebase Config (apiKey, projectId, appId) ที่หน้า Setup
3. Config จะเก็บในเบราเซอร์ของคุณ ไม่ต้องกรอกใหม่
4. เริ่มเพิ่มรายการได้เลย!

### ใช้บนโทรศัพท์
- เปิด URL เดียวกันในเบราเซอร์มือถือ
- กรอก Config อีกครั้ง (ครั้งแรกครั้งเดียว)
- ข้อมูลจะซิงค์ realtime ทุกอุปกรณ์ทันที

### บันทึกเป็น Shortcut (มือถือ)
- **iPhone:** Safari → Share → "Add to Home Screen"
- **Android:** Chrome → Menu → "Add to Home screen"

---

## 🗂️ โครงสร้างข้อมูลใน Firestore

Collection: `expenses`

| Field     | Type    | คำอธิบาย                     |
|-----------|---------|------------------------------|
| name      | string  | ชื่อรายการ                   |
| amount    | number  | จำนวนเงิน (บาท)              |
| cat       | string  | หมวดหมู่                     |
| due       | number  | วันครบกำหนด (1-31)           |
| month     | number  | เดือน (0=มกราคม, 11=ธันวาคม) |
| year      | number  | ปี ค.ศ.                      |
| note      | string  | หมายเหตุ                     |
| paid      | boolean | จ่ายแล้วหรือยัง               |
| createdAt | number  | timestamp                    |

---

## 💡 Tips

- **Export JSON**: ไปที่ Settings ⚙️ → Export JSON เพื่อสำรองข้อมูล
- **เปลี่ยน Config**: ไปที่ Settings ⚙️ → Firebase Config
- **Offline**: ข้อมูลจะแสดงจาก cache ถ้าไม่มีอินเทอร์เน็ต
