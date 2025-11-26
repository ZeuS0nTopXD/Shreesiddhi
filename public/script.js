// -------------------- Navbar Highlight --------------------
document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelectorAll(".navbar a");
    const currentPath = window.location.pathname.split("/").pop();

    navLinks.forEach(link => {
        if (link.getAttribute("href").includes(currentPath)) {
            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
        }
    });
});

// -------------------- Smooth Scroll --------------------
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute("href"))
            .scrollIntoView({ behavior: "smooth" });
    });
});

// -------------------- Custom Alert Function --------------------
function customAlert(message) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.5)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";

    const box = document.createElement("div");
    box.style.background = "#fff";
    box.style.padding = "20px";
    box.style.borderRadius = "8px";
    box.style.textAlign = "center";
    box.style.maxWidth = "300px";
    box.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
    box.innerHTML = `
        <h3 style="margin-bottom:10px;color:#2d6a4f;">🌿 SHREE SIDDHI AYUR WELLNESS SAYS</h3>
        <p style="margin-bottom:15px;">${message}</p>
        <button id="closeAlert" style="padding:6px 12px;border:none;border-radius:5px;background:#e63946;color:#fff;cursor:pointer;">OK</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById("closeAlert").addEventListener("click", () => {
        document.body.removeChild(overlay);
    });
}

// -------------------- Form Validation + Backend Call --------------------
const formIds = ["appointmentForm", "feedbackForm"];

formIds.forEach(id => {
    const form = document.getElementById(id);
    if (!form) return;

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        const inputs = form.querySelectorAll("input, textarea");
        let valid = true;

        // Validate required fields
        inputs.forEach(input => {
            if (input.hasAttribute("required") && !input.value.trim()) {
                valid = false;
                input.style.borderColor = "red";
            } else {
                input.style.borderColor = "#ccc";
            }
        });

        if (!valid) {
            customAlert("⚠️ Please fill in all required fields.");
            return;
        }

        // Collect form data
        const formData = {};
        inputs.forEach(input => {
            formData[input.name] = input.value.trim();
        });

        // Determine API endpoint
        const apiEndpoint = id === "appointmentForm" ? "/api/appointment" : "/api/feedback";

        // Submit to backend
        fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                const msg = id === "appointmentForm" ?
                    "✅ Your appointment has been submitted successfully!" :
                    "✅ Your feedback has been submitted successfully!";
                customAlert(msg);
                form.reset();
            } else {
                customAlert("❌ Something went wrong. Please try again.");
            }
        })
        .catch(err => {
            console.error("Error:", err);
            customAlert("⚠️ Error submitting form. Please try later.");
        });
    });
});

// -------------------- Back to Top Button --------------------
const backToTop = document.createElement("button");
backToTop.innerText = "↑";
backToTop.id = "backToTop";
document.body.appendChild(backToTop);

backToTop.style.position = "fixed";
backToTop.style.bottom = "20px";
backToTop.style.right = "20px";
backToTop.style.padding = "10px 15px";
backToTop.style.fontSize = "20px";
backToTop.style.border = "none";
backToTop.style.borderRadius = "50%";
backToTop.style.background = "#e63946";
backToTop.style.color = "#fff";
backToTop.style.cursor = "pointer";
backToTop.style.display = "none";
backToTop.style.boxShadow = "0 3px 8px rgba(0,0,0,0.2)";

window.addEventListener("scroll", () => {
    backToTop.style.display = window.scrollY > 200 ? "block" : "none";
});

backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});
