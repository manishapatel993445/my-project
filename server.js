require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");
const path         = require("path");
const fs           = require("fs");
const cors         = require("cors");

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";

/* ---------- file path for persistent data ---------- */
const DATA_FILE = path.join(__dirname, "data.json");

/* ---------- In-memory caches (invalidated on write) ---------- */
let _dataCache  = null;
let _cityTpl    = null;
let _sitemapXml = null;

function readData() {
  if (!_dataCache) {
    try { _dataCache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
    catch (e) { _dataCache = { profiles: [], packages: [], settings: {} }; }
  }
  return _dataCache;
}

function writeData(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
  _dataCache = obj;
}

/* ---------- City list (for sitemap + routing) ---------- */
const CITIES = [
  "agra","ahmedabad","ajmer","aligarh","amritsar","andheri","bhopal","bhubaneswar",
  "bangalore","chandigarh","chennai","coimbatore","daman","dehradun","delhi",
  "ghaziabad","goa","gurgaon","guwahati","hyderabad","indore","jaipur","jalandhar",
  "jodhpur","kanpur","kolkata","lucknow","ludhiana","manali","mohali","mumbai",
  "noida","panchkula","pune","raipur","rishikesh","surat","udaipur","zirakpur"
];

/* ---------- Build SEO-injected city HTML ---------- */
function buildCityHtml(citySlug) {
  const city       = citySlug.toLowerCase().trim();
  const cityPretty = city.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const data       = readData();
  const phone      = (data.settings && data.settings.mainCall) ? data.settings.mainCall : "919934873293";
  const canonical  = `https://aaroti.com/call-girls-in-${city.replace(/\s+/g, "-")}`;

  const title = `No.1 Call Girls in ${cityPretty} ❤️ ₹2999 | ${cityPretty} Call Girl Cash Payment - Aaroti`;
  const desc  = `No.1 Call Girls in ${cityPretty} at ₹2999. Book independent call girl in ${cityPretty} with no advance payment. Verified girls available 24×7. Call now on Aaroti!`;
  const keywords = [
    `${cityPretty} Call Girls`,
    `Call Girls in ${cityPretty}`,
    `${cityPretty} Call Girls Service`,
    `Call Girls Service in ${cityPretty}`,
    `${cityPretty} Call Girl`,
    `Call Girl in ${cityPretty}`,
    `Call Girl ${cityPretty}`,
    `${cityPretty} Escort Service`,
    `Escort Service in ${cityPretty}`,
    `Independent Call Girl ${cityPretty}`,
    `${cityPretty} Call Girls Cash Payment`,
    `Book Call Girl ${cityPretty}`,
    `${cityPretty} Call Girl WhatsApp Number`,
    `${cityPretty} Escorts near me`
  ].join(", ");

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Service",
    "name": `Call Girls in ${cityPretty}`,
    "description": desc,
    "provider": {
      "@type": "Organization",
      "name": "Aaroti",
      "url": "https://aaroti.com",
      "telephone": `+${phone}`
    },
    "areaServed": cityPretty,
    "serviceType": "Escort Service",
    "offers": {
      "@type": "Offer",
      "price": "2999",
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock"
    }
  });

  if (!_cityTpl) _cityTpl = fs.readFileSync(path.join(__dirname, "public", "city.html"), "utf8");
  let html = _cityTpl;

  html = html.replace(/<title[^>]*>.*?<\/title>/is, `<title>${title}</title>`);
  html = html.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${desc}">`);

  const headInject = [
    `<meta name="keywords" content="${keywords}">`,
    `<meta name="city" content="${cityPretty}">`,
    `<meta name="country" content="India">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:image" content="https://aaroti.com/images/i1.jpeg">`,
    `<meta property="og:site_name" content="Aaroti">`,
    `<meta property="og:locale" content="en_IN">`,
    `<script type="application/ld+json">${schema}<` + `/script>`,
    `<script>window.CITY="${city.replace(/"/g, '\\"')}";<` + `/script>`
  ].join("\n");

  html = html.replace("</head>", headInject + "\n</head>");
  return html;
}

/* ---------- middleware ---------- */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

/* ---------- Server-Side SEO for City Pages (backward-compat ?name= query) ---------- */
app.get("/city.html", (req, res) => {
  const cityName = req.query.name ? req.query.name : "city";
  try { res.send(buildCityHtml(cityName)); }
  catch (err) { res.status(500).send("Server Error"); }
});

/* Serve frontend from /public */
app.use(express.static(path.join(__dirname, "public")));

/* ---------- auth middleware ---------- */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.adminToken;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired" });
  }
}

/* ============================================================
   PUBLIC ROUTES
   ============================================================ */

/* Health check */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* All public data in one call */
app.get("/api/data", (req, res) => {
  res.json(readData());
});

/* Admin login */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;

  if (!validUser || !validPass) {
    return res.status(500).json({ error: "Server credentials not configured" });
  }

  if (username === validUser && password === validPass) {
    const token = jwt.sign({ role: "admin" }, SECRET, { expiresIn: "12h" });

    res.cookie("adminToken", token, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: 12 * 60 * 60 * 1000   // 12 hours
    });

    return res.json({ ok: true });
  }

  res.status(401).json({ error: "Invalid username or password" });
});

/* Admin logout */
app.post("/api/logout", (req, res) => {
  res.clearCookie("adminToken");
  res.json({ ok: true });
});

/* ============================================================
   PROTECTED ROUTES — require valid JWT cookie
   ============================================================ */

/* Check session */
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ ok: true, role: "admin" });
});

/* ---------- PROFILES ---------- */

/* Add profile */
app.put("/api/profiles", requireAuth, (req, res) => {
  const data   = readData();
  const profile = { ...req.body, id: Date.now() };
  data.profiles.push(profile);
  writeData(data);
  res.json({ ok: true, profile });
});

/* Edit profile */
app.put("/api/profiles/:id", requireAuth, (req, res) => {
  const data = readData();
  const id   = Number(req.params.id);
  const idx  = data.profiles.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.profiles[idx] = { ...data.profiles[idx], ...req.body, id };
  writeData(data);
  res.json({ ok: true, profile: data.profiles[idx] });
});

/* Delete profile */
app.delete("/api/profiles/:id", requireAuth, (req, res) => {
  const data = readData();
  const id   = Number(req.params.id);
  data.profiles = data.profiles.filter(p => p.id !== id);
  writeData(data);
  res.json({ ok: true });
});

/* ---------- PACKAGES ---------- */

/* Add package */
app.put("/api/packages", requireAuth, (req, res) => {
  const data = readData();
  const pkg  = { ...req.body, id: Date.now() };
  data.packages.push(pkg);
  writeData(data);
  res.json({ ok: true, pkg });
});

/* Delete package */
app.delete("/api/packages/:id", requireAuth, (req, res) => {
  const data = readData();
  const id   = Number(req.params.id);
  data.packages = data.packages.filter(p => p.id !== id);
  writeData(data);
  res.json({ ok: true });
});

/* ---------- SETTINGS ---------- */

app.put("/api/settings", requireAuth, (req, res) => {
  const data = readData();
  const s = { ...req.body };
  if (s.mainWa   && s.mainWa.replace(/\D/g,"").length === 10) s.mainWa   = "91" + s.mainWa.replace(/\D/g,"");
  if (s.mainCall && s.mainCall.replace(/\D/g,"").length === 10) s.mainCall = "91" + s.mainCall.replace(/\D/g,"");
  data.settings = { ...data.settings, ...s };
  writeData(data);
  res.json({ ok: true, settings: data.settings });
});

/* ---------- Specific route for /login ---------- */
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

/* ---------- Sitemap (built once, cached) ---------- */
app.get("/sitemap.xml", (req, res) => {
  if (!_sitemapXml) {
    const base    = "https://aaroti.com";
    const today   = new Date().toISOString().split("T")[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url><loc>${base}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    CITIES.forEach(c => { xml += `  <url><loc>${base}/call-girls-in-${c}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>\n`; });
    xml += `</urlset>`;
    _sitemapXml = xml;
  }
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(_sitemapXml);
});

/* ---------- Robots ---------- */
app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(`User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /admin-login.html
Disallow: /api/
Sitemap: https://aaroti.com/sitemap.xml
`);
});

/* ---------- Clean city URLs  e.g. /call-girls-in-bangalore ---------- */
app.get("/call-girls-in-:city", (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.send(buildCityHtml(req.params.city));
  } catch (err) { res.status(500).send("Server Error"); }
});

/* ---------- Catch-all: serve index.html for SPA-style routing ---------- */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`\n✅  Server running → http://localhost:${PORT}`);
  console.log(`   Admin panel  → http://localhost:${PORT}/admin.html\n`);
});
