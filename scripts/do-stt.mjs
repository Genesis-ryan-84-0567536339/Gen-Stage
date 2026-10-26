/**
 * do-stt.mjs — SINH BỘ THỬ + ĐO WER/ĐỘ TRỄ (C1 #31, mở rộng G3 #62).
 *
 * Không phải mã chạy trong sản phẩm: đây là bàn đo để chọn engine, giữ lại
 * trong repo để Boss (hoặc người sau) đo lại được bằng đúng một lệnh.
 *
 *   node scripts/do-stt.mjs mau                  # C1: 20 wav TTS SẠCH (Hoài My + Nam Minh)
 *   node scripts/do-stt.mjs ban                  # G3: 30 wav TTS LÀM BẨN như mic laptop
 *   node scripts/do-stt.mjs thu                  # G3: dựng bộ từ giọng THẬT (.cache/stt/mau)
 *   node scripts/do-stt.mjs chay <ten> [model]   # chạy một model ct2 trên bộ đang chọn
 *   node scripts/do-stt.mjs do <ten> "<lệnh {wav}>"   # chạy lệnh ngoài trên cả bộ
 *   node scripts/do-stt.mjs bang                 # in bảng WER/trễ đã đo
 *
 * Chọn bộ bằng `--bo <thư mục>` hoặc `GEN_STAGE_STT_BO` (mặc định bộ bẩn G3).
 *
 * ---
 *
 * **G3 (#62) — vì sao phải có bộ "bẩn".** Mọi số đo của C1 (WER 7,9 %) lấy trên
 * giọng TTS: sạch tuyệt đối, nói chậm, đúng dấu, không nhiễu. Boss nghe kết quả
 * thật rồi nói "nhận diện tào lao quá" — và đúng: giọng thật đi qua mic laptop
 * là một tín hiệu khác hẳn. Edge TTS chỉ có **hai** giọng vi-VN (kiểm thật
 * 26/10: `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`), nên bộ này lấy khác biệt
 * từ **tốc độ + cao độ + cách làm bẩn**, mô phỏng đúng bốn thứ mic laptop làm
 * méo tiếng (số liệu trong `docs/g3/ket-qua.md`):
 *
 *   1. nói nhanh        tốc độ TTS +20…+40 % (Boss nói nhanh hơn TTS mặc định)
 *   2. băng hẹp         lọc 300–3400 Hz — đúng dải mic thoại rẻ nghe được
 *   3. nhiễu nền        nhiễu hồng ~−30 dBFS: quạt máy, điều hoà, phòng mở
 *   4. phòng + AGC      reverb nhẹ (aecho) + nén động làm cắt đỉnh (clipping nhẹ)
 */
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const chay = promisify(execFile);

/** 10 câu lệnh tiếng Việt Boss hay nói (Issue #31). */
export const CAU = [
  'Gen ơi, dựng connector Baserow',
  'đi tới bàn điều khiển',
  'cất module lên kệ',
  'chào Gen',
  'mở màn hình chính',
  'Gen, vui lên',
  'kết tinh module tên Kho Ryan',
  'quay lại đây',
  'nói lại lần nữa',
  'dừng lại',
];

/**
 * G3 (#62) — 10 CÂU LỆNH NỮA cho đủ 20, lấy từ cách Boss nói thật (log #62)
 * chứ không phải cách tài liệu viết.
 */
export const CAU_THEM = [
  'Gen, đi tới kệ module',
  'Javis, ngồi ghế hai',
  'Gen, đứng lên đi',
  'mọi người lại đây',
  'Gen, nhìn Javis',
  'tắt màn hình phải',
  'Gen, cất module connector Baserow',
  'đổi góc máy',
  'Javis, đi ra cửa',
  'Gen, chăm chú vào',
];

/**
 * G3 (#62) — 10 CÂU ĐỜI THƯỜNG. Ba câu đầu là **nguyên văn ý Boss** trong log
 * giọng thật của Issue #62 (engine nghe thành "tôi kêu hai bạn qua hồi đi mà
 * dính dáng hồi đi" / "dạ nơi qua ghế ngồi đi" / "đi qua đây thôi").
 */
export const CAU_DOI_THUONG = [
  'tôi kêu hai bạn qua ghế ngồi đi',
  'Gen ơi, qua ghế ngồi đi',
  'đi qua đây thôi',
  'tôi kêu bạn đi kiếm chỗ ngồi',
  'bảo Javis đi tới cửa',
  'nhờ Gen qua bàn điều khiển',
  'hai bạn lại đây',
  'cả hai qua bục trung tâm',
  'Gen tới đây coi',
  'kêu Gen vui lên',
];

const GIONG = { nu: 'nu', nam: 'nam' };
/** Bộ TTS sạch của C1 (giữ nguyên đường cũ để `scripts/kiem-c1.mjs` còn chạy). */
const THU_MUC_SACH = '.cache/stt/mau';
/** Bộ TTS làm bẩn của G3. */
const THU_MUC_BAN = '.cache/stt/ban';
/** Bộ giọng THẬT của Boss: cặp `<ts>.ogg` + `<ts>.txt` do nút "✎ Sửa" ghi. */
const THU_MUC_THAT = '.cache/stt/mau';
/** Bộ đang chọn (mọi lệnh đo đọc `bo-thu.json` ở đây). */
const THU_MUC = (() => {
  const i = process.argv.indexOf('--bo');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.GEN_STAGE_STT_BO ?? THU_MUC_BAN;
})();
const THU_MUC_KQ = process.env.GEN_STAGE_STT_KETQUA ?? '.cache/stt/ketqua';

/* ----------------------------------------------------------------- sinh mẫu */

async function sinhMau() {
  const { tongHop } = await import('../bridge/tts.ts');
  await mkdir(THU_MUC_SACH, { recursive: true });
  const danh = [];
  for (const [ten, giong] of Object.entries(GIONG)) {
    for (let i = 0; i < CAU.length; i++) {
      const goc = join(THU_MUC_SACH, `${ten}-${String(i).padStart(2, '0')}.mp3`);
      const wav = goc.replace(/\.mp3$/, '.wav');
      const mp3 = await tongHop(CAU[i], { voice: giong });
      await writeFile(goc, mp3);
      // 16 kHz mono PCM — đúng dạng mọi engine whisper/vosk cần
      await chay('ffmpeg', ['-y', '-i', goc, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
      danh.push({ wav, text: CAU[i], giong: ten });
      process.stdout.write('.');
    }
  }
  await writeFile(join(THU_MUC_SACH, 'bo-thu.json'), JSON.stringify(danh, null, 2));
  console.log(`\nĐã sinh ${danh.length} wav 16 kHz vào ${THU_MUC_SACH}/`);
}

/* ------------------------------------------- G3: bộ TTS LÀM BẨN như mic thật */

/**
 * Bốn "cấu hình bẩn" — mỗi câu lấy một cái, quay vòng.
 *
 * Vì sao nhiều cấu hình chứ không một: mic laptop của Boss không phải một
 * điều kiện cố định (quạt máy lúc chạy lúc không, Boss ngồi gần/xa, phòng
 * vang khác nhau). Một cấu hình duy nhất là đo lại đúng một hoàn cảnh — vẫn
 * là cái bẫy đã làm số đo C1 đẹp mà vô dụng.
 */
const BAN = [
  { ten: 'quat-nhe', nhieu: 0.03, am: 'aecho=0.8:0.4:28:0.18', nen: 4 },
  { ten: 'xa-mic', nhieu: 0.045, am: 'aecho=0.8:0.55:45:0.3', nen: 7 },
  { ten: 'phong-vang', nhieu: 0.025, am: 'aecho=0.85:0.5:70:0.35,aecho=0.8:0.3:120:0.2', nen: 5 },
  { ten: 'gan-mic-re', nhieu: 0.035, am: 'aecho=0.8:0.3:18:0.12', nen: 9 },
];

/** Tốc độ nói (+% so với TTS mặc định) và cao độ, quay vòng theo câu. */
const TOC_DO = [20, 25, 30, 35, 40];
const CAO_DO = [0, -4, 4, -8, 8];

/**
 * Chuỗi ffmpeg làm bẩn một mp3 TTS → wav 16 kHz mono.
 *
 * Thứ tự CÓ Ý NGHĨA và đúng thứ tự tín hiệu đi trong đời thật:
 *   lọc băng hẹp (mic nghe được 300–3400 Hz)
 *   → phòng vang (aecho)
 *   → AGC/nén động của trình duyệt kéo mọi thứ lên, cắt đỉnh nhẹ
 *   → trộn nhiễu nền của phòng
 *   → chặn đỉnh để không tràn số
 */
function chuoiLamBan(c) {
  return (
    `[0:a]highpass=f=300,lowpass=f=3400,${c.am},` +
    `acompressor=threshold=-18dB:ratio=${c.nen}:attack=5:release=90:makeup=2[v];` +
    `[v][1:a]amix=inputs=2:weights=1 ${c.nhieu}:duration=first:normalize=0,` +
    'alimiter=limit=0.97[ra]'
  );
}

async function sinhMauBan() {
  const { tongHop } = await import('../bridge/tts.ts');
  await mkdir(THU_MUC_BAN, { recursive: true });
  const cau = [
    ...[...CAU, ...CAU_THEM].map((text) => ({ text, loai: 'lenh' })),
    ...CAU_DOI_THUONG.map((text) => ({ text, loai: 'doi-thuong' })),
  ];
  const danh = [];
  for (let i = 0; i < cau.length; i++) {
    const giong = i % 2 === 0 ? GIONG.nu : GIONG.nam;
    const rate = TOC_DO[i % TOC_DO.length];
    const pitch = CAO_DO[i % CAO_DO.length];
    const ban = BAN[i % BAN.length];
    const ma = `${String(i).padStart(2, '0')}-${giong}-${ban.ten}`;
    const mp3 = join(THU_MUC_BAN, `${ma}.mp3`);
    const wav = join(THU_MUC_BAN, `${ma}.wav`);
    await writeFile(mp3, await tongHop(cau[i].text, { voice: giong, rate, pitch }));
    await chay('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', mp3,
      // nhiễu HỒNG, không trắng: phổ nhiễu phòng nghiêng về tần thấp y như vậy
      '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=1:r=16000:d=60',
      '-filter_complex', chuoiLamBan(ban),
      '-map', '[ra]', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav,
    ]);
    danh.push({
      wav,
      text: cau[i].text,
      loai: cau[i].loai,
      giong: giong === GIONG.nu ? 'nu' : 'nam',
      rate: `+${rate}%`,
      pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
      ban: ban.ten,
    });
    process.stdout.write('.');
  }
  await writeFile(join(THU_MUC_BAN, 'bo-thu.json'), JSON.stringify(danh, null, 2));
  console.log(
    `\nĐã sinh ${danh.length} wav BẨN 16 kHz vào ${THU_MUC_BAN}/ ` +
      `(${danh.filter((d) => d.loai === 'lenh').length} câu lệnh + ` +
      `${danh.filter((d) => d.loai === 'doi-thuong').length} câu đời thường)`,
  );
}

/* ------------------------------------- G3: bộ GIỌNG THẬT từ nút "✎ Sửa" */

/**
 * Dựng `bo-thu.json` từ các cặp `(audio, chữ đúng)` Boss đã sửa.
 *
 * Đây là bộ đo **đúng** — mọi bộ TTS trên kia chỉ là bộ tạm trong lúc chờ
 * Boss nói. Mỗi lần Boss bấm "✎ Sửa" trong ô chat là bộ này dài thêm một câu,
 * không ai phải ngồi thu mẫu riêng.
 */
async function sinhMauThat() {
  const ds = await readdir(THU_MUC_THAT).catch(() => []);
  const danh = [];
  for (const f of ds.filter((x) => x.endsWith('.txt')).sort()) {
    const ma = f.replace(/\.txt$/, '');
    const am = ds.find((x) => x.startsWith(`${ma}.`) && !/\.(txt|json)$/.test(x));
    if (!am) continue;
    const text = (await readFile(join(THU_MUC_THAT, f), 'utf8')).trim();
    if (!text) continue;
    // Về 16 kHz mono wav: engine chỉ nhận dạng đó, và audio thô là opus/webm.
    const wav = join(THU_MUC_THAT, `${ma}.16k.wav`);
    await chay('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', join(THU_MUC_THAT, am),
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav,
    ]);
    danh.push({ wav, text, loai: 'that', giong: 'boss' });
  }
  if (!danh.length) {
    console.log(
      `Chưa có mẫu giọng thật nào trong ${THU_MUC_THAT}/.\n` +
        'Cách thu: bật sân khấu, giữ phím V nói một câu, chữ hiện ra ở ô chat →\n' +
        'bấm "✎ Sửa" → gõ lại chữ ĐÚNG → bấm "✓ Lưu mẫu". Mỗi câu một lượt.',
    );
    return;
  }
  await writeFile(join(THU_MUC_THAT, 'bo-thu.json'), JSON.stringify(danh, null, 2));
  console.log(`Bộ giọng THẬT: ${danh.length} câu trong ${THU_MUC_THAT}/bo-thu.json`);
}

/* ------------------------------------------------------------------ đo WER */

/** Chuẩn hoá để so: bỏ dấu câu, về chữ thường, gộp khoảng trắng. Giữ dấu tiếng Việt. */
export function chuanHoa(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:…"'“”‘’()\[\]{}\/\\–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Khoảng cách sửa theo TỪ (Levenshtein) → WER = sửa / số từ chuẩn. */
export function werMotCau(chuan, nhan) {
  const a = chuanHoa(chuan).split(' ').filter(Boolean);
  const b = chuanHoa(nhan).split(' ').filter(Boolean);
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] =
        a[i - 1] === b[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
  return { sua: d[a.length][b.length], tu: a.length };
}

async function doEngine(ten, mauLenh) {
  const danh = JSON.parse(await readFile(join(THU_MUC, 'bo-thu.json'), 'utf8'));
  let tongSua = 0;
  let tongTu = 0;
  const treTungCau = [];
  const chiTiet = [];
  for (const m of danh) {
    const lenh = mauLenh.replace(/\{wav\}/g, m.wav);
    const t0 = Date.now();
    let ra = '';
    try {
      const { stdout } = await chay('bash', ['-lc', lenh], { maxBuffer: 1 << 26 });
      ra = stdout;
    } catch (e) {
      ra = `__LỖI__ ${e.message}`;
    }
    const tre = Date.now() - t0;
    const { sua, tu } = werMotCau(m.text, ra);
    tongSua += sua;
    tongTu += tu;
    treTungCau.push(tre);
    chiTiet.push({ ...m, nhan: chuanHoa(ra), sua, tu, treMs: tre });
    process.stdout.write(sua === 0 ? '✓' : '✗');
  }
  treTungCau.sort((x, y) => x - y);
  const kq = {
    engine: ten,
    lenh: mauLenh,
    wer: tongSua / tongTu,
    treTrungBinhMs: Math.round(treTungCau.reduce((s, x) => s + x, 0) / treTungCau.length),
    treP95Ms: treTungCau[Math.floor(treTungCau.length * 0.95)] ?? treTungCau.at(-1),
    soCau: danh.length,
    chiTiet,
  };
  await mkdir(THU_MUC_KQ, { recursive: true });
  await writeFile(join(THU_MUC_KQ, `${ten}.json`), JSON.stringify(kq, null, 2));
  console.log(
    `\n${ten}: WER ${(kq.wer * 100).toFixed(1)}% · trễ TB ${kq.treTrungBinhMs} ms · p95 ${kq.treP95Ms} ms`,
  );
  return kq;
}

/* ------------------------------------------------------------------- bảng */

async function bang() {
  const ds = await readdir(THU_MUC_KQ).catch(() => []);
  const hang = [];
  for (const f of ds.filter((x) => x.endsWith('.json'))) {
    const k = JSON.parse(await readFile(join(THU_MUC_KQ, f), 'utf8'));
    hang.push(k);
  }
  hang.sort((a, b) => a.wer - b.wer);
  /** WER riêng cho một loại câu (lệnh / đời thường) — đọc từ `chiTiet`. */
  const werLoai = (h, loai) => {
    const c = (h.chiTiet ?? []).filter((x) => x.loai === loai);
    if (!c.length) return null;
    const sua = c.reduce((s, x) => s + x.sua, 0);
    const tu = c.reduce((s, x) => s + x.tu, 0);
    return tu ? sua / tu : null;
  };
  const pc = (x) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
  console.log('| Engine | WER cả bộ | WER câu lệnh | WER đời thường | Trễ TB | Trễ trung vị | p95 | loadavg |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const h of hang) {
    const t = (h.chiTiet ?? []).map((x) => x.treMs).sort((a, b) => a - b);
    const tv = t.length ? t[Math.floor(t.length / 2)] : 0;
    console.log(
      `| ${h.engine} | ${pc(h.wer)} | ${pc(werLoai(h, 'lenh'))} | ${pc(werLoai(h, 'doi-thuong'))} | ` +
        `${(h.treTrungBinhMs / 1000).toFixed(2)} s | ${(tv / 1000).toFixed(2)} s | ` +
        `${(h.treP95Ms / 1000).toFixed(2)} s | ${(h.loadavg ?? '').split(' ').slice(0, 1).join('')} |`,
    );
  }
}

/* ------------------------------- G3: chạy MỘT model ct2 trên cả bộ, một lần nạp */

/**
 * Chạy `bridge/stt-worker.py` — **đúng thợ của bridge thật** — trên cả bộ.
 *
 * Vì sao không gọi `faster-whisper` kiểu mỗi câu một tiến trình: nạp model mất
 * 3–6 s (medium/large còn hơn), nên đo kiểu đó là đo **thời gian nạp model**
 * chứ không phải trễ Boss cảm nhận. Bridge nạp một lần rồi đứng chờ, nên bàn
 * đo phải y thế. Thợ cũng tự hâm máy 4 lượt trước khi báo "sẵn sàng", đúng
 * như lúc `pnpm bridge` bật.
 *
 * Thợ trả mỗi câu một dòng JSON; ở đây đổi sang TSV `"<ms>\t<chữ>"` rồi đưa
 * `chamTsv()` chấm — dùng lại đúng hàm WER của C1, không viết lại cách tính.
 */
async function chayModel(ten, model, { sua = true, luong, tinh, beam } = {}) {
  const danh = JSON.parse(await readFile(join(THU_MUC, 'bo-thu.json'), 'utf8'));
  const python = process.env.GEN_STAGE_STT_PYTHON ?? '.cache/stt/venv/bin/python';
  if (!existsSync(python)) throw new Error(`thiếu ${python} — chạy: bash scripts/fetch-stt.sh`);
  if (model && !existsSync(model)) throw new Error(`thiếu model ${model}`);

  const con = spawn(python, ['bridge/stt-worker.py'], {
    env: {
      ...process.env,
      ...(model ? { GEN_STAGE_STT_MODEL: model } : {}),
      // 8 luồng: máy Boss 8 luồng và bridge chỉ chạy MỘT câu một lúc, nên cho
      // engine dùng hết. Mặc định của thợ là `lõi / 2` = 4 — đúng cho lúc Boss
      // vừa nói vừa chạy sân khấu, nhưng ở bàn đo thì đo cả mức nhanh nhất.
      GEN_STAGE_STT_THREADS: String(luong ?? 8),
      ...(tinh ? { GEN_STAGE_STT_COMPUTE: tinh } : {}),
      ...(beam ? { GEN_STAGE_STT_BEAM: String(beam) } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  con.stderr.setEncoding('utf8');
  con.stderr.on('data', (d) => {
    const g = String(d).trim();
    if (g) process.stderr.write(`   [tho] ${g.split('\n').at(-1).slice(0, 160)}\n`);
  });

  const dong = [];
  let dem = '';
  let san = null;
  let cho = null;
  con.stdout.setEncoding('utf8');
  con.stdout.on('data', (d) => {
    dem += d;
    let i;
    while ((i = dem.indexOf('\n')) >= 0) {
      const l = dem.slice(0, i).trim();
      dem = dem.slice(i + 1);
      if (!l) continue;
      let g;
      try {
        g = JSON.parse(l);
      } catch {
        continue;
      }
      if (g.san === true) {
        san?.(g);
        san = null;
        continue;
      }
      cho?.(g);
      cho = null;
    }
  });

  const thongTin = await new Promise((xong, loi) => {
    san = xong;
    const h = setTimeout(() => loi(new Error('thợ không sẵn sàng trong 600 s')), 600_000);
    con.on('exit', (m) => loi(new Error(`thợ tắt mã ${m}`)));
    void h;
  });
  console.log(`   thợ sẵn sàng · ${thongTin.model} · ${thongTin.luong} luồng · ${thongTin.tinh}`);

  for (const m of danh) {
    const g = await new Promise((xong) => {
      cho = xong;
      con.stdin.write(`${m.wav}\n`);
    });
    dong.push(`${g.durationMs ?? 0}\t${g.text ?? ''}`);
    process.stdout.write(g.error ? '!' : '.');
  }
  con.kill();
  console.log('');
  return await chamTsv(ten, dong.join('\n'), sua);
}

const [viec, ...tham] = process.argv.slice(2);
const co = (t) => process.argv.includes(t);
if (viec === 'mau') await sinhMau();
else if (viec === 'ban') await sinhMauBan();
else if (viec === 'thu') await sinhMauThat();
else if (viec === 'chay')
  await chayModel(tham[0], tham[1] && !tham[1].startsWith('--') ? tham[1] : undefined, {
    sua: !co('--tho'),
  });
else if (viec === 'do') await doEngine(tham[0], tham[1]);
else if (viec === 'bang') await bang();
else if (viec === 'cham') await chamTsv(tham[0], await readFile(tham[1], 'utf8'), tham[2] === 'sua');
else
  console.log(
    'Dùng: node scripts/do-stt.mjs mau | ban | thu | chay <ten> [model] | ' +
      'do <ten> "<lệnh {wav}>" | cham <ten> <tsv> | bang   [--bo <thư mục>]',
  );

/* ------------------------------------------- chấm điểm từ TSV "<ms>\t<chữ>" */
// Dùng cho engine nạp model MỘT LẦN rồi chạy cả bộ (đúng cảnh bridge chạy
// thật): engine tự in mỗi dòng một câu theo đúng thứ tự `bo-thu.json`.
export async function chamTsv(ten, tsv, sua = false) {
  const { chuanHoaCauNoi } = sua ? await import('../bridge/so-tu.ts') : { chuanHoaCauNoi: null };
  const danh = JSON.parse(await readFile(join(THU_MUC, 'bo-thu.json'), 'utf8'));
  const dong = tsv.trim().split('\n');
  let tongSua = 0;
  let tongTu = 0;
  const tre = [];
  const chiTiet = [];
  for (let i = 0; i < danh.length; i++) {
    const [ms, ...rest] = (dong[i] ?? '').split('\t');
    let nhan = rest.join('\t');
    if (chuanHoaCauNoi) nhan = chuanHoaCauNoi(nhan).text;
    const { sua, tu } = werMotCau(danh[i].text, nhan);
    tongSua += sua;
    tongTu += tu;
    tre.push(Number(ms.replace(/ms$/, '')) || 0);
    chiTiet.push({ ...danh[i], nhan: chuanHoa(nhan), sua, tu, treMs: tre[i] });
  }
  const sx = [...tre].sort((a, b) => a - b);
  const kq = {
    engine: ten,
    /*
     * G3 — ghi `loadavg` kèm MỌI lượt đo.
     *
     * Bài học C1 (`docs/c1/so-sanh.md` mục 4): cùng một bản code, cùng một bộ
     * thử, trễ trung vị đi từ 3,2 s lên 7,7 s chỉ vì máy đang có builder khác
     * chạy. WER thì không đổi. Không ghi tải máy là đọc bảng trễ sai.
     */
    loadavg: (await readFile('/proc/loadavg', 'utf8').catch(() => '')).trim(),
    bo: THU_MUC,
    wer: tongSua / tongTu,
    treTrungBinhMs: Math.round(tre.reduce((s, x) => s + x, 0) / tre.length),
    treP95Ms: sx[Math.floor(sx.length * 0.95)] ?? sx.at(-1),
    soCau: danh.length,
    cauSai: chiTiet.filter((c) => c.sua > 0).map((c) => `${c.text} → ${c.nhan}`),
    chiTiet,
  };
  await mkdir(THU_MUC_KQ, { recursive: true });
  await writeFile(join(THU_MUC_KQ, `${ten}.json`), JSON.stringify(kq, null, 2));
  console.log(
    `${ten}: WER ${(kq.wer * 100).toFixed(1)}% · trễ TB ${kq.treTrungBinhMs} ms · p95 ${kq.treP95Ms} ms`,
  );
  return kq;
}
