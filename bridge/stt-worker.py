"""
stt-worker.py — THỢ NHẬN DẠNG chạy mãi (C1, Issue #31).

    bridge/stt.ts ──(mỗi dòng: 1 đường wav 16 kHz)──► worker ──► 1 dòng JSON

Vì sao một tiến trình chạy mãi chứ không gọi `whisper` mỗi câu: nạp model
PhoWhisper-small int8 mất ~3–6 s trên CPU Haswell của Boss. Gọi mới mỗi câu là
Boss phải chờ đúng khoản đó thêm vào mỗi lần nói. Thợ này nạp một lần lúc
`pnpm bridge` bật, rồi mỗi câu chỉ còn thời gian suy luận thật.

Giao thức cố tình thô (một dòng vào, một dòng JSON ra) để `bridge/stt.ts`
không phải kéo thêm thư viện nào.

Biến môi trường:
  GEN_STAGE_STT_MODEL   thư mục model ct2 (mặc định PhoWhisper-small)
  GEN_STAGE_STT_THREADS  số luồng CPU (mặc định: số lõi thật)
  GEN_STAGE_STT_COMPUTE  int8 | int8_float32 | float32 (mặc định int8)
"""
import json
import math
import os
import sys
import time
import wave

import numpy as np
from faster_whisper import WhisperModel

MODEL = os.environ.get(
    "GEN_STAGE_STT_MODEL", ".cache/stt/models/PhoWhisper-small-ct2"
)
LUONG = int(os.environ.get("GEN_STAGE_STT_THREADS") or (os.cpu_count() or 4) // 2 or 1)
TINH = os.environ.get("GEN_STAGE_STT_COMPUTE", "int8")


def doc_wav(duong: str) -> np.ndarray:
    """16 kHz mono PCM 16-bit → float32 [-1, 1]. Bridge đã ffmpeg về đúng dạng."""
    with wave.open(duong, "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1:
            raise ValueError(
                f"cần 16 kHz mono, nhận {w.getframerate()} Hz {w.getnchannels()} kênh"
            )
        tho = w.readframes(w.getnframes())
    return np.frombuffer(tho, dtype=np.int16).astype(np.float32) / 32768.0


def nap_truoc_model() -> None:
    """
    Đọc hết `model.bin` một lượt để Linux giữ nó trong page cache.

    ct2 mmap trọng số và chỉ nạp trang khi dùng tới, nên mấy câu đầu vừa suy
    luận vừa đọc đĩa — đo thật: 10,9 s rồi 9,2 s rồi 8,6 s trước khi về 3,1 s.
    465 MB đọc tuần tự mất ~1 s, đổi lại Boss không phải chịu khoản đó.
    """
    import pathlib

    tep = pathlib.Path(MODEL) / "model.bin"
    try:
        with tep.open("rb") as f:
            while f.read(8 << 20):
                pass
    except OSError:
        pass


def main() -> None:
    nap_truoc_model()
    m = WhisperModel(MODEL, device="cpu", compute_type=TINH, cpu_threads=LUONG)

    # HÂM MÁY. Đo thật trên máy Boss: 6 câu ĐẦU mất 17–24 s rồi mới tụt về
    # 2,9–4,5 s. Không phải nạp model (`WhisperModel(...)` đã xong ở trên) mà là
    # mấy thứ lười: ct2 nạp trang model 465 MB từ đĩa theo nhu cầu, bể luồng
    # OpenMP, và model VAD Silero chỉ nạp ở lần `vad_filter=True` đầu tiên.
    # Boss không được chịu khoản đó, nên chạy sẵn vài lượt ĐỦ GIỐNG một câu
    # thật: 3 s tín hiệu có biên độ (im lặng tuyệt đối thì VAD cắt hết, decoder
    # không chạy, hâm không tới chỗ cần hâm).
    try:
        t = np.arange(16000 * 3, dtype=np.float32) / 16000.0
        gia = (0.05 * np.sin(2 * np.pi * 180 * t) * (1 + np.sin(2 * np.pi * 3 * t))).astype(
            np.float32
        )
        for _ in range(4):
            list(
                m.transcribe(
                    gia,
                    language="vi",
                    beam_size=1,
                    vad_filter=True,
                    without_timestamps=True,
                    condition_on_previous_text=False,
                )[0]
            )
    except Exception:  # hâm máy lỗi thì vẫn chạy được, chỉ chậm câu đầu
        pass

    # Dòng này là cờ "sẵn sàng" cho bridge/stt.ts chờ.
    print(json.dumps({"san": True, "model": MODEL, "luong": LUONG}), flush=True)

    for dong in sys.stdin:
        duong = dong.strip()
        if not duong:
            continue
        t0 = time.time()
        try:
            am = doc_wav(duong)
            segs, _info = m.transcribe(
                am,
                language="vi",
                beam_size=1,
                vad_filter=True,
                without_timestamps=True,
                condition_on_previous_text=False,
            )
            chu = []
            logp = []
            for s in segs:
                chu.append(s.text)
                logp.append(s.avg_logprob)
            # `avg_logprob` là log xác suất trung bình mỗi token → e^x cho ra
            # số 0…1 Boss đọc được. Không có đoạn nào = im lặng, tin cậy 0.
            tin = math.exp(sum(logp) / len(logp)) if logp else 0.0
            print(
                json.dumps(
                    {
                        "text": "".join(chu).strip(),
                        "confidence": round(min(1.0, max(0.0, tin)), 3),
                        "durationMs": round((time.time() - t0) * 1000),
                        "audioMs": round(len(am) / 16.0),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        except Exception as e:  # một câu hỏng không được giết cả thợ
            print(
                json.dumps(
                    {"error": f"{type(e).__name__}: {e}", "durationMs": round((time.time() - t0) * 1000)},
                    ensure_ascii=False,
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
