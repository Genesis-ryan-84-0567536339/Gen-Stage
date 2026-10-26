/**
 * vad.ts — CẮT IM LẶNG đầu/cuối câu nói (C1, Issue #31).
 *
 * Boss giữ phím V, nghĩ một nhịp, rồi mới nói, và thường giữ thêm nửa giây sau
 * khi nói xong. Hai khoảng im đó là **tiền thật**: whisper đệm mel tới 30 s
 * nhưng vẫn giải mã cả vùng im, và mỗi 0,5 s im thêm vài trăm ms chờ trên CPU
 * của Boss — chưa kể im lặng là chỗ model hay "nghe" ra câu không có.
 *
 * Lớp này **không** phán đoán "có phải tiếng người không" (đó là việc của VAD
 * thần kinh trong engine, `vad_filter=True` ở `bridge/stt-worker.py`). Nó chỉ
 * trả lời một câu rất hẹp: *trong dải thời gian Boss giữ phím, đoạn nào đủ to?*
 *
 * File này cố tình **không phụ thuộc DOM**: `src/audio/mic.ts` bơm số RMS vào,
 * vitest bơm mảng số vào, cùng một logic.
 */

/** Cấu hình đo — mọi số đều đổi được, mặc định đo thật thấy ổn với mic Boss. */
export interface CauHinhVad {
  /**
   * Ngưỡng tương đối so với RMS đỉnh của cả lượt ghi. Dùng tương đối (không
   * phải một số tuyệt đối) vì mic rời, mic laptop và mic tai nghe chênh nhau
   * cả chục lần về mức vào.
   */
  nguongTheoDinh?: number;
  /** Sàn tuyệt đối: dưới mức này thì coi là im kể cả khi cả lượt đều rất nhỏ. */
  nguongSan?: number;
  /**
   * Chừa lại bấy nhiêu ms trước/sau đoạn nói, để không cắt mất phụ âm đầu.
   *
   * G3 (#62): **200 ms**, trước là 120. Giọng Boss thật nói nhanh và vào câu
   * ngay khi vừa bấm, nên mép lên của RMS tới **sau** phụ âm đầu — log thật
   * 28/10 có "dạ nơi qua ghế ngồi đi" (Boss nói *"Gen ơi, qua ghế ngồi đi"*:
   * mất hẳn chữ đầu). Đây đúng là "input buffering" của skill `input-systems`
   * đặt ở miền âm: nhớ lại một khoảng trước khi hệ thống *tưởng* là bắt đầu.
   *
   * 200 ms im thêm mỗi đầu **không** đổi trễ đáng kể: Whisper luôn chạy encoder
   * trên cửa sổ đệm 30 s (đo ở `docs/c1/so-sanh.md` mục 4).
   */
  chuaMs?: number;
  /** Đoạn to ngắn hơn thế này là tiếng cộc bàn / tiếng nhả phím, không phải nói. */
  toiThieuMs?: number;
}

const MAC_DINH: Required<CauHinhVad> = {
  nguongTheoDinh: 0.18,
  nguongSan: 0.004,
  chuaMs: 200,
  toiThieuMs: 150,
};

/** Dải thời gian có tiếng, tính từ lúc bắt đầu ghi. */
export interface DaiNoi {
  tuMs: number;
  denMs: number;
  /** Có thấy đoạn nào đủ to không. `false` = Boss giữ phím mà không nói gì. */
  coTieng: boolean;
  /** RMS đỉnh (bằng chứng: > 0 là mic có vào thật). */
  dinh: number;
}

/**
 * Tìm dải có tiếng từ chuỗi RMS đo mỗi `buocMs`.
 *
 * Quét **từ hai đầu vào giữa**: mẫu đầu tiên và mẫu cuối cùng vượt ngưỡng.
 * Không gom nhiều đoạn: Boss nói một câu một lượt, khoảng lặng giữa hai từ mà
 * cắt ra thì mất nghĩa.
 */
export function timDaiNoi(
  rms: readonly number[],
  buocMs: number,
  ch: CauHinhVad = {},
): DaiNoi {
  const c = { ...MAC_DINH, ...ch };
  const dinh = rms.reduce((m, x) => (x > m ? x : m), 0);
  const nguong = Math.max(dinh * c.nguongTheoDinh, c.nguongSan);

  let dau = rms.findIndex((x) => x >= nguong);
  let cuoi = -1;
  for (let i = rms.length - 1; i >= 0; i--)
    if (rms[i]! >= nguong) {
      cuoi = i;
      break;
    }

  const tongMs = rms.length * buocMs;
  if (dau < 0 || cuoi < dau || (cuoi - dau + 1) * buocMs < c.toiThieuMs)
    return { tuMs: 0, denMs: tongMs, coTieng: false, dinh };

  // nới ra `chuaMs` mỗi đầu rồi kẹp vào trong lượt ghi
  const chua = Math.round(c.chuaMs / buocMs);
  dau = Math.max(0, dau - chua);
  cuoi = Math.min(rms.length - 1, cuoi + chua);
  return { tuMs: dau * buocMs, denMs: (cuoi + 1) * buocMs, coTieng: true, dinh };
}

/**
 * Sổ đo RMS theo thời gian thật — `src/audio/mic.ts` gọi `them()` mỗi nhịp
 * `AnalyserNode`, nhả phím thì gọi `ket()`.
 */
export class SoDoAm {
  private rms: number[] = [];

  constructor(
    readonly buocMs: number,
    private readonly ch: CauHinhVad = {},
  ) {}

  them(x: number): void {
    this.rms.push(Number.isFinite(x) ? Math.max(0, x) : 0);
  }

  /** Số mẫu đã đo (bằng chứng mic có chạy). */
  get soMau(): number {
    return this.rms.length;
  }

  ket(): DaiNoi {
    return timDaiNoi(this.rms, this.buocMs, this.ch);
  }
}

/** RMS một khối mẫu PCM float (-1…1). Dùng chung cho mic và test. */
export function tinhRms(mau: Float32Array | readonly number[]): number {
  let tong = 0;
  for (let i = 0; i < mau.length; i++) tong += mau[i]! * mau[i]!;
  return mau.length ? Math.sqrt(tong / mau.length) : 0;
}
