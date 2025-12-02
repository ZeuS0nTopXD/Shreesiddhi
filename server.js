// server.js - Production-ready with MongoDB session store and timestamped backups
require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
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

// -------------------- MongoDB Connection --------------------
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env. Set MONGO_URI to your MongoDB connection string.");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI) // No deprecated options
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// -------------------- Session store --------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60, // 14 days
    }),
    cookie: {
      maxAge: 60 * 60 * 1000, // 1 hour
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// -------------------- Simple Logger --------------------
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

// -------------------- Schemas & Models --------------------
const AppointmentSchema = new mongoose.Schema({
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
}, { strict: false });

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

const BackupSchema = new mongoose.Schema({
  collectionName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  data: { type: Array, default: [] },
  note: { type: String, default: null }
});

const Appointment = mongoose.model("Appointment", AppointmentSchema);
const Feedback = mongoose.model("Feedback", FeedbackSchema);
const Payment = mongoose.model("Payment", PaymentSchema);
const Backup = mongoose.model("Backup", BackupSchema);

// -------------------- Helpers --------------------
// Convert Mongoose doc (or array of docs) to plain objects with `id` (string) for frontend compatibility
function serializeDoc(doc) {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(d => serializeDoc(d));

  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = String(o._id);
  delete o._id;
  delete o.__v;

  // Format timestamp as YYYY/MM/DD HH:MM:SS in local time
  if (o.timestamp) {
    const d = new Date(o.timestamp);
    const pad = (n) => String(n).padStart(2, "0");
    o.timestamp = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  return o;
}



function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.path.startsWith("/api/"))
    return res.status(401).json({ error: "Unauthorized" });
  return res.redirect("/admin/login.html");
}

// -------------------- Routes --------------------
// Health check
app.get("/", (_req, res) => res.send("Shree Siddhi Ayur Wellness backend (MongoDB) is live ✅"));

// Public API: Appointments
app.post("/api/appointment", async (req, res) => {
  try {
    const payload = { ...req.body, fee: Number(req.body.fee) || 0, timestamp: req.body.timestamp ? new Date(req.body.timestamp) : undefined };
    const saved = await Appointment.create(payload);
    return res.json({ status: "success", type: "appointment", data: serializeDoc(saved) });
  } catch (e) {
    console.error("Save appointment error:", e);
    return res.status(500).json({ error: "Could not save appointment" });
  }
});

// Public API: Feedback
app.post("/api/feedback", async (req, res) => {
  try {
    const payload = {
      name: req.body.name ?? null,
      email: req.body.email ?? null,
      phone: req.body.phone ?? null,
      message: req.body.feedback ?? req.body.message ?? "",
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

// Admin routes: Fetch
app.get("/api/appointments", requireAdmin, async (_req, res) => {
  const arr = await Appointment.find().sort({ timestamp: -1 }).lean();
  const out = arr.map(a => { a.id = String(a._id); delete a._id; delete a.__v; return a; });
  res.json(out);
});

app.get("/api/feedbacks", requireAdmin, async (_req, res) => {
  const arr = await Feedback.find().sort({ timestamp: -1 }).lean();
  const out = arr.map(a => { a.id = String(a._id); delete a._id; delete a.__v; return a; });
  res.json(out);
});

app.get("/api/payments", requireAdmin, async (_req, res) => {
  const arr = await Payment.find().sort({ timestamp: -1 }).lean();
  const out = arr.map(a => { a.id = String(a._id); delete a._id; delete a.__v; return a; });
  res.json(out);
});

// -------------------- Backup & Undo --------------------
async function createBackupForCollection(collectionName, dataArray, note = null) {
  try {
    await Backup.create({
      collectionName,
      data: dataArray,
      note
    });
    console.log(`Backup created for ${collectionName} (${dataArray.length} items)`);
  } catch (e) {
    console.error(`Failed to create backup for ${collectionName}:`, e);
  }
}

async function restoreLatestBackupForCollection(collectionName) {
  const latest = await Backup.findOne({ collectionName }).sort({ createdAt: -1 }).lean();
  if (!latest) return { ok: false, message: "No backup available" };
  const docs = latest.data || [];
  const modelMap = { appointments: Appointment, feedback: Feedback, payments: Payment };
  const model = modelMap[collectionName];
  if (!model) return { ok: false, message: "Unknown collection for restore" };

  // restore: clear collection, then insert docs preserving existing _id fields
  // To preserve original _id, we pass docs as-is. If any inserted docs conflict, that is unlikely because we cleared the collection first.
  try {
    // clear collection and re-insert
    await model.deleteMany({});
    if (docs.length) {
      // If the backup items have _id as ObjectId-like strings, they will be used as-is.
      // Convert any _id strings to ObjectId where appropriate.
      const prepared = docs.map(d => {
        const copy = { ...d };
        // ensure no __v leaking
        delete copy.__v;
        return copy;
      });
      await model.insertMany(prepared, { ordered: false });
    }
    return { ok: true, message: "Restored from latest backup", restoredCount: docs.length };
  } catch (e) { return { ok: false, message: "Restore failed: " + e.message }; }
}

// Clear & Undo routes
app.delete("/api/appointments", requireAdmin, async (_req, res) => {
  const current = await Appointment.find().lean();
  await createBackupForCollection("appointments", current, "Cleared by admin");
  await Appointment.deleteMany({});
  res.json({ status: "success", message: "All appointments cleared. Undo available." });
});

app.delete("/api/feedbacks", requireAdmin, async (_req, res) => {
  const current = await Feedback.find().lean();
  await createBackupForCollection("feedback", current, "Cleared by admin");
  await Feedback.deleteMany({});
  res.json({ status: "success", message: "All feedback cleared. Undo available." });
});

app.post("/api/appointments/undo", requireAdmin, async (_req, res) => {
  const result = await restoreLatestBackupForCollection("appointments");
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json({ status: "success", message: result.message, restored: result.restoredCount });
});

app.post("/api/feedbacks/undo", requireAdmin, async (_req, res) => {
  const result = await restoreLatestBackupForCollection("feedback");
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json({ status: "success", message: result.message, restored: result.restoredCount });
});

// -------------------- Admin login/logout --------------------
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ success: true });
  }
  return res.json({ success: false });
});

app.get("/api/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    return res.redirect("/admin/admin-login.html");
  });
});

// -------------------- Admin pages --------------------
app.get("/admin/dashboard", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admindash.html")));
app.get("/admin/appointments", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admindash.html")));
app.get("/admin/feedback", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "afeedback.html")));
app.get("/admin/admin-login.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admin-login.html")));

// -------------------- Patch appointment --------------------
app.patch("/api/appointments/:id", requireAdmin, async (req, res) => {
  let updated = await Appointment.findByIdAndUpdate(req.params.id, { ...req.body }, { new: true });
  if (!updated) updated = await Appointment.findOneAndUpdate({ id: req.params.id }, { ...req.body }, { new: true });
  if (!updated) return res.status(404).json({ error: "Appointment not found" });
  res.json({ status: "success", data: serializeDoc(updated) });
});

// -------------------- Paytm placeholders --------------------
app.post("/api/paytm/order", async (req, res) => res.status(501).json({ success: false, message: "Paytm order placeholder" }));
app.post("/api/paytm/callback", async (req, res) => res.status(501).send("Paytm callback placeholder"));

// -------------------- Start server --------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
