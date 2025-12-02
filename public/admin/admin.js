// ==========================================
// 🌿 KJ Pharmaceuticals Admin Panel JS
// Combines Dashboard, Appointments, Feedback, Submissions/Payments
// ==========================================

const API = {
  login: "/api/admin/login",
  logout: "/api/admin/logout",
  appointments: "/api/appointments",
  feedbacks: "/api/feedbacks",
  payments: "/api/payments",
  clearAppointments: "/api/appointments",
  clearFeedbacks: "/api/feedbacks",
  undoAppointments: "/api/appointments/undo",
  undoFeedbacks: "/api/feedbacks/undo"
};

let appointmentsData = [];

// ------------------------------
// ADMIN LOGIN
// ------------------------------
async function adminLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username")?.value;
  const password = document.getElementById("password")?.value;

  try {
    const res = await fetch(API.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include"
    });

    const data = await res.json();

    if (data.success) {
      window.location.href = "admindash.html";
    } else {
      const errEl = document.getElementById("errorMsg");
      if (errEl) errEl.textContent = "Invalid login!";
    }
  } catch (err) {
    console.error("Login error:", err);
    const errEl = document.getElementById("errorMsg");
    if (errEl) errEl.textContent = "Login failed (network)";
  }
}

// ------------------------------
// LOGOUT
// ------------------------------
async function logout() {
  try {
    await fetch(API.logout, { credentials: "include" });
  } catch (err) {
    console.error("logout error:", err);
  } finally {
    window.location.href = "/admin/admin-login.html";
  }
}

// ------------------------------
// DASHBOARD
// ------------------------------
async function fetchAppointments() {
  const res = await fetch(API.appointments, { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/admin/admin-login.html";
    return [];
  }
  return res.json();
}

async function fetchFeedback() {
  const res = await fetch(API.feedbacks, { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/admin/admin-login.html";
    return [];
  }
  return res.json();
}

async function renderDashboard() {
  try {
    appointmentsData = await fetchAppointments();
    const feedback = await fetchFeedback();

    document.getElementById("appointmentsCount").textContent = appointmentsData.length;
    document.getElementById("feedbackCount").textContent = feedback.length;
    document.getElementById("patientsCount").textContent = new Set(appointmentsData.map(a => a.email)).size;
    document.getElementById("revenueCount").textContent = "₹" + appointmentsData.reduce((s,a) => s + (Number(a.fee) || 0), 0);

    renderAppointmentsTable();
    renderFeedbackTable(feedback);
  } catch (err) {
    console.error("renderDashboard error:", err);
  }
}

// ------------------------------
// NAVIGATION
// ------------------------------
function showSection(id, el) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  document.querySelectorAll(".sidebar a").forEach(a => a.classList.remove("active"));
  if (el) el.classList.add("active");

  const header = document.querySelector(".header h1");
  if (header) header.textContent = id.charAt(0).toUpperCase() + id.slice(1);

  if (id === "submissions") loadSubmissions();
  if (id === "feedback") loadFeedbacks();
}

// ------------------------------
// APPOINTMENTS TABLE
// ------------------------------
function renderAppointmentsTable() {
  const aptTable = document.getElementById("appointmentsTable");
  const aptHeader = document.getElementById("appointmentsHeader");

  if (!aptTable || !aptHeader) return;

  aptTable.innerHTML = "";
  aptHeader.innerHTML = "";

  if (!appointmentsData || !appointmentsData.length) {
    aptTable.innerHTML = `<tr><td colspan='7' class='empty-row'>No appointments</td></tr>`;
    return;
  }

  const keys = Object.keys(appointmentsData[0]);
  aptHeader.innerHTML = `<tr>${keys.map(k=>`<th>${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}<th>Status</th><th>Actions</th></tr>`;

  aptTable.innerHTML = appointmentsData.map(a => {
    return `<tr>
      ${keys.map(k => `<td>${(a[k] ?? "-")}</td>`).join('')}
      <td><span class="status ${a.status==='done'?'done':'pending'}">${a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : 'Pending'}</span></td>
      <td><button class="action-btn" onclick="markDone('${a.id}')">Mark Done</button></td>
    </tr>`;
  }).join('');
}

async function markDone(id) {
  try {
    const res = await fetch(`${API.appointments}/${id}`, {
      method: "PATCH",
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({status:'done'}),
      credentials: "include"
    });
    if (res.status === 401) {
      window.location.href = "/admin/admin-login.html";
      return;
    }
    if (!res.ok) {
      console.error("markDone failed", await res.text());
      alert("Failed to mark done");
      return;
    }
    await renderDashboard();
  } catch (err) {
    console.error("markDone error:", err);
    alert("Network error while marking done");
  }
}

// ------------------------------
// FEEDBACK TABLE
// ------------------------------
function renderFeedbackTable(feedback) {
  const fbTable = document.getElementById("feedbackTable");
  const fbHeader = document.getElementById("feedbackHeader");

  if (!fbTable || !fbHeader) return;

  fbTable.innerHTML = "";
  fbHeader.innerHTML = "";

  if (!feedback || !feedback.length) {
    fbTable.innerHTML = `<tr><td colspan="5" class="empty-row">No feedback</td></tr>`;
    return;
  }

  const keys = Object.keys(feedback[0]);
  fbHeader.innerHTML = `<tr>${keys.map(k => `<th>${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}</tr>`;
  fbTable.innerHTML = feedback.map(f=>`<tr>${keys.map(k=>`<td>${(f[k]??'-')}</td>`).join('')}</tr>`).join('');
}

// ------------------------------
// FILTER APPOINTMENTS
// ------------------------------
function applyFilters() {
  const search = (document.getElementById("searchInput")?.value ?? "").toLowerCase();
  const statusFilter = document.getElementById("statusFilter")?.value ?? "all";

  const rows = document.querySelectorAll("#appointmentsTable tr");
  rows.forEach(row => {
    const cells = Array.from(row.children);
    const text = cells.map(c=>c.textContent.toLowerCase()).join(' ');
    const status = row.querySelector(".status")?.textContent.toLowerCase() || "";
    row.style.display = (text.includes(search) && (statusFilter==='all'||status===statusFilter)) ? "" : "none";
  });
}

// ------------------------------
// CLEAR & UNDO
// ------------------------------
async function clearAppointments() {
  if(!confirm("Clear all appointments?")) return;
  try {
    const res = await fetch(API.clearAppointments, {method:"DELETE", credentials:"include"});
    if (res.status === 401) {
      window.location.href = "/admin/admin-login.html";
      return;
    }
    await renderDashboard();
    alert("Appointments cleared. You can undo from the dashboard.");
  } catch (err) {
    console.error("clearAppointments error:", err);
    alert("Failed to clear appointments");
  }
}

async function clearFeedbacks() {
  if(!confirm("Clear all feedback?")) return;
  try {
    const res = await fetch(API.clearFeedbacks, {method:"DELETE", credentials:"include"});
    if (res.status === 401) {
      window.location.href = "/admin/admin-login.html";
      return;
    }
    await renderDashboard();
    alert("Feedback cleared. You can undo from the dashboard.");
  } catch (err) {
    console.error("clearFeedbacks error:", err);
    alert("Failed to clear feedback");
  }
}

async function undoAppointments() {
  try {
    const res = await fetch(API.undoAppointments, {method:"POST", credentials:"include"});
    const data = await res.json();
    alert(data.message || "Undo completed");
    await renderDashboard();
  } catch (err) {
    console.error("undoAppointments error:", err);
    alert("Failed to undo");
  }
}

async function undoFeedbacks() {
  try {
    const res = await fetch(API.undoFeedbacks, {method:"POST", credentials:"include"});
    const data = await res.json();
    alert(data.message || "Undo completed");
    await renderDashboard();
  } catch (err) {
    console.error("undoFeedbacks error:", err);
    alert("Failed to undo");
  }
}

// ------------------------------
// SUBMISSIONS & PAYMENTS
// ------------------------------
async function loadSubmissions() {
  try {
    const [subsRes, payRes] = await Promise.all([
      fetch(API.appointments, {credentials:"include"}),
      fetch(API.payments, {credentials:"include"})
    ]);

    if (subsRes.status === 401 || payRes.status === 401) {
      window.location.href = "/admin/admin-login.html";
      return;
    }

    const submissions = await subsRes.json();
    const payments = await payRes.json();

    renderAdminTable("submissions", submissions);
    renderAdminTable("payments", payments);
  } catch(err) {
    console.error(err);
    const sb = document.getElementById("submissionsBody");
    const pb = document.getElementById("paymentsBody");
    if (sb) sb.innerHTML = `<tr><td colspan='5' class='empty-row'>Failed to load submissions</td></tr>`;
    if (pb) pb.innerHTML = `<tr><td colspan='5' class='empty-row'>Failed to load payments</td></tr>`;
  }
}

function renderAdminTable(type, data){
  const headerEl = document.getElementById(type+"Header");
  const bodyEl = document.getElementById(type+"Body");

  if(!headerEl || !bodyEl) return;

  if(!data || !data.length){
    bodyEl.innerHTML=`<tr><td colspan='5' class='empty-row'>No ${type} yet</td></tr>`;
    return;
  }

  headerEl.innerHTML = `<tr>${Object.keys(data[0]).map(k=>`<th>${k}</th>`).join("")}</tr>`;
  bodyEl.innerHTML = data.map(r=>{
    const statusClass = r.status==='success'?"status done":r.status==='failure'?"status pending":""; 
    return `<tr class="${statusClass}">${Object.values(r).map(v=>`<td>${v}</td>`).join("")}</tr>`;
  }).join("");
}

// ------------------------------
// AUTO-REFRESH
// ------------------------------
const POLL_INTERVAL = 5000;
setInterval(async()=>{
  const activeSection=document.querySelector(".section.active")?.id;
  if(activeSection==="dashboard") await renderDashboard();
  else if(activeSection==="appointments") {
    appointmentsData = await fetchAppointments();
    renderAppointmentsTable();
  } else if(activeSection==="feedback") {
    const feedback = await fetchFeedback();
    renderFeedbackTable(feedback);
  } else if(activeSection==="submissions") await loadSubmissions();
},POLL_INTERVAL);

// ------------------------------
// INIT
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("appointmentsCount")) {
    renderDashboard();

    // Attach Clear & Undo buttons
    document.getElementById("clearAppointmentsBtn")?.addEventListener("click", clearAppointments);
    document.getElementById("clearFeedbacksBtn")?.addEventListener("click", clearFeedbacks);
    document.getElementById("undoAppointmentsBtn")?.addEventListener("click", undoAppointments);
    document.getElementById("undoFeedbacksBtn")?.addEventListener("click", undoFeedbacks);
  }

  // Attach login form if exists
  document.getElementById("loginForm")?.addEventListener("submit", adminLogin);
});
