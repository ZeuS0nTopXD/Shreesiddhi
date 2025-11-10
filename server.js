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
const https = require("https");
const session = require("express-session");
const cors = require("cors");
const PaytmChecksum = require("paytmchecksum");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------
// Middleware
// -------------------------
app.use(cors()); // enable CORS for dev; restrict in production if needed
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true })); // required to parse Paytm callback (application/x-www-form-urlencoded)
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production" ? true : false, // set secure:true when using HTTPS in production
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
const PAYTM_ENV = (process.env.PAYTM_ENV || "staging").toLowerCase(); // staging | production

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
  if (!fs.existsSync(fp)) {
    try {
      fs.writeFileSync(fp, "[]", "utf8");
    } catch (e) {
      console.error(`Unable to create ${name}:`, e);
    }
  }
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
    message: obj.message || "",
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
  // if file doesn't exist, create empty and return
  if (!fs.existsSync(fp)) {
    try {
      fs.writeFileSync(fp, "[]", "utf8");
      fs.writeFileSync(bp, "[]", "utf8");
    } catch (e) {
      console.error(`Error creating ${name} or its backup:`, e);
    }
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
  // If request is an API call return 401 JSON, else redirect to login page
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });
  return res.redirect("/admin/admin-login.html");
}

// -------------------------
// Health check
// -------------------------
app.get("/", (req, res) => res.send("KJ Pharmaceuticals backend is live ✅"));

// -------------------------
// Appointment & Feedback routes
// -------------------------
app.get("/api/hello", (_req, res) => res.json({ message: "Hello from KJ Pharmaceuticals Backend 👋" }));

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

// Protected: only admin can list or clear
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
app.get("/admin/dashboard", requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "admindash.html"));
});
app.get("/admin/appointments", requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "admindash.html"));
});
app.get("/admin/feedback", requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "afeedback.html"));
});
// Serve admin login at the standard admin path
app.get("/admin/admin-login.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin", "admin-login.html")));

// -------------------------
// Paytm Integration
// -------------------------

// 1) Create order and provide params to frontend
app.post("/api/paytm/order", async (req, res) => {
  const { amount, email, phone } = req.body;
  if (!amount) return res.status(400).json({ success: false, message: "Amount is required" });

  const orderId = "ORDER_" + Date.now();

  // Paytm params required for checkout
  const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const paytmParams = {
    MID: process.env.PAYTM_MID,
    WEBSITE: process.env.PAYTM_WEBSITE,
    INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE_ID,
    CHANNEL_ID: process.env.PAYTM_CHANNEL_ID || "WEB",
    ORDER_ID: orderId,
    CUST_ID: email || phone || `CUST_${Date.now()}`,
    TXN_AMOUNT: String(amount),
    CALLBACK_URL: `${serverUrl}/api/paytm/callback`,
    MOBILE_NO: phone || "",
    EMAIL: email || "",
  };

  try {
    const checksum = await PaytmChecksum.generateSignature(paytmParams, process.env.PAYTM_MERCHANT_KEY);
    paytmParams.CHECKSUMHASH = checksum;

    // Log the order intent to payments.json as "INITIATED"
    pushPayment({
      order_id: orderId,
      txn_id: null,
      amount: amount,
      status: "INITIATED",
      gateway_response: null,
    });

    // Return params to frontend to post to Paytm's process URL
    return res.json({
      success: true,
      data: {
        paytmUrl: paytmProcessUrl(),
        params: paytmParams,
      },
    });
  } catch (err) {
    console.error("Paytm checksum error:", err);
    return res.status(500).json({ success: false, message: "Checksum generation failed" });
  }
});

// 2) Callback from Paytm after payment (Paytm posts form-urlencoded)
app.post("/api/paytm/callback", async (req, res) => {
  // Paytm will POST form-urlencoded data — express.urlencoded has parsed it into req.body
  const receivedData = { ...req.body };

  if (!receivedData || Object.keys(receivedData).length === 0) {
    console.error("Empty callback body from Paytm");
    return res.status(400).send("Bad Request");
  }

  const paytmChecksum = receivedData.CHECKSUMHASH;
  delete receivedData.CHECKSUMHASH;

  try {
    // Verify signature (await is safe whether it's promise or not)
    const isValid = await PaytmChecksum.verifySignature(receivedData, process.env.PAYTM_MERCHANT_KEY, paytmChecksum);
    if (!isValid) {
      console.error("⚠️ Checksum mismatch for order:", receivedData.ORDERID);
      // Log failed verification
      pushPayment({
        order_id: receivedData.ORDERID || null,
        txn_id: receivedData.TXNID || null,
        amount: receivedData.TXNAMOUNT || null,
        status: "CHECKSUM_MISMATCH",
        gateway_response: receivedData,
      });
      return res.status(400).send("Checksum mismatch");
    }
  } catch (e) {
    console.error("Error verifying checksum:", e);
    // still log and fail gracefully
    pushPayment({
      order_id: receivedData.ORDERID || null,
      txn_id: receivedData.TXNID || null,
      amount: receivedData.TXNAMOUNT || null,
      status: "CHECKSUM_VERIFY_ERROR",
      gateway_response: { error: e && e.message ? e.message : String(e), payload: receivedData },
    });
    return res.status(500).send("Checksum verification error");
  }

  // Query Paytm Order Status to be sure about final status
  const params = {
    MID: process.env.PAYTM_MID,
    ORDERID: receivedData.ORDERID,
  };

  try {
    const checksum = await PaytmChecksum.generateSignature(params, process.env.PAYTM_MERCHANT_KEY);
    params.CHECKSUMHASH = checksum;

    const postData = JSON.stringify(params);
    const options = {
      hostname: paytmHost(),
      port: 443,
      path: "/order/status",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    let response = "";
    const postReq = https.request(options, (postRes) => {
      postRes.on("data", (chunk) => (response += chunk));
      postRes.on("end", () => {
        try {
          const result = JSON.parse(response || "{}");

          // Log the gateway response
          pushPayment({
            order_id: receivedData.ORDERID,
            txn_id: result.TXNID || receivedData.TXNID || null,
            amount: result.TXNAMOUNT || receivedData.TXNAMOUNT || null,
            status: result.STATUS || receivedData.STATUS || "UNKNOWN",
            gateway_response: result,
          });

          if (result.STATUS === "TXN_SUCCESS") {
            // Persist appointment (or otherwise mark order as paid)
            pushAppointment({
              name: receivedData.CUST_ID || null,
              email: receivedData.EMAIL || null,
              phone: receivedData.MOBILE_NO || null,
              bookingType: "Paytm",
              fee: result.TXNAMOUNT || receivedData.TXNAMOUNT,
              date: new Date().toISOString(),
              payment_id: result.TXNID || null,
              order_id: receivedData.ORDERID,
            });
            return res.redirect("/success.html");
          } else {
            console.error("Payment Failed:", result);
            return res.redirect("/failure.html");
          }
        } catch (parseErr) {
          console.error("Failed to parse Paytm status response:", parseErr);
          return res.redirect("/failure.html");
        }
      });
    });

    postReq.on("error", (e) => {
      console.error("Paytm status request failed:", e);
      return res.redirect("/failure.html");
    });

    postReq.write(postData);
    postReq.end();
  } catch (err) {
    console.error("Error during Paytm status verification:", err);
    return res.redirect("/failure.html");
  }
});

// -------------------------
// Start server
// -------------------------
module.exports = app;

