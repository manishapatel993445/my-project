const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  const credPath = path.join(__dirname, '..', 'service-account.json');
  if (!fs.existsSync(credPath)) {
    throw new Error('service-account.json not found in project root.');
  }
  const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + claim);
  const sig = sign.sign(sa.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = header + '.' + claim + '.' + sig;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt)
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Failed to get token: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function inspectUrl(accessToken, url, siteUrl = 'https://aaroti.com/') {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ inspectionUrl: url, siteUrl })
  });
  return await res.json();
}

async function getSearchAnalytics(accessToken, siteUrl = 'https://aaroti.com/', days = 30) {
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const end = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [queriesRes, pagesRes] = await Promise.all([
    fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 50 })
    }),
    fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 50 })
    })
  ]);

  const queries = await queriesRes.json();
  const pages = await pagesRes.json();
  return { queries: queries.rows || [], pages: pages.rows || [], startDate: start, endDate: end };
}

async function getSitemaps(accessToken, siteUrl = 'https://aaroti.com/') {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  const data = await res.json();
  return data.sitemap || [];
}

async function main() {
  console.log('🔄 Authenticating with Google Search Console API...');
  const token = await getAccessToken();
  console.log('✅ Connected successfully to Google Search Console!\n');

  console.log('📊 Fetching Search Performance (Past 30 Days)...');
  const analytics = await getSearchAnalytics(token);
  console.log(`   Found ${analytics.queries.length} search queries and ${analytics.pages.length} pages receiving impressions.\n`);

  console.log('🗺️ Fetching Sitemap Status...');
  const sitemaps = await getSitemaps(token);
  sitemaps.forEach(s => {
    console.log(`   Sitemap: ${s.path}`);
    console.log(`   Last Submitted: ${s.lastSubmitted} | Pending: ${s.isPending}`);
    if (s.contents) {
      s.contents.forEach(c => console.log(`   URLs Submitted: ${c.submitted} | Indexed: ${c.indexed}`));
    }
  });
  console.log('');

  const priorityUrls = [
    'https://aaroti.com/',
    'https://aaroti.com/call-girls-in-mumbai',
    'https://aaroti.com/call-girls-in-delhi',
    'https://aaroti.com/call-girls-in-bangalore',
    'https://aaroti.com/call-girls-in-pune',
    'https://aaroti.com/call-girls-in-hyderabad',
    'https://aaroti.com/call-girls-in-goa',
    'https://aaroti.com/call-girls-in-kolkata',
    'https://aaroti.com/call-girls-in-jaipur',
    'https://aaroti.com/call-girls-in-chandigarh'
  ];

  console.log('🔍 Inspecting Top 10 Priority City Pages in Google Index:');
  const inspectionResults = [];
  for (const url of priorityUrls) {
    try {
      const data = await inspectUrl(token, url);
      const res = data.inspectionResult ? data.inspectionResult.indexStatusResult : null;
      if (res) {
        console.log(`\n📍 ${url}`);
        console.log(`   Verdict: ${res.verdict}`);
        console.log(`   Coverage: ${res.coverageState}`);
        console.log(`   Last Crawled: ${res.lastCrawlTime || 'Not yet'}`);
        console.log(`   Page Fetch: ${res.pageFetchState}`);
        console.log(`   Robots: ${res.robotsTxtState}`);
        console.log(`   Crawled As: ${res.crawledAs || 'N/A'}`);
        inspectionResults.push({ url, status: 'OK', details: res });
      } else {
        console.log(`\n⚠️ ${url}: ${JSON.stringify(data.error || data)}`);
        inspectionResults.push({ url, status: 'WARNING', details: data });
      }
    } catch (e) {
      console.log(`\n❌ ${url}: ${e.message}`);
      inspectionResults.push({ url, status: 'ERROR', error: e.message });
    }
  }

  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    sitemaps,
    analytics,
    inspections: inspectionResults
  };
  fs.writeFileSync(path.join(__dirname, '..', 'gsc-live-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n📁 Full report saved to gsc-live-report.json');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
