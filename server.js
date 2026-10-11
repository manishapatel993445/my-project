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
/* ---------- In-memory caches (invalidated on write) ---------- */
let _dataCache   = null;
let _cityTpl     = null;
let _indexTpl    = null;
let _sitemapXml  = null;
const _cityCache = new Map();

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
  _sitemapXml = null;
  _cityCache.clear();
}

/* ---------- City list (for sitemap + routing) ---------- */
const CITIES = [
  "agra","ahmedabad","ajmer","aligarh","amritsar","andheri","bhopal","bhubaneswar",
  "bangalore","chandigarh","chennai","coimbatore","daman","dehradun","delhi",
  "ghaziabad","goa","gurgaon","guwahati","hyderabad","indore","jaipur","jalandhar",
  "jodhpur","kanpur","kolkata","lucknow","ludhiana","manali","mohali","mumbai",
  "noida","panchkula","pune","raipur","rishikesh","surat","udaipur","zirakpur"
];

/* ---------- Localities Map (Locanto / Skokka Style Local SEO) ---------- */
const CITY_LOCALITIES = {
  agra: ["Taj Ganj", "Sanjay Place", "Dayal Bagh", "Kamla Nagar", "Sikandra", "Fatehabad Road", "Sadar Bazaar", "Khandari", "Shahganj"],
  ahmedabad: ["SG Highway", "Vastrapur", "Satellite", "Prahlad Nagar", "Bodakdev", "Navrangpura", "Bopal", "Maninagar", "Ashram Road", "Gota", "Thaltej"],
  ajmer: ["Panchsheel Nagar", "Vaishali Nagar", "Civil Lines", "Adarsh Nagar", "Pushkar Road", "Makhupura", "Kishangarh Road"],
  aligarh: ["Civil Lines", "Ramghat Road", "Marris Road", "Swarna Jayanti Nagar", "Centre Point", "GT Road", "Sasni Gate"],
  amritsar: ["Ranjit Avenue", "Mall Road", "Lawrence Road", "Majitha Road", "Model Town", "GT Road", "Circular Road", "Cantonment"],
  andheri: ["Andheri East", "Andheri West", "Lokhandwala", "MIDC", "Chakala", "Sakinaka", "Marol", "Versova", "DN Nagar", "JB Nagar", "Seven Bungalows"],
  bhopal: ["MP Nagar", "Arera Colony", "Kolar Road", "Shahpura", "Habibganj", "Hoshangabad Road", "TT Nagar", "Bairagarh", "Govindpura"],
  bhubaneswar: ["Saheed Nagar", "Patia", "Chandrasekharpur", "Jaydev Vihar", "Nayapalli", "Khandagiri", "Cuttack Road", "Infocity", "Rasulgarh"],
  bangalore: ["Koramangala", "Indiranagar", "Whitefield", "HSR Layout", "Electronic City", "Marathahalli", "BTM Layout", "Jayanagar", "MG Road", "Bellandur", "JP Nagar", "Hebbal", "Yelahanka", "Banashankari"],
  chandigarh: ["Sector 17", "Sector 22", "Sector 35", "Sector 43", "Sector 8", "Sector 9", "Industrial Area", "IT Park", "Sector 26", "Sector 7"],
  chennai: ["T Nagar", "Anna Nagar", "OMR", "Velachery", "Nungambakkam", "Guindy", "Adyar", "Mylapore", "ECR", "Porur", "Kilpauk", "Besant Nagar"],
  coimbatore: ["RS Puram", "Gandhipuram", "Peelamedu", "Saibaba Colony", "Saravanampatti", "Race Course", "Avinashi Road", "Singanallur"],
  daman: ["Nani Daman", "Moti Daman", "Devka Beach", "Jampore Beach", "Dunetha", "Vapi Border", "Kadaiya"],
  dehradun: ["Rajpur Road", "Jakhan", "Clement Town", "Ballupur", "Patel Nagar", "Sahastradhara Road", "Clock Tower", "Dalanwala", "Vasant Vihar"],
  delhi: ["Mahipalpur", "Aerocity", "Dwarka", "Karol Bagh", "Paharganj", "Connaught Place", "Saket", "Rohini", "Janakpuri", "Nehru Place", "Pitampura", "Laxmi Nagar", "Vasant Kunj", "Hauz Khas", "South Extension", "Paschim Vihar"],
  ghaziabad: ["Indirapuram", "Vaishali", "Kaushambi", "Raj Nagar Extension", "Crossings Republik", "Vasundhara", "Mohan Nagar", "Govindpuram"],
  goa: ["Calangute", "Baga", "Candolim", "Panaji", "Anjuna", "Colva", "Porvorim", "Arpora", "Morjim", "Vasco", "Margao", "Bambolim"],
  gurgaon: ["DLF Phase 1", "DLF Phase 2", "DLF Phase 3", "Cyber City", "Golf Course Road", "Sohna Road", "Sector 29", "Sector 56", "MG Road", "Huda City Centre", "Sector 14", "Golf Course Extension"],
  guwahati: ["GS Road", "Christian Basti", "Dispur", "Paltan Bazaar", "Ganeshguri", "Ulubari", "Beltola", "Zoo Road", "Six Mile", "Pan Bazaar"],
  hyderabad: ["Hitech City", "Gachibowli", "Madhapur", "Jubilee Hills", "Banjara Hills", "Kondapur", "Kukatpally", "Begumpet", "Secunderabad", "Manikonda", "Ameerpet", "Dilsukhnagar"],
  indore: ["Vijay Nagar", "Palasia", "Bhawarkua", "AB Road", "Rajwada", "Scheme 54", "Rau", "Bengali Square", "Geeta Bhawan", "Annapurna Road"],
  jaipur: ["Malviya Nagar", "Vaishali Nagar", "Mansarovar", "C-Scheme", "Raja Park", "Tonk Road", "MI Road", "Ajmer Road", "Jagatpura", "Bani Park", "Sodala"],
  jalandhar: ["Model Town", "Jalandhar Cantt", "Rama Mandi", "BMC Chowk", "Urban Estate", "Civil Lines", "GT Road", "Nakodar Road"],
  jodhpur: ["Sardarpura", "Ratanada", "Shastri Nagar", "Paota", "Chopasni Housing Board", "Circuit House Road", "Bhadwasiya"],
  kanpur: ["Civil Lines", "Swaroop Nagar", "Kakadeo", "Kidwai Nagar", "Gumti No 5", "Mall Road", "Arya Nagar", "Govind Nagar"],
  kolkata: ["Salt Lake", "Park Street", "New Town", "Ballygunge", "Rajarhat", "Howrah", "Gariahat", "Jadavpur", "Alipore", "Dum Dum", "EM Bypass", "Behala"],
  lucknow: ["Gomti Nagar", "Hazratganj", "Alambagh", "Indira Nagar", "Mahanagar", "Vibhuti Khand", "Charbagh", "Ashiyana", "Jankipuram", "Kapoorthala"],
  ludhiana: ["Sarabha Nagar", "Model Town", "Civil Lines", "Ferozepur Road", "Pakhowal Road", "South City", "BRS Nagar", "Dugri"],
  manali: ["Mall Road", "Old Manali", "Aleo", "Vashisht", "Solang Valley", "Hadimba Road", "Rangri", "Prini"],
  mohali: ["Phase 7", "Phase 3B2", "Phase 5", "Sector 70", "Sector 82", "Aerocity Mohali", "Kharar", "Sector 68", "Phase 9", "Phase 11"],
  mumbai: ["Andheri", "Bandra", "Juhu", "Colaba", "Borivali", "Dadar", "Thane", "Navi Mumbai", "Powai", "Goregaon", "Malad", "Worli", "Santacruz", "Ghatkopar", "Kandivali"],
  noida: ["Sector 18", "Sector 62", "Sector 137", "Sector 76", "Greater Noida", "Noida Extension", "Sector 50", "Sector 15", "Sector 128", "Sector 104"],
  panchkula: ["Sector 5", "Sector 20", "Sector 11", "Sector 14", "MDC Sector 4", "Sector 8", "Sector 21", "Pinjore"],
  pune: ["Viman Nagar", "Hinjewadi", "Baner", "Koregaon Park", "Wakad", "Kothrud", "Kalyani Nagar", "Hadapsar", "Magarpatta", "Aundh", "Shivajinagar", "Pimple Saudagar"],
  raipur: ["Shankar Nagar", "Telibandha", "Pandri", "Tatibandh", "VIP Road", "Civil Lines", "Devendra Nagar", "Pachpedi Naka"],
  rishikesh: ["Tapovan", "Laxman Jhula", "Ram Jhula", "Muni Ki Reti", "Bairaj Road", "Dhalwala", "Awas Vikas"],
  surat: ["Vesu", "Piplod", "Adajan", "Citylight", "Varachha", "Ghod Dod Road", "Ring Road", "Pal", "Katargam"],
  udaipur: ["Sukher", "Fatehsagar", "Panchwati", "Hiran Magri", "Saheli Nagar", "City Palace Road", "Goverdhan Vilas", "Bhubneshwar"],
  zirakpur: ["VIP Road", "Dhakoli", "Baltana", "High Ground", "Patiala Road", "Lohgarh", "Nagla Road"]
};

/* ---------- Competitor Categories (Locanto / Skokka Style) ---------- */
const COMPETITOR_CATEGORIES = [
  "Independent Call Girls",
  "College Girls Escorts",
  "Housewife & Bhabhi Escorts",
  "Russian Girls Escorts",
  "High Profile VIP Escorts",
  "Air Hostess Companions",
  "Celebrity Model Escorts",
  "Cash Payment on Delivery",
  "Incall & Outcall Service",
  "24x7 WhatsApp Booking"
];

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMediaTag(url, alt) {
  if (/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url)) {
    return `<video src="${escapeHtml(url)}" class="card-media" autoplay loop muted playsinline></video>`;
  }
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="card-media" loading="lazy">`;
}

function getCityFaqs(cityPretty) {
  return [
    {
      q: `How can I book verified call girls in ${cityPretty}?`,
      a: `You can easily book verified call girls in ${cityPretty} directly through our official WhatsApp or phone call. Browse our genuine profiles, select your preferred companion, and share your hotel room or doorstep location for instant confirmation within 30 minutes.`
    },
    {
      q: `Do I need to pay any advance payment for call girls in ${cityPretty}?`,
      a: `No! Aaroti Escorts strictly operates on a zero-advance policy. You only pay cash on delivery after meeting your verified companion in person in ${cityPretty}.`
    },
    {
      q: `Are the photos of call girls in ${cityPretty} 100% real and verified?`,
      a: `Yes, all model and call girl photos on Aaroti for ${cityPretty} are 100% real, verified, and recent. We guarantee that the companion you choose online is the exact one who visits you.`
    },
    {
      q: `Are incall and outcall services available across all areas in ${cityPretty}?`,
      a: `Yes, we provide 24×7 outcall services to all major hotels, resorts, and private residences across ${cityPretty}, as well as luxury incall setups in secure locations.`
    },
    {
      q: `What are the charges for call girl and escort service in ${cityPretty}?`,
      a: `Our genuine escort service packages in ${cityPretty} start from ₹2999 for short duration, with flexible options for 2 hours, 6 hours, and full night stays with complete privacy guaranteed.`
    }
  ];
}

/* ---------- Build Full SSR Pre-rendered City HTML ---------- */
function buildCityHtml(citySlug) {
  const city = citySlug.toLowerCase().trim();
  if (_cityCache.has(city)) {
    return _cityCache.get(city);
  }

  const cityPretty = city.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const data       = readData();
  const phone      = (data.settings && data.settings.mainCall) ? data.settings.mainCall : "919934873293";
  const wa         = (data.settings && data.settings.mainWa)   ? data.settings.mainWa   : "919934873293";
  const canonical  = `https://aaroti.com/call-girls-in-${city.replace(/\s+/g, "-")}`;
  const waMsg      = "?text=Hi%2C%20Aaroti%20Services";

  const title = `No.1 Call Girls in ${cityPretty} ❤️ ₹2999 | ${cityPretty} Call Girl Cash Payment - Aaroti`;
  const desc  = `No.1 Call Girls in ${cityPretty} at ₹2999. Book independent call girl in ${cityPretty} with no advance payment. Verified girls available 24×7. Call now on Aaroti!`;

  const localities = CITY_LOCALITIES[city] || [
    `${cityPretty} Civil Lines`,
    `${cityPretty} Airport Road`,
    `${cityPretty} Station Area`,
    `${cityPretty} Mall Road`,
    `${cityPretty} Central Market`,
    `${cityPretty} VIP Colony`
  ];

  const localityKeywords = localities.map(l => `${l} Call Girls, Escorts in ${l}`).join(", ");
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
    `${cityPretty} Escorts near me`,
    localityKeywords
  ].join(", ");

  const faqs = getCityFaqs(cityPretty);

  const schemaGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${canonical}#service`,
        "name": `Call Girls in ${cityPretty}`,
        "description": desc,
        "provider": {
          "@type": "Organization",
          "name": "Aaroti",
          "url": "https://aaroti.com",
          "telephone": `+${phone}`
        },
        "areaServed": {
          "@type": "City",
          "name": cityPretty
        },
        "serviceType": "Escort Service",
        "offers": {
          "@type": "Offer",
          "price": "2999",
          "priceCurrency": "INR",
          "availability": "https://schema.org/InStock"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://aaroti.com"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": `Call Girls in ${cityPretty}`,
            "item": canonical
          }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": faqs.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": f.a
          }
        }))
      },
      {
        "@type": "HowTo",
        "name": `How to Book Call Girls in ${cityPretty}`,
        "description": `Step-by-step guide to booking verified call girls in ${cityPretty} with zero advance payment and cash on delivery.`,
        "step": [
          {
            "@type": "HowToStep",
            "name": "Select Your Profile",
            "text": `Browse verified call girl profiles in ${cityPretty} and choose your favorite model.`
          },
          {
            "@type": "HowToStep",
            "name": "Contact on WhatsApp or Call",
            "text": `Message or call our 24x7 desk with the profile name and booking time.`
          },
          {
            "@type": "HowToStep",
            "name": "Doorstep or Hotel Arrival",
            "text": `Your verified companion reaches your hotel room or home in ${cityPretty} within 30-45 minutes.`
          },
          {
            "@type": "HowToStep",
            "name": "Verify and Pay Cash",
            "text": `Verify your companion in person and pay 100% cash upon meeting with zero advance payment.`
          }
        ]
      }
    ]
  };

  if (!_cityTpl) _cityTpl = fs.readFileSync(path.join(__dirname, "public", "city.html"), "utf8");
  let html = _cityTpl;

  // 1. Meta / Head replacements
  html = html.replace(/<title[^>]*>.*?<\/title>/is, `<title>${title}</title>`);
  html = html.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(desc)}">`);

  const headInject = [
    `<meta name="keywords" content="${escapeHtml(keywords)}">`,
    `<meta name="city" content="${escapeHtml(cityPretty)}">`,
    `<meta name="country" content="India">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(desc)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:image" content="https://aaroti.com/images/i1.jpeg">`,
    `<meta property="og:site_name" content="Aaroti">`,
    `<meta property="og:locale" content="en_IN">`,
    `<script type="application/ld+json">${JSON.stringify(schemaGraph)}</script>`,
    `<script>window.CITY="${city.replace(/"/g, '\\"')}";</script>`
  ].join("\n");

  html = html.replace("</head>", headInject + "\n</head>");

  // 2. Pre-render Hero & Trust Banner
  html = html.replace(/<h1 id="cityTitle">.*?<\/h1>/is, `<h1 id="cityTitle">${cityPretty} Escorts Service</h1>`);
  html = html.replace(/<p id="cityHeroSub">.*?<\/p>/is, `<p id="cityHeroSub">Independent Verified Call Girls in ${cityPretty} — 100% Genuine Profiles &amp; No Advance Payment.</p>`);
  html = html.replace(/<h2 id="profilesHeading">.*?<\/h2>/is, `<h2 id="profilesHeading">Verified Call Girls in ${cityPretty}</h2>`);

  const trustBannerHtml = `
    <div class="trust-badge-banner">
      <div class="trust-badge-item"><span class="icon">🛡️</span><span>100% Cash On Delivery<br><small style="color:#aaa;">Zero Advance Payment</small></span></div>
      <div class="trust-badge-item"><span class="icon">⚡</span><span>30-Min Fast Outcall<br><small style="color:#aaa;">Hotel &amp; Home Delivery in ${cityPretty}</small></span></div>
      <div class="trust-badge-item"><span class="icon">🔒</span><span>100% Private &amp; Safe<br><small style="color:#aaa;">Total Confidentiality</small></span></div>
      <div class="trust-badge-item"><span class="icon">📸</span><span>100% Real Photos<br><small style="color:#aaa;">Manually Verified Models</small></span></div>
    </div>
  `;
  html = html.replace(/<div id="trust-banner-container"[^>]*>[\s\S]*?<\/div>/i, `<div id="trust-banner-container" style="padding:10px 14px;">${trustBannerHtml}</div>`);

  // 3. Pre-render Profiles Grid
  const allProfiles = data.profiles || [];
  const cityMatches = allProfiles.filter(p => p.city && p.city.toLowerCase() === city);
  const profilesToRender = cityMatches.length > 0 ? cityMatches : allProfiles;

  let profilesHtml = "";
  if (profilesToRender.length === 0) {
    profilesHtml = `
    <div style="text-align:center;width:100%;padding:30px;grid-column:1/-1;">
      <h3 style="margin-bottom:10px;color:#d4af37;">Premium Call Girls in ${cityPretty}</h3>
      <p style="color:#aaa;margin-bottom:20px;">Contact us directly to book verified call girls in ${cityPretty}.</p>
      <a href="https://wa.me/${wa}${waMsg}" class="hero-btn whatsapp" target="_blank" id="noProfileWa">WhatsApp Us</a>
    </div>`;
  } else {
    profilesHtml = profilesToRender.map(p => `
    <div class="card">
      <span class="card-badge"><i class="fas fa-check-circle"></i> 100% Verified</span>
      ${renderMediaTag(p.photo, `Call Girl in ${cityPretty} - ${p.name}`)}
      <div class="card-info">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.age || "24")} Years Old</p>
        <span>${escapeHtml(p.price || "₹2999")}</span>
      </div>
      <div class="card-hover">
        <a href="https://wa.me/${wa}?text=Hi%2C%20I%20want%20to%20book%20${encodeURIComponent(p.name)}%20in%20${encodeURIComponent(cityPretty)}" target="_blank" class="book-btn whatsapp">Book Now</a>
        <a href="tel:+${phone}" class="call-btn call">Call</a>
      </div>
    </div>`).join("\n");
  }

  html = html.replace(
    /<div class="profile-grid" id="cityProfiles">[\s\S]*?<\/div>/i,
    `<div class="profile-grid" id="cityProfiles">\n${profilesHtml}\n</div>`
  );

  // 3b. Pre-render 4-Step Booking Guide & Transparent City Pricing
  const bookingStepsHtml = `
    <section class="booking-steps-section">
      <h2>How to Book Call Girls in ${cityPretty} in 4 Simple Steps</h2>
      <p class="sub">Guaranteed safe, discreet, and 100% advance-free booking process</p>
      <div class="steps-grid">
        <div class="step-card">
          <span class="step-num">1</span>
          <h3>Select Your Girl</h3>
          <p>Explore our verified profiles for ${cityPretty}. Pick from independent college girls, Russian models, or desi bhabhi.</p>
        </div>
        <div class="step-card">
          <span class="step-num">2</span>
          <h3>WhatsApp or Call</h3>
          <p>Connect with our 24×7 customer support on WhatsApp or call with your chosen profile and desired duration.</p>
        </div>
        <div class="step-card">
          <span class="step-num">3</span>
          <h3>30-Min Fast Outcall</h3>
          <p>Share your hotel name or residence address in ${cityPretty}. Your verified companion arrives within 30-45 minutes.</p>
        </div>
        <div class="step-card">
          <span class="step-num">4</span>
          <h3>Meet &amp; Pay Cash</h3>
          <p>Verify your companion in person first. Pay 100% cash on delivery after complete satisfaction. No advance payment required.</p>
        </div>
      </div>
    </section>
  `;
  html = html.replace(/<section id="booking-steps-container"[^>]*>[\s\S]*?<\/section>/i, `<section id="booking-steps-container">${bookingStepsHtml}</section>`);

  const cityPricingHtml = `
    <section class="price-table-section">
      <h2>Transparent Rates &amp; Packages in ${cityPretty}</h2>
      <p class="table-sub">100% Cash on Delivery — No Hidden Fees or Advance Registration Charges</p>
      <div class="table-wrap">
        <table class="price-table">
          <thead>
            <tr>
              <th>Companion Category</th>
              <th>2 Hours Shot</th>
              <th>6 Hours Evening</th>
              <th>Full Night (12 Hrs)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Independent College Girls</td>
              <td>₹2,999</td>
              <td>₹5,000</td>
              <td>₹9,999</td>
            </tr>
            <tr>
              <td>Desi Bhabhi &amp; Housewife</td>
              <td>₹2,999</td>
              <td>₹5,000</td>
              <td>₹8,999</td>
            </tr>
            <tr>
              <td>High Profile VIP Models</td>
              <td>₹4,999</td>
              <td>₹8,000</td>
              <td>₹14,999</td>
            </tr>
            <tr>
              <td>Russian &amp; Foreigner Escorts</td>
              <td>₹6,000</td>
              <td>₹12,000</td>
              <td>₹20,000</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
  html = html.replace(/<section id="city-pricing-container"[^>]*>[\s\S]*?<\/section>/i, `<section id="city-pricing-container">${cityPricingHtml}</section>`);

  // 4. Pre-render Original SEO Sections 1-7
  const sec1 = `
    <h2 style="color:#d4af37;margin-bottom:14px;font-size:28px;line-height:1.4;">Are you looking for Call Girl in ${cityPretty}?</h2>
    <p style="color:#ccc;line-height:1.8;margin-bottom:15px;font-size:16px;">
      We provide you independent call girl in ${cityPretty} with <strong style="color:#d4af37;">no advance payment</strong>, 100% verified girls available 24&times;7. Whether you need a companion for an evening or a full night, our premium escort service in ${cityPretty} is discreet, safe and professional. All girls are manually verified with real photos.
    </p>
    <h3 style="color:#d4af37;margin:20px 0 12px;font-size:22px;line-height:1.4;">Call Girls in ${cityPretty} Escort Service &#8377;2999 — Cash Payment on Delivery 24&times;7</h3>
    <p style="color:#ccc;line-height:1.8;margin-bottom:15px;font-size:16px;">
      Hello sweetheart, Welcome to ${cityPretty}! If you want to explore this beautiful city with the hottest Call Girls in ${cityPretty}, you are on the right platform. We provide unique and premium escort experiences. Our girls understand every man&apos;s desires and it is our duty to give our clients 100% intimate satisfaction. So that&apos;s why we bring you ${cityPretty}&apos;s most demanding No.1 Call Girl Service.
    </p>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      Our ${cityPretty} Escorts Agency hires only professional, well-mannered, and hygienic call girls. They are versatile, talented, high-class, educated girls. Every business-class person wants to choose a trusted ${cityPretty} Call Girl Agency to accomplish their wishes hassle-free. Call us now and book your dream girl.
    </p>
  `;
  html = html.replace(/<section id="seo-section-1"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-1" style="padding: 60px 20px; text-align: center; max-width: 900px; margin: auto;">${sec1}</section>`);

  const sec2 = `
    <h2 style="color:#d4af37;margin-bottom:20px;font-size:28px;line-height:1.4;">100% Real Hot Photos — Female Escorts in ${cityPretty}</h2>
    <p style="color:#ccc;line-height:1.8;margin-bottom:15px;font-size:16px;">
      Everyone wants to see real photos before booking escorts in ${cityPretty}. Many agencies provide fake images — but Aaroti ${cityPretty} Escorts are 100% genuine. We bring you the hottest real photos of verified Escorts in ${cityPretty}. No fake profiles, no hidden charges.
    </p>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      All our ${cityPretty} call girls are newly joined with real experience and astonishing figures. Our ${cityPretty} Escorts will give you pleasure you will never forget. Every photo is real and verified — choose your favourite quickly!
    </p>
  `;
  html = html.replace(/<section id="seo-section-2"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-2" style="padding: 60px 20px 20px; text-align: center; max-width: 900px; margin: auto;">${sec2}</section>`);

  const sec3 = `
    <h2 style="color:#d4af37;margin-bottom:20px;font-size:28px;line-height:1.4;">Best One Night Stand Service in ${cityPretty} — Book Now</h2>
    <p style="color:#ccc;line-height:1.8;margin-bottom:15px;font-size:16px;">
      Looking for a unique and intimate experience in ${cityPretty}? We bring you the most demanding One Night Stand Escort Service. Here you get all escort services at very affordable rates. Our talented, mature girls in ${cityPretty} know exactly how to give you mind-blowing pleasure.
    </p>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      Fulfill all your fantasies. ${cityPretty} Escorts Service Agency has one motto: genuine One Night Stand Service and maximum happiness for every client.
    </p>
  `;
  html = html.replace(/<section id="seo-section-3"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-3" style="padding: 60px 20px 20px; text-align: center; max-width: 900px; margin: auto;">${sec3}</section>`);

  const sec4 = `
    <h2 style="color:#d4af37;margin-bottom:20px;font-size:28px;line-height:1.4;">Up to 50% Discount on ${cityPretty} Escort Services</h2>
    <p style="color:#ccc;line-height:1.8;margin-bottom:15px;font-size:16px;">
      Your satisfaction is our priority. If you are looking for the perfect female companion in ${cityPretty}, hire our top-notch escort services. These amazing high-class services are now available at up to 50% discount. Choose the girl of your dreams and enjoy the most sensational ${cityPretty} escort service at an unbeatable price.
    </p>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      We have different offers and packages available. Book today and save big on ${cityPretty} premium escort services.
    </p>
  `;
  html = html.replace(/<section id="seo-section-4"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-4" style="padding: 40px 20px; text-align: center; max-width: 900px; margin: auto;">${sec4}</section>`);

  const sec5 = `
    <h2 style="color:#d4af37;margin-bottom:20px;font-size:28px;line-height:1.4;">${cityPretty} Call Girls बुक करके पूरी रात मजे करे</h2>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      क्या आप ${cityPretty} में अपनी कामुक इच्छा को पूरा करना चाहते हैं? तो अभी बुक करें ${cityPretty} Call Girls जो आपके लिए 24/7 उपलब्ध हैं। हमारे पास अलग-अलग लड़कियों का संग्रह है जो आपकी हर इच्छा पूरी करने में माहिर हैं।
    </p>
  `;
  html = html.replace(/<section id="seo-section-5"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-5" style="padding: 60px 20px 20px; text-align: center; max-width: 900px; margin: auto;">${sec5}</section>`);

  const sec6 = `
    <h2 style="color:#d4af37;margin-bottom:20px;font-size:28px;line-height:1.4;">Call Girls in ${cityPretty} को तलाश करने का सही उपाय</h2>
    <p style="color:#ccc;line-height:1.8;margin-bottom:15px;font-size:16px;">
      आपको अभी तक ${cityPretty} में असली Call Girl WhatsApp number नहीं मिला? हम आपको सही तरीका बताएंगे। Aaroti.com पर आपको 1500+ Real Numbers मिलेंगे। सभी numbers 100% verified हैं।
    </p>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      ${cityPretty} में हर रोज़ अलग-अलग लड़कियों से बात करें और दोस्ती करें। Sexy Call girls, Hot Call Girls, Desi bhabhi — सबके real WhatsApp Numbers हमारी website पर मिलेंगे।
    </p>
  `;
  html = html.replace(/<section id="seo-section-6"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-6" style="padding: 40px 20px 20px; text-align: center; max-width: 900px; margin: auto;">${sec6}</section>`);

  const sec7 = `
    <h2 style="color:#d4af37;margin-bottom:20px;font-size:28px;line-height:1.4;">Newly Married Sexy Bhabhi in ${cityPretty} — WhatsApp for Sensual Pleasure</h2>
    <p style="color:#ccc;line-height:1.8;font-size:16px;">
      Bhabhi Escorts Service is very popular in ${cityPretty}. These experienced and mature females understand a man&apos;s desires perfectly. Book our ${cityPretty} Escorts Service and accomplish your dreams. Bhabhi escorts know how to give 100% client satisfaction. Book today in ${cityPretty}!
    </p>
  `;
  html = html.replace(/<section id="seo-section-7"[^>]*>[\s\S]*?<\/section>/i, `<section id="seo-section-7" style="padding: 40px 20px 60px; text-align: center; max-width: 900px; margin: auto;">${sec7}</section>`);

  // 5. Pre-render Localities & Areas (Locanto / Skokka style)
  const localityPills = localities.map(l => `<span class="seo-tag-pill">${escapeHtml(l)} Call Girls</span>`).join("\n");
  const secLoc = `
    <h2>Top Locations &amp; Localities for Call Girls in ${cityPretty}</h2>
    <p>Book independent call girls across all prime locations and 5-star hotels in ${cityPretty} with fast 30-minute outcall doorstep delivery.</p>
    <div class="seo-tags-wrap">
      ${localityPills}
    </div>
  `;
  html = html.replace(/<section class="seo-tags-section" id="localities-section"[^>]*>[\s\S]*?<\/section>/i, `<section class="seo-tags-section" id="localities-section">${secLoc}</section>`);

  // 6. Pre-render Categories (Locanto / Skokka style)
  const catPills = COMPETITOR_CATEGORIES.map(c => `<span class="seo-tag-pill">${escapeHtml(c)} in ${escapeHtml(cityPretty)}</span>`).join("\n");
  const secCat = `
    <h2>Popular Escort Categories in ${cityPretty}</h2>
    <p>Choose from our wide selection of verified female companions in ${cityPretty} available 24&times;7 with zero advance payment.</p>
    <div class="seo-tags-wrap">
      ${catPills}
    </div>
  `;
  html = html.replace(/<section class="seo-tags-section" id="categories-section"[^>]*>[\s\S]*?<\/section>/i, `<section class="seo-tags-section" id="categories-section">${secCat}</section>`);

  // 7. Pre-render FAQ Accordion
  const faqsHtml = faqs.map(f => `
    <div class="faq-item">
      <button class="faq-question"><span>${escapeHtml(f.q)}</span><span class="faq-icon">+</span></button>
      <div class="faq-answer"><p>${escapeHtml(f.a)}</p></div>
    </div>
  `).join("\n");
  const secFaq = `
    <h2>Frequently Asked Questions About ${cityPretty} Escorts</h2>
    <div class="faq-list">
      ${faqsHtml}
    </div>
  `;
  html = html.replace(/<section class="faq-section" id="faq-section"[^>]*>[\s\S]*?<\/section>/i, `<section class="faq-section" id="faq-section">${secFaq}</section>`);

  // 8. Pre-render All Cities Grid (Internal Linking Power)
  const otherCitiesHtml = CITIES.map(c => {
    const cName = c.charAt(0).toUpperCase() + c.slice(1);
    return `<a href="/call-girls-in-${c}" class="city-btn">${cName}</a>`;
  }).join("\n");
  const secCities = `
    <h2>Explore Call Girls in Other Cities Across India</h2>
    <div class="city-grid">
      ${otherCitiesHtml}
    </div>
  `;
  html = html.replace(/<section class="cities" id="cities"[^>]*>[\s\S]*?<\/section>/i, `<section class="cities" id="cities">${secCities}</section>`);

  // 9. Pre-render Footer and Floating Buttons
  html = html.replace(/<p id="cityFooter">[\s\S]*?<\/p>/i, `<p id="cityFooter">&copy; ${new Date().getFullYear()} Aaroti Escorts — No.1 Call Girl &amp; Escort Service in ${cityPretty}. All rights reserved. 18+ Only.</p>`);
  html = html.replace(/href="https:\/\/wa\.me\/[0-9]+[^"]*"/g, `href="https://wa.me/${wa}${waMsg}"`);
  html = html.replace(/href="tel:\+[0-9]+"/g, `href="tel:+${phone}"`);

  _cityCache.set(city, html);
  return html;
}

/* ---------- Build Full SSR Pre-rendered Homepage HTML ---------- */
function buildIndexHtml() {
  if (!_indexTpl) _indexTpl = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  let html = _indexTpl;
  const data = readData();
  const phone = (data.settings && data.settings.mainCall) ? data.settings.mainCall : "919934873293";
  const wa    = (data.settings && data.settings.mainWa)   ? data.settings.mainWa   : "919934873293";
  const waMsg = "?text=Hi%2C%20Aaroti%20Services";

  const allProfiles = data.profiles || [];
  if (allProfiles.length > 0) {
    const seen = new Set();
    const unique = allProfiles.filter(p => {
      if (!p.photo || seen.has(p.photo)) return false;
      seen.add(p.photo);
      return true;
    });
    const profilesHtml = unique.map(p => `
      <div class="card">
        ${renderMediaTag(p.photo, p.name)}
        <div class="card-info">
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.age || "24")} Years Old</p>
          <span>${escapeHtml(p.price || "₹2999")}</span>
        </div>
        <div class="card-hover">
          <a href="https://wa.me/${wa}${waMsg}" target="_blank" class="book-btn whatsapp">Book Now</a>
          <a href="tel:+${phone}" class="call-btn call">Call</a>
        </div>
      </div>
    `).join("\n");
    html = html.replace(/<div id="profileGrid">[\s\S]*?<\/div>/i, `<div id="profileGrid">\n${profilesHtml}\n</div>`);
  }

  const packages = data.packages || [];
  if (packages.length > 0) {
    let pkgHtml = `<div class="table-wrap"><table class="price-table"><thead><tr>
      <th>Premium Category</th><th>2 Hours</th><th>6 Hours</th><th>Full Night</th>
    </tr></thead><tbody>`;
    packages.forEach(p => {
      pkgHtml += `<tr>
        <td>${escapeHtml(p.category)}</td>
        <td>${escapeHtml(p.h2)}</td>
        <td>${escapeHtml(p.h6)}</td>
        <td>${escapeHtml(p.night)}</td>
      </tr>`;
    });
    pkgHtml += `</tbody></table></div>`;
    html = html.replace(/<div id="priceTableContainer">[\s\S]*?<\/div>/i, `<div id="priceTableContainer">\n${pkgHtml}\n</div>`);
  }

  html = html.replace(/href="https:\/\/wa\.me\/[0-9]+[^"]*"/g, `href="https://wa.me/${wa}${waMsg}"`);
  html = html.replace(/href="tel:\+[0-9]+"/g, `href="tel:+${phone}"`);
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

/* ---------- Clean city URLs e.g. /call-girls-in-bangalore ---------- */
app.get("/call-girls-in-:city", (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.send(buildCityHtml(req.params.city));
  } catch (err) { res.status(500).send("Server Error"); }
});

/* ---------- Homepage SSR ---------- */
app.get("/", (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.send(buildIndexHtml());
  } catch (err) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
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
Disallow: /admin.html
Disallow: /admin-login.html
Disallow: /api/
Sitemap: https://aaroti.com/sitemap.xml
`);
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
