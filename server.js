// server.js - MongoDB (Mongoose) version with timestamped backups (option C)
require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");
const PaytmChecksum = require("paytmchecksum"); // kept if Paytm used

const app = express();
const PORT = process.env.PORT || 3000;

// If behind a proxy (Render), allow secure cookies to work correctly
// and trust proxy for secure cookies
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// -------------------- Middleware --------------------
app.use(cors({ origin: true, credentials: true }));
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

// simple logger
app.use((req, _res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// -------------------- Config --------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";
const PAYTM_ENV = (process.env.PAYTM_ENV || "staging").toLowerCase();

function paytmHost() {
  return PAYTM_ENV === "production" ? "securegw.paytm.in" : "securegw-stage.paytm.in";
}
function paytmProcessUrl() {
  return PAYTM_ENV === "production"
    ? "https://securegw.paytm.in/order/process"
    : "https://securegw-stage.paytm.in/order/process";
}

// -------------------- MongoDB Connection --------------------
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env. Set MONGO_URI to your MongoDB connection string.");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// -------------------- Schemas & Models --------------------
const AppointmentSchema = new mongoose.Schema({
  // Keep similar fields as your original JSON structure
  name: { type: String, default: null },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  bookingType: { type: String, default: null },
  fee: { type: Number, default: 0 },
  date: { type: String, default: null },
  message: { type: String, default: "" },
  status: { type: String, default: "pending" },
  payment_id: { type: String, default: null },
  order_id: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
}, { strict: false }); // strict:false allows any extra fields to be stored (compat)

const FeedbackSchema = new mongoose.Schema({
  name: { type: String, default: null },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  message: { type: String, default: "" },
  rating: { type: Number, default: null },
  timestamp: { type: Date, default: Date.now },
}, { strict: false });

const PaymentSchema = new mongoose.Schema({
  order_id: { type: String, default: null },
  txn_id: { type: String, default: null },
  amount: { type: String, default: null },
  status: { type: String, default: null },
  gateway_response: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now },
}, { strict: false });

// Backup schema (stores timestamped backups for collections)
const BackupSchema = new mongoose.Schema({
  collectionName: { type: String, required: true }, // e.g. "appointments", "feedback"
  createdAt: { type: Date, default: Date.now },
  data: { type: Array, default: [] }, // array of documents (plain objects)
  note: { type: String, default: null }
});

const Appointment = mongoose.model("Appointment", AppointmentSchema);
const Feedback = mongoose.model("Feedback", FeedbackSchema);
const Payment = mongoose.model("Payment", PaymentSchema);
const Backup = mongoose.model("Backup", BackupSchema);

// -------------------- Helpers --------------------
// Convert Mongoose doc (or array of docs) to plain objects with `id` (string) for frontend compatibility
// Helper: serialize Mongoose doc to plain object with formatted timestamp
function serializeDoc(doc) {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(d => serializeDoc(d));

  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = String(o._id);
  delete o._id;
  delete o.__v;

  // Format timestamp as YYYY/MM/DD HH:MM:SS
  if (o.timestamp) {
    const d = new Date(o.timestamp);
    const pad = (n) => String(n).padStart(2, "0");
    o.timestamp = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  return o;
}


// middleware: requireAdmin (unchanged)
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();

  if (req.path.startsWith("/api/"))
    return res.status(401).json({ error: "Unauthorized" });

  return res.redirect("/admin/login.html");
}


// -------------------- Routes --------------------
// Health check
app.get("/", (_req, res) => res.send("Shree Siddhi Ayur Wellness backend (MongoDB) is live ✅"));

// Public routes
app.post("/api/appointment", async (req, res) => {
  try {
    // Accept incoming shape — ensures fee numeric and default timestamp
    const payload = {
      ...req.body,
      fee: req.body.fee ? Number(req.body.fee) : 0,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : undefined
    };
    const saved = await Appointment.create(payload);
    return res.json({ status: "success", type: "appointment", data: serializeDoc(saved) });
  } catch (e) {
    console.error("Save appointment error:", e);
    return res.status(500).json({ error: "Could not save appointment" });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const message = req.body.feedback ?? req.body.message ?? "";
    const payload = {
      name: req.body.name ?? null,
      email: req.body.email ?? null,
      phone: req.body.phone ?? null,
      message,
      rating: req.body.rating ? Number(req.body.rating) : null,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : undefined
    };
    const saved = await Feedback.create(payload);
    return res.json({ status: "success", type: "feedback", data: serializeDoc(saved) });
  } catch (e) {
    console.error("Save feedback error:", e);
    return res.status(500).json({ error: "Could not save feedback" });
  }
});

// Admin / protected routes
app.get("/api/appointments", requireAdmin, async (_req, res) => {
  try {
    const arr = await Appointment.find().sort({ timestamp: -1 }).lean();
    // serialize id
    const out = arr.map(a => {
      a.id = String(a._id);
      delete a._id;
      delete a.__v;
      return a;
    });
    res.json(out);
  } catch (e) {
    console.error("Fetch appointments error:", e);
    res.status(500).json({ error: "Could not fetch appointments" });
  }
});

app.get("/api/feedbacks", requireAdmin, async (_req, res) => {
  try {
    const arr = await Feedback.find().sort({ timestamp: -1 }).lean();
    const out = arr.map(a => {
      a.id = String(a._id);
      delete a._id;
      delete a.__v;
      return a;
    });
    res.json(out);
  } catch (e) {
    console.error("Fetch feedbacks error:", e);
    res.status(500).json({ error: "Could not fetch feedbacks" });
  }
});

app.get("/api/payments", requireAdmin, async (_req, res) => {
  try {
    const arr = await Payment.find().sort({ timestamp: -1 }).lean();
    const out = arr.map(a => {
      a.id = String(a._id);
      delete a._id;
      delete a.__v;
      return a;
    });
    res.json(out);
  } catch (e) {
    console.error("Fetch payments error:", e);
    res.status(500).json({ error: "Could not fetch payments" });
  }
});

// -------------------- Clear (with timestamped backup) --------------------
// Helper: create backup for collection
async function createBackupForCollection(collectionName, dataArray, note = null) {
  try {
    // ensure plain objects (not mongoose docs)
    const plain = (dataArray || []).map(d => {
      if (d && typeof d.toObject === "function") {
        const o = d.toObject();
        delete o.__v;
        return o;
      }
      const copy = { ...d };
      delete copy.__v;
      return copy;
    });
    await Backup.create({
      collectionName,
      data: plain,
      note
    });
    console.log(`Backup created for ${collectionName} (${plain.length} items)`);
  } catch (e) {
    console.error(`Failed to create backup for ${collectionName}:`, e);
  }
}

// Appointments clear
app.delete("/api/appointments", requireAdmin, async (_req, res) => {
  try {
    const current = await Appointment.find().lean();
    await createBackupForCollection("appointments", current, "Cleared by admin");
    await Appointment.deleteMany({});
    return res.json({ status: "success", message: "All appointments cleared. You can undo (restores the latest backup)." });
  } catch (e) {
    console.error("Clear appointments error:", e);
    return res.status(500).json({ error: "Could not clear appointments" });
  }
});

// Feedback clear
app.delete("/api/feedbacks", requireAdmin, async (_req, res) => {
  try {
    const current = await Feedback.find().lean();
    await createBackupForCollection("feedback", current, "Cleared by admin");
    await Feedback.deleteMany({});
    return res.json({ status: "success", message: "All feedback cleared. You can undo (restores the latest backup)." });
  } catch (e) {
    console.error("Clear feedback error:", e);
    return res.status(500).json({ error: "Could not clear feedback" });
  }
});

// -------------------- Undo (restore latest backup) --------------------
async function restoreLatestBackupForCollection(collectionName) {
  // find latest backup
  const latest = await Backup.findOne({ collectionName }).sort({ createdAt: -1 }).lean();
  if (!latest) return { ok: false, message: "No backup available" };

  const docs = latest.data || [];

  // Determine target model
  const modelMap = {
    appointments: Appointment,
    feedback: Feedback,
    payments: Payment
  };
  const model = modelMap[collectionName];
  if (!model) return { ok: false, message: "Unknown collection for restore" };

  try {
    // clear collection and re-insert
    await model.deleteMany({});
    if (docs.length) {
      // prepare docs: remove unwanted fields
      const prepared = docs.map(d => {
        const copy = { ...d };
        delete copy.__v;
        return copy;
      });
      await model.insertMany(prepared, { ordered: false });
    }
    return { ok: true, message: "Restored from latest backup", restoredCount: docs.length };
  } catch (e) {
    console.error("Restore error:", e);
    return { ok: false, message: "Restore failed: " + e.message };
  }
}

app.post("/api/appointments/undo", requireAdmin, async (_req, res) => {
  try {
    const result = await restoreLatestBackupForCollection("appointments");
    if (!result.ok) return res.status(400).json({ error: result.message });
    return res.json({ status: "success", message: result.message, restored: result.restoredCount });
  } catch (e) {
    console.error("Appointments undo error:", e);
    return res.status(500).json({ error: "Could not undo appointments clear" });
  }
});

app.post("/api/feedbacks/undo", requireAdmin, async (_req, res) => {
  try {
    const result = await restoreLatestBackupForCollection("feedback");
    if (!result.ok) return res.status(400).json({ error: result.message });
    return res.json({ status: "success", message: result.message, restored: result.restoredCount });
  } catch (e) {
    console.error("Feedback undo error:", e);
    return res.status(500).json({ error: "Could not undo feedback clear" });
  }
});

// -------------------- Admin Login / Logout --------------------
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.admin = true;   // <— IMPORTANT
    return res.json({ success: true });
  }

  return res.json({ success: false });
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

// -------------------- Admin pages (protected) --------------------
app.get("/admin/dashboard", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admindash.html")));
app.get("/admin/appointments", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admindash.html")));
app.get("/admin/feedback", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "afeedback.html")));
app.get("/admin/admin-login.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admin-login.html")));

// -------------------- PATCH update appointment (for admin 'Mark Done') --------------------
app.patch("/api/appointments/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    // Find by _id or by custom id field: support both
    let updated = null;
    // Try find by ObjectId first
    try {
      updated = await Appointment.findByIdAndUpdate(id, { ...req.body }, { new: true });
    } catch (err) {
      // ignore and try fallback
    }
    if (!updated) {
      // fallback: search by string id field (if older items were stored with id)
      updated = await Appointment.findOneAndUpdate({ id: id }, { ...req.body }, { new: true });
    }
    if (!updated) return res.status(404).json({ error: "Appointment not found" });
    return res.json({ status: "success", data: serializeDoc(updated) });
  } catch (e) {
    console.error("Patch appointment error:", e);
    return res.status(500).json({ error: "Could not update appointment" });
  }
});

// -------------------- Paytm Integration endpoints (kept minimal here) -------------------------
app.post("/api/paytm/order", async (req, res) => {
  // keep your previous implementation here if using Paytm.
  // For brevity I've omitted the detailed Paytm code in this snippet.
  return res.status(501).json({ success: false, message: "Paytm order endpoint placeholder" });
});
app.post("/api/paytm/callback", async (req, res) => {
  return res.status(501).send("Paytm callback placeholder");
});

// -------------------- Payments saving helper (if you want to record payments) --------------
async function pushPaymentToDB(obj) {
  try {
    const saved = await Payment.create({
      order_id: obj.order_id ?? null,
      txn_id: obj.txn_id ?? null,
      amount: obj.amount ?? null,
      status: obj.status ?? null,
      gateway_response: obj.gateway_response ?? null,
      timestamp: obj.timestamp ? new Date(obj.timestamp) : undefined
    });
    return serializeDoc(saved);
  } catch (e) {
    console.error("pushPaymentToDB error:", e);
    throw e;
  }
}

// Example usage inside Paytm callback: await pushPaymentToDB(paymentObj);

// -------------------- Start server --------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
