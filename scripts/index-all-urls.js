const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const CITIES = [
  "agra","ahmedabad","ajmer","aligarh","amritsar","andheri","bhopal","bhubaneswar",
  "bangalore","chandigarh","chennai","coimbatore","daman","dehradun","delhi",
  "ghaziabad","goa","gurgaon","guwahati","hyderabad","indore","jaipur","jalandhar",
  "jodhpur","kanpur","kolkata","lucknow","ludhiana","manali","mohali","mumbai",
  "noida","panchkula","pune","raipur","rishikesh","surat","udaipur","zirakpur"
];

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
    scope: 'https://www.googleapis.com/auth/indexing',
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

async function publishUrl(accessToken, url) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      type: 'URL_UPDATED'
    })
  });
  return await res.json();
}

async function main() {
  console.log('🚀 Authenticating with Google Indexing API...');
  const token = await getAccessToken();
  console.log('✅ Authenticated successfully as Owner!\n');

  const allUrls = [
    'https://aaroti.com/',
    ...CITIES.map(c => `https://aaroti.com/call-girls-in-${c}`)
  ];

  console.log(`📤 Pushing ${allUrls.length} URLs to Google Priority Crawl Index:\n`);

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    try {
      const res = await publishUrl(token, url);
      if (res.urlNotificationMetadata) {
        console.log(`[${i + 1}/${allUrls.length}] ✅ Pushed: ${url}`);
        results.push({ url, status: 'SUCCESS', details: res.urlNotificationMetadata });
        successCount++;
      } else {
        console.log(`[${i + 1}/${allUrls.length}] ⚠️ Failed: ${url} -> ${JSON.stringify(res)}`);
        results.push({ url, status: 'FAILED', error: res });
        failCount++;
      }
    } catch (e) {
      console.log(`[${i + 1}/${allUrls.length}] ❌ Error: ${url} -> ${e.message}`);
      results.push({ url, status: 'ERROR', error: e.message });
      failCount++;
    }

    // Gentle pacing to avoid rate spikes
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n🎉 Indexing push complete!`);
  console.log(`   Total URLs: ${allUrls.length}`);
  console.log(`   Successfully Submitted: ${successCount}`);
  console.log(`   Failed: ${failCount}`);

  fs.writeFileSync(
    path.join(__dirname, '..', 'gsc-indexing-push-log.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
    'utf8'
  );
  console.log(`   Results logged to gsc-indexing-push-log.json\n`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
