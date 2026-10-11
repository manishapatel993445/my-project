const WA_MSG = "?text=Hi%2C%20Aaroti%20Services";
function esc(s) { const d = document.createElement("div"); d.textContent = String(s||""); return d.innerHTML; }

// ========= FOOTER =========
const footer = document.getElementById("footerText");
if (footer) {
  footer.innerHTML = `&copy; ${new Date().getFullYear()} Aaroti Escorts | No.1 Call Girl &amp; Escort Service`;
}

// ========= FAQ ACCORDION =========
document.querySelectorAll(".faq-question").forEach(btn => {
  btn.addEventListener("click", () => {
    const item = btn.parentElement;
    item.classList.toggle("active");
    const icon = btn.querySelector(".faq-icon");
    icon.textContent = item.classList.contains("active") ? "−" : "+";
  });
});

// ========= MEDIA TAG (image or video) =========
function mediaTag(url, alt) {
  if (/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url)) {
    return `<video src="${url}" class="card-media" autoplay loop muted playsinline></video>`;
  }
  return `<img src="${url}" alt="${alt}" class="card-media">`;
}

// ========= FETCH + RENDER ALL DATA FROM API =========
async function loadSiteData() {
  try {
    const res  = await fetch("/api/data");
    const data = await res.json();

    renderProfiles(data.profiles || []);
    renderPriceTable(data.packages || []);
    applySettings(data.settings || {});
  } catch (e) {
    console.error("Failed to load site data:", e);
  }
}

// ========= RENDER PROFILES =========
function renderProfiles(profiles) {
  const grid = document.getElementById("profileGrid");
  if (!grid) return;

  const seen   = new Set();
  const unique = profiles.filter(p => {
    if (!p.photo || seen.has(p.photo)) return false;
    seen.add(p.photo);
    return true;
  });

  if (unique.length === 0) {
    grid.innerHTML = `<p style="text-align:center;color:#aaa;grid-column:1/-1;">No profiles available yet.</p>`;
    return;
  }

  grid.innerHTML = "";
  unique.forEach(p => {
    grid.innerHTML += `
    <div class="card">
      ${mediaTag(p.photo, esc(p.name))}
      <div class="card-info">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.age)} Years Old</p>
        <span>${esc(p.price)}</span>
      </div>
      <div class="card-hover">
        <a href="https://wa.me/919934873293${WA_MSG}" target="_blank" class="book-btn whatsapp">Book Now</a>
        <a href="tel:+919934873293" class="call-btn call">Call</a>
      </div>
    </div>`;
  });
}

// ========= RENDER PRICE TABLE =========
function renderPriceTable(packages) {
  const container = document.getElementById("priceTableContainer");
  if (!container) return;

  if (packages.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#aaa;">No packages available yet.</p>`;
    return;
  }

  let html = `<div class="table-wrap"><table class="price-table"><thead><tr>
    <th>Premium Category</th><th>2 Hours</th><th>6 Hours</th><th>Full Night</th>
  </tr></thead><tbody>`;

  packages.forEach(p => {
    html += `<tr>
      <td>${p.category}</td>
      <td>${p.h2}</td>
      <td>${p.h6}</td>
      <td>${p.night}</td>
    </tr>`;
  });

  html += `<tr>
    <td></td>
    <td><a href="https://wa.me/919934873293${WA_MSG}" target="_blank" class="table-book-btn bookNowBtn">Book Now</a></td>
    <td><a href="https://wa.me/919934873293${WA_MSG}" target="_blank" class="table-book-btn bookNowBtn">Book Now</a></td>
    <td><a href="https://wa.me/919934873293${WA_MSG}" target="_blank" class="table-book-btn bookNowBtn">Book Now</a></td>
  </tr></tbody></table></div>`;

  container.innerHTML = html;
}

// ========= APPLY SETTINGS (phone numbers) =========
function applySettings(settings) {
  const waHref   = `https://wa.me/${settings.mainWa || "919934873293"}${WA_MSG}`;
  const callHref = `tel:+${(settings.mainCall || "919934873293").replace(/[\s-]/g, "")}`;
  document.querySelectorAll(".whatsapp, .bookNowBtn").forEach(btn => { btn.href = waHref; });
  document.querySelectorAll(".call").forEach(btn => { btn.href = callHref; });
}

// ========= RUN =========
loadSiteData();
