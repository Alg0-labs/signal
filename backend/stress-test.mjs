// Live stress test of every external API the SIGNAL backend depends on.
// Run: node stress-test.mjs
import 'dotenv/config';

const {
  ANTHROPIC_API_KEY, MORALIS_API_KEY, DUNE_SIM_API_KEY,
  CRYPTOPANIC_API_KEY, CMC_MCP_URL = 'http://localhost:6274',
} = process.env;

const SYMS = ['BTC', 'ETH', 'SOL', 'BNB'];
const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const results = [];

function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok === true ? '✅' : ok === 'warn' ? '⚠️ ' : '❌';
  console.log(`${tag} ${name.padEnd(34)} ${detail}`);
}

async function timed(fn) {
  const t = Date.now();
  const r = await fn();
  return { ...r, ms: Date.now() - t };
}

// 1. CoinGecko — 3 endpoints, all symbols (the suspected bottleneck)
async function testCoinGecko() {
  const ids = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin' };
  let ok = 0, rl = 0, fail = 0;
  for (const s of SYMS) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${ids[s]}/market_chart?vs_currency=usd&days=14&interval=daily`,
        { headers: { 'User-Agent': 'Oracle-Copilot/1.0', Accept: 'application/json' } });
      if (r.status === 429) rl++;
      else if (r.ok) ok++;
      else fail++;
    } catch { fail++; }
  }
  rec('CoinGecko market_chart (x4)', rl > 0 ? 'warn' : ok === 4, `ok=${ok} rateLimited=${rl} fail=${fail}`);
}

// 2. Binance — proposed replacement (klines + 24hr ticker)
async function testBinance() {
  let ok = 0, fail = 0; let sample = '';
  for (const s of SYMS) {
    try {
      const k = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}USDT&interval=1d&limit=14`);
      const t = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}USDT`);
      if (k.ok && t.ok) {
        ok++;
        if (!sample) { const kd = await k.json(); sample = `${s} candles=${kd.length} realHL=${kd[0][2] !== kd[0][1]}`; }
      } else fail++;
    } catch { fail++; }
  }
  rec('Binance klines+ticker (x4)', ok === 4, `ok=${ok} fail=${fail} ${sample}`);
}

// 3. Fear & Greed (alternative.me)
async function testFearGreed() {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=2', { headers: { 'User-Agent': 'Oracle-Copilot/1.0' } });
    const j = await r.json();
    const v = j?.data?.[0];
    rec('Fear & Greed (alternative.me)', r.ok && !!v, v ? `value=${v.value} (${v.value_classification})` : `status=${r.status}`);
  } catch (e) { rec('Fear & Greed (alternative.me)', false, e.message); }
}

// 4. CryptoPanic news
async function testCryptoPanic() {
  try {
    const r = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_KEY}&currencies=ETH&filter=hot&kind=news`,
      { headers: { 'User-Agent': 'Oracle-Copilot/1.0', Accept: 'application/json' } });
    const txt = await r.text();
    let n = 0; try { n = (JSON.parse(txt).results || []).length; } catch {}
    rec('CryptoPanic news', r.ok ? (n > 0 ? true : 'warn') : false, r.ok ? `posts=${n}` : `status=${r.status} ${txt.slice(0, 80)}`);
  } catch (e) { rec('CryptoPanic news', false, e.message); }
}

// 5. RSS feeds
async function testRss() {
  const feeds = {
    CoinTelegraph: 'https://cointelegraph.com/rss',
    CryptoNews: 'https://cryptonews.com/news/feed/',
    Decrypt: 'https://decrypt.co/feed',
  };
  for (const [name, url] of Object.entries(feeds)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Oracle-Copilot/1.0' }, signal: AbortSignal.timeout(8000) });
      const xml = await r.text();
      const items = (xml.match(/<item>/g) || []).length;
      rec(`RSS ${name}`, r.ok && items > 0 ? true : 'warn', `items=${items} status=${r.status}`);
    } catch (e) { rec(`RSS ${name}`, false, e.message); }
  }
}

// 6. Dune SIM balances
async function testDune() {
  try {
    const r = await fetch(`https://api.sim.dune.com/v1/evm/balances/${WALLET}`, { headers: { 'X-Sim-Api-Key': DUNE_SIM_API_KEY, accept: 'application/json' } });
    const txt = await r.text();
    let n = 0; try { n = (JSON.parse(txt).balances || []).length; } catch {}
    rec('Dune SIM balances', r.ok, r.ok ? `tokens=${n}` : `status=${r.status} ${txt.slice(0, 80)}`);
  } catch (e) { rec('Dune SIM balances', false, e.message); }
}

// 7. Moralis
async function testMoralis() {
  try {
    const r = await fetch(`https://deep-index.moralis.io/api/v2.2/${WALLET}/nft?chain=eth&limit=5`, { headers: { 'X-API-Key': MORALIS_API_KEY, accept: 'application/json' } });
    const txt = await r.text();
    rec('Moralis NFT/metadata', r.ok, r.ok ? 'auth OK' : `status=${r.status} ${txt.slice(0, 80)}`);
  } catch (e) { rec('Moralis NFT/metadata', false, e.message); }
}

// 8. Anthropic
async function testAnthropic() {
  for (const model of ['claude-sonnet-4-6', 'claude-opus-4-8']) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'say ok' }] }),
      });
      const j = await r.json();
      rec(`Anthropic ${model}`, r.ok, r.ok ? `reply="${j.content?.[0]?.text?.trim()}"` : `status=${r.status} ${j.error?.message || ''}`);
    } catch (e) { rec(`Anthropic ${model}`, false, e.message); }
  }
}

// 9. CMC MCP (local)
async function testCmcMcp() {
  try {
    const h = await fetch(`${CMC_MCP_URL}/health`, { signal: AbortSignal.timeout(4000) });
    let detail = `health=${h.status}`;
    if (h.ok) {
      const t = await fetch(`${CMC_MCP_URL}/api/v1/market/token/ETH`, { signal: AbortSignal.timeout(8000) });
      detail += ` token/ETH=${t.status}`;
      rec('CMC MCP (localhost:6274)', t.ok, detail);
    } else rec('CMC MCP (localhost:6274)', 'warn', detail + ' (optional, graceful fallback)');
  } catch (e) { rec('CMC MCP (localhost:6274)', 'warn', `${e.message} (optional)`); }
}

console.log('\n=== EXTERNAL API STRESS TEST ===\n');
await testCoinGecko();
await testBinance();
await testFearGreed();
await testCryptoPanic();
await testRss();
await testDune();
await testMoralis();
await testAnthropic();
await testCmcMcp();

const fails = results.filter(r => r.ok === false).length;
const warns = results.filter(r => r.ok === 'warn').length;
console.log(`\n=== SUMMARY: ${results.length - fails - warns} ok, ${warns} warn, ${fails} fail ===\n`);
