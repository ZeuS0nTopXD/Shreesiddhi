// feedback.js
(function(){
  const form = document.getElementById('feedbackForm');

  function createAlert(message) {
    if (document.querySelector('.custom-alert-overlay')) return;
    const o = document.createElement('div');
    o.className = 'custom-alert-overlay';
    o.innerHTML = `<div class="custom-alert-box" role="dialog" aria-live="polite" style="max-width:320px;padding:18px;background:#fff;border-radius:8px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,0.15);">
      <h3 style="margin:0 0 8px">🌿 Shree Siddhi Ayur Wellness</h3>
      <p style="margin:0 0 12px">${message}</p>
      <button id="closeCustomAlert" style="padding:8px 14px;border:none;border-radius:6px;background:#e63946;color:#fff;cursor:pointer;">OK</button>
    </div>`;
    o.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:9999;";
    document.body.appendChild(o);
    document.getElementById('closeCustomAlert').addEventListener('click', ()=>o.remove());
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = new FormData(form);
    const payload = {
      name: b.get('name')?.trim() || '',
      email: b.get('email')?.trim() || '',
      phone: b.get('phone')?.trim() || '',
      feedback: b.get('feedback')?.trim() || '',
      rating: b.get('rating') || null
    };

    // Disable submit
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.status === 'success') {
        createAlert('✅ Your feedback has been submitted successfully!');
        form.reset();
      } else {
        createAlert('❌ Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error(err);
      createAlert('⚠️ Error submitting feedback. Please try later.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit';
    }
  });
})();
