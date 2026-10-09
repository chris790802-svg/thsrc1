// 由 GitHub Actions 執行：用 Secrets 裡的金鑰向 TDX 取資料，輸出成 JSON（網頁只讀 JSON，不碰金鑰）
import fs from 'node:fs';
const OUT = process.argv[2] || 'data';
const ID = process.env.TDX_CLIENT_ID, SEC = process.env.TDX_CLIENT_SECRET;
if (!ID || !SEC) { console.error('缺少 TDX_CLIENT_ID / TDX_CLIENT_SECRET'); process.exit(1); }
const TDX = 'https://tdx.transportdata.tw';
const IDS = ['0990','1000','1010','1020','1030','1035','1040','1043','1047','1050','1060','1070'];
// 自由座 API 路徑是推測的；可在 repo 的 Variables 設定 FREE_SEAT_PATH（swagger 上 Request URL 的 /api/basic/ 之後）
const FREE_PATHS = [process.env.FREE_SEAT_PATH,
  '/api/basic/v2/Rail/THSR/FreeSeatingCar/Today?$format=JSON',
  '/api/basic/v2/Rail/THSR/DailyFreeSeatingCar/Today?$format=JSON',
  '/api/basic/v2/Rail/THSR/FreeSeatingCar?$format=JSON'].filter(Boolean);

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const write = (f, o) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${f}`, JSON.stringify(o)); };
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

async function token() {
  const r = await fetch(`${TDX}/auth/realms/TDXConnect/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ID, client_secret: SEC }) });
  const j = await r.json(); if (!j.access_token) throw new Error('取得 token 失敗'); return j.access_token;
}
const get = async (tok, path) => {
  const r = await fetch(TDX + path, { headers: { authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`); return r.json();
};

function parseCars(x) { // 排除「數量」欄位；優先陣列/物件 → 字串 → 單一數字
  const grab = (v, out) => {
    if (typeof v === 'number') { if (v >= 1 && v <= 12) out.add(v); }
    else if (typeof v === 'string') {
      v = v.replace(/(\d+)\s*[-~～至]\s*(\d+)/g, (m, a, b) => { for (let c = +a; c <= +b; c++) if (c >= 1 && c <= 12) out.add(c); return ' '; });
      v.split(/\D+/).forEach(n => { n = parseInt(n, 10); if (n >= 1 && n <= 12) out.add(n); });
    } else if (Array.isArray(v)) v.forEach(e => grab(e, out));
    else if (v && typeof v === 'object') Object.values(v).forEach(e => grab(e, out));
  };
  const skip = /count|total|qty|quantity|numberof|numof|sum|length/i, tiers = [new Set(), new Set(), new Set()];
  for (const [k, v] of Object.entries(x)) {
    if (!/car/i.test(k) || skip.test(k)) continue;
    grab(v, tiers[v && typeof v === 'object' ? 0 : typeof v === 'string' ? 1 : 2]);
  }
  const hit = tiers.find(t => t.size); return hit ? [...hit].sort((a, b) => a - b) : [];
}

const tok = await token();

// 1) 今日時刻表（必要：失敗就讓工作失敗，網站維持上一次的部署）
const tt = await get(tok, '/api/basic/v2/Rail/THSR/DailyTimetable/Today?$format=JSON');
const trains = tt.map(x => {
  const i = x.DailyTrainInfo || x.TrainInfo;
  return { no: i.TrainNo, dir: i.Direction,
    stops: x.StopTimes.filter(s => IDS.includes(s.StationID)).map(s => ({
      i: IDS.indexOf(s.StationID), name: s.StationName.Zh_tw,
      arr: toMin(s.ArrivalTime || s.DepartureTime), dep: toMin(s.DepartureTime || s.ArrivalTime) })) };
});
write('timetable.json', { date: today, trains });
console.log('時刻表', trains.length, '班');

// 2) 自由座車廂（失敗只略過）
try {
  let done = false;
  for (const p of FREE_PATHS) {
    try {
      const j = await get(tok, p), arr = Array.isArray(j) ? j : (j.FreeSeatingCars || j.Trains || []);
      console.log('自由座原始資料範例', p, JSON.stringify(arr[0]));
      const cars = {};
      for (const x of arr) {
        const no = x.TrainNo || x.DailyTrainInfo?.TrainNo || x.TrainInfo?.TrainNo, c = parseCars(x);
        if (no && c.length) cars[String(parseInt(no, 10))] = c;
      }
      if (Object.keys(cars).length) { write('free.json', { updated: new Date().toISOString(), cars }); console.log('自由座', Object.keys(cars).length, '班'); done = true; break; }
    } catch (e) { console.warn('自由座 API 失敗', p, e.message); }
  }
  if (!done) console.warn('沒有取得自由座資料，網頁會使用假設值');
} catch (e) { console.warn(e.message); }

// 3) 營運通阻（失敗只略過；網頁會顯示「營運狀態未確認」）
try {
  const j = await get(tok, '/api/basic/v2/Rail/THSR/AlertInfo?$format=JSON'), a = Array.isArray(j) ? j : (j.Alerts || []);
  const bad = a.filter(x => !(String(x.Status) === '1' || /正常/.test(x.Title || '')));
  write('alert.json', { updated: new Date().toISOString(),
    status: bad.length ? 'warn' : 'ok', text: bad.length ? '營運異動：' + (bad[0].Title || '請查看高鐵公告') : '全線正常營運' });
} catch (e) { console.warn('AlertInfo 失敗', e.message); }
