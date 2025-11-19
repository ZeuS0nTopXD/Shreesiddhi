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

  const res = await fetch(API.login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "include"
  }).then(r => r.json());

  if (res.success) {
    window.location.href = "/admin/dashboard";
  } else {
    alert("Invalid login!");
  }
}

// ------------------------------
// LOGOUT
// ------------------------------
function adminLogout() {
  window.location.href = API.logout;
}

// ------------------------------
// DASHBOARD
// ------------------------------
async function fetchAppointments() {
  return fetch(API.appointments, { credentials: "include" }).then(r => r.json());
}
async function fetchFeedback() {
  return fetch(API.feedbacks, { credentials: "include" }).then(r => r.json());
}

async function renderDashboard() {
  appointmentsData = await fetchAppointments();
  const feedback = await fetchFeedback();

  document.getElementById("appointmentsCount").textContent = appointmentsData.length;
  document.getElementById("feedbackCount").textContent = feedback.length;
  document.getElementById("patientsCount").textContent = new Set(appointmentsData.map(a => a.email)).size;
  document.getElementById("revenueCount").textContent = "₹" + appointmentsData.reduce((s,a)=>s+(Number(a.fee)||0),0);

  renderAppointmentsTable();
  renderFeedbackTable(feedback);
}

// ------------------------------
// NAVIGATION
// ------------------------------
function showSection(id, el) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelectorAll(".sidebar a").forEach(a => a.classList.remove("active"));
  el.classList.add("active");

  document.querySelector(".header h1").textContent = id.charAt(0).toUpperCase() + id.slice(1);

  if (id === "submissions") loadSubmissions();
  if (id === "feedback") loadFeedbacks();
}

// ------------------------------
// APPOINTMENTS TABLE
// ------------------------------
function renderAppointmentsTable() {
  const aptTable = document.getElementById("appointmentsTable");
  const aptHeader = document.getElementById("appointmentsHeader");

  aptTable.innerHTML = "";
  aptHeader.innerHTML = "";

  if (!appointmentsData.length) {
    aptTable.innerHTML = `<tr><td colspan='7' class='empty-row'>No appointments</td></tr>`;
    return;
  }

  const keys = Object.keys(appointmentsData[0]);
  aptHeader.innerHTML = `<tr>${keys.map(k=>`<th>${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}<th>Status</th><th>Actions</th></tr>`;

  aptTable.innerHTML = appointmentsData.map(a => {
    return `<tr>
      ${keys.map(k => `<td>${a[k] ?? "-"}</td>`).join('')}
      <td><span class="status ${a.status==='done'?'done':'pending'}">${a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : 'Pending'}</span></td>
      <td><button class="action-btn" onclick="markDone('${a.id}')">Mark Done</button></td>
    </tr>`;
  }).join('');
}

async function markDone(id) {
  await fetch(`${API.appointments}/${id}`, {
    method: "PATCH",
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({status:'done'}),
    credentials: "include"
  });
  renderDashboard();
}

// ------------------------------
// FEEDBACK TABLE
// ------------------------------
function renderFeedbackTable(feedback) {
  const fbTable = document.getElementById("feedbackTable");
  const fbHeader = document.getElementById("feedbackHeader");

  fbTable.innerHTML = "";
  fbHeader.innerHTML = "";

  if (!feedback.length) {
    fbTable.innerHTML = `<tr><td colspan="5" class="empty-row">No feedback</td></tr>`;
    return;
  }

  const keys = Object.keys(feedback[0]);
  fbHeader.innerHTML = `<tr>${keys.map(k => `<th>${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}</tr>`;
  fbTable.innerHTML = feedback.map(f=>`<tr>${keys.map(k=>`<td>${f[k]??'-'}</td>`).join('')}</tr>`).join('');
}

// ------------------------------
// FILTER APPOINTMENTS
// ------------------------------
function applyFilters() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;

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
  await fetch(API.clearAppointments, {method:"DELETE", credentials:"include"});
  renderDashboard();
}
async function clearFeedbacks() {
  if(!confirm("Clear all feedback?")) return;
  await fetch(API.clearFeedbacks, {method:"DELETE", credentials:"include"});
  renderDashboard();
}
async function undoAppointments() {
  const res = await fetch(API.undoAppointments, {method:"POST", credentials:"include"}).then(r=>r.json());
  alert(res.message);
  renderDashboard();
}
async function undoFeedbacks() {
  const res = await fetch(API.undoFeedbacks, {method:"POST", credentials:"include"}).then(r=>r.json());
  alert(res.message);
  renderDashboard();
}

// ------------------------------
// LOGOUT
// ------------------------------
async function logout() {
  await fetch(API.logout, { credentials: "include" });
  window.location.href="/admin/admin-login.html";
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
    const submissions = await subsRes.json();
    const payments = await payRes.json();

    renderAdminTable("submissions", submissions);
    renderAdminTable("payments", payments);
  } catch(err) {
    console.error(err);
    document.getElementById("submissionsBody").innerHTML = `<tr><td colspan='5' class='empty-row'>Failed to load submissions</td></tr>`;
    document.getElementById("paymentsBody").innerHTML = `<tr><td colspan='5' class='empty-row'>Failed to load payments</td></tr>`;
  }
}

function renderAdminTable(type, data){
  const headerEl = document.getElementById(type+"Header");
  const bodyEl = document.getElementById(type+"Body");

  if(!data.length){
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
  renderDashboard();
});
