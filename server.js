// ==========================================
// 🌿 ShreeSiddhi Ayur Wellness Backend Server (Final)
// - Admin panel + Paytm (staging/production) integration
// - Admin-protected routes for sensitive endpoints
// - Payments logging, backups, health check, CORS
// ==========================================

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const cors = require("cors");
const PaytmChecksum = require("paytmchecksum");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------
// Middleware
// -------------------------
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// Simple request logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ➜ ${req.method} ${req.url}`);
  next();
});

// -------------------------
// Config / Admin creds
// -------------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";

// Paytm environment: "staging" or "production"
const PAYTM_ENV = (process.env.PAYTM_ENV || "staging").toLowerCase();

function paytmHost() {
  return PAYTM_ENV === "production" ? "securegw.paytm.in" : "securegw-stage.paytm.in";
}

function paytmProcessUrl() {
  return PAYTM_ENV === "production"
    ? "https://securegw.paytm.in/order/process"
    : "https://securegw-stage.paytm.in/order/process";
}

// -------------------------
// Helpers: file utilities
// -------------------------
function filePathOf(name) {
  return path.join(__dirname, name);
}
function backupPathOf(name) {
  return path.join(__dirname, "backup", name);
}

function ensureJsonFile(name) {
  const fp = filePathOf(name);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, "[]", "utf8");
  return fp;
}

function readJsonArray(name) {
  const fp = ensureJsonFile(name);
  try {
    const raw = fs.readFileSync(fp, "utf8") || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`JSON parse error in ${name}:`, e.message);
    return [];
  }
}

function writeJsonArray(name, arr) {
  try {
    fs.writeFileSync(filePathOf(name), JSON.stringify(arr, null, 2), "utf8");
  } catch (e) {
    console.error(`Failed to write ${name}:`, e);
  }
}

function pushAppointment(obj) {
  const arr = readJsonArray("appointments.json");
  const newAppointment = {
    id: `apt_${Date.now()}`,
    name: obj.name || null,
    email: obj.email || null,
    phone: obj.phone || null,
    bookingType: obj.bookingType || null,
    fee: Number(obj.fee) || 0,
    date: obj.date || null,
    message: obj.message || "",
    payment_id: obj.payment_id || null,
    order_id: obj.order_id || null,
    status: obj.status || "pending",
    timestamp: new Date().toISOString(),
  };
  arr.push(newAppointment);
  writeJsonArray("appointments.json", arr);
  return newAppointment;
}

function pushFeedback(obj) {
  const arr = readJsonArray("feedback.json");
  const newFeedback = {
    id: `fb_${Date.now()}`,
    name: obj.name || null,
    email: obj.email || null,
    phone: obj.phone || null,
    message: obj.feedback || "",
    rating: Number(obj.rating) || null,
    timestamp: new Date().toISOString(),
  };
  arr.push(newFeedback);
  writeJsonArray("feedback.json", arr);
  return newFeedback;
}

function pushPayment(obj) {
  const arr = readJsonArray("payments.json");
  const newPayment = {
    id: `pay_${Date.now()}`,
    order_id: obj.order_id || null,
    txn_id: obj.txn_id || null,
    amount: obj.amount || null,
    status: obj.status || null,
    gateway_response: obj.gateway_response || null,
    timestamp: new Date().toISOString(),
  };
  arr.push(newPayment);
  writeJsonArray("payments.json", arr);
  return newPayment;
}

function clearFile(name) {
  const fp = filePathOf(name);
  const bp = backupPathOf(name);
  fs.mkdirSync(path.dirname(bp), { recursive: true });
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, "[]", "utf8");
    fs.writeFileSync(bp, "[]", "utf8");
    return;
  }
  try {
    const current = fs.readFileSync(fp, "utf8");
    fs.writeFileSync(bp, current, "utf8");
    fs.writeFileSync(fp, "[]", "utf8");
  } catch (e) {
    console.error(`Error clearing ${name}:`, e);
    throw e;
  }
}

function undoClear(name) {
  const fp = filePathOf(name);
  const bp = backupPathOf(name);
  if (!fs.existsSync(bp)) return false;
  try {
    const backup = fs.readFileSync(bp, "utf8");
    fs.writeFileSync(fp, backup, "utf8");
    return true;
  } catch (e) {
    console.error(`Error restoring backup for ${name}:`, e);
    return false;
  }
}

// -------------------------
// Middleware: requireAdmin
// -------------------------
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });
  return res.redirect("/admin/admin-login.html");
}

// -------------------------
// Health check
// -------------------------
app.get("/", (_req, res) => res.send("Shree Siddhi Ayur Wellness backend is live ✅"));

// -------------------------
// Appointment & Feedback routes
// -------------------------
app.post("/api/appointment", (req, res) => {
  try {
    const saved = pushAppointment(req.body);
    return res.json({ status: "success", type: "appointment", data: saved });
  } catch (e) {
    console.error("Save appointment error:", e);
    return res.status(500).json({ error: "Could not save appointment" });
  }
});

app.post("/api/feedback", (req, res) => {
  try {
    const saved = pushFeedback(req.body);
    return res.json({ status: "success", type: "feedback", data: saved });
  } catch (e) {
    console.error("Save feedback error:", e);
    return res.status(500).json({ error: "Could not save feedback" });
  }
});

// Admin protected routes
app.get("/api/appointments", requireAdmin, (_req, res) => res.json(readJsonArray("appointments.json")));
app.get("/api/feedbacks", requireAdmin, (_req, res) => res.json(readJsonArray("feedback.json")));
app.get("/api/payments", requireAdmin, (_req, res) => res.json(readJsonArray("payments.json")));

app.delete("/api/appointments", requireAdmin, (_req, res) => {
  try {
    clearFile("appointments.json");
    return res.json({ status: "success", message: "All appointments cleared. You can undo." });
  } catch (e) {
    console.error("Clear appointments error:", e);
    return res.status(500).json({ error: "Could not clear appointments" });
  }
});

app.delete("/api/feedbacks", requireAdmin, (_req, res) => {
  try {
    clearFile("feedback.json");
    return res.json({ status: "success", message: "All feedback cleared. You can undo." });
  } catch (e) {
    console.error("Clear feedback error:", e);
    return res.status(500).json({ error: "Could not clear feedback" });
  }
});

app.post("/api/appointments/undo", requireAdmin, (_req, res) => {
  if (undoClear("appointments.json")) return res.json({ status: "success", message: "Appointments restored from backup" });
  return res.status(400).json({ error: "No backup available" });
});

app.post("/api/feedbacks/undo", requireAdmin, (_req, res) => {
  if (undoClear("feedback.json")) return res.json({ status: "success", message: "Feedback restored from backup" });
  return res.status(400).json({ error: "No backup available" });
});

// -------------------------
// PATCH: mark appointment done
// -------------------------
app.patch("/api/appointments/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const appointments = readJsonArray("appointments.json");
  const index = appointments.findIndex(a => a.id === id);
  if (index === -1) return res.status(404).json({ error: "Appointment not found" });
  appointments[index].status = req.body.status || "done";
  writeJsonArray("appointments.json", appointments);
  return res.json({ status: "success", data: appointments[index] });
});

// -------------------------
// Admin Login / Logout
// -------------------------
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  } else {
    return res.json({ success: false });
  }
});

app.get("/api/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    return res.redirect("/admin/admin-login.html");
  });
});

// Admin pages (protected)
app.get("/admin/dashboard", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admindash.html")));
app.get("/admin/appointments", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admindash.html")));
app.get("/admin/feedback", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "afeedback.html")));
app.get("/admin/admin-login.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admin-login.html")));

// -------------------------
// Paytm Integration (placeholders)
// -------------------------
app.post("/api/paytm/order", async (req, res) => { /* Implement your Paytm order logic */ });
app.post("/api/paytm/callback", async (req, res) => { /* Implement your Paytm callback logic */ });

// -------------------------
// Start server
// -------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
