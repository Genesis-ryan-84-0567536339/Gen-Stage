| Thước đo (Issue #79) | Lời hứa | Đo thật | Kết |
| --- | --- | --- | --- |
| số hoạt động trong bảng | ≥12 | **12** | ✅ |
| hoạt động chạy TRỌN (r.ok + activityDone + về idle) | 12/12 | **11/12** | ❌ |
| đế giày quét mesh (`minY`) | ≥ −0,01 m | **0.1225 m** | ✅ |
| rảnh 65 s → hoạt động tự sinh | ≥2, khác nhau | **2 lượt / 2 loại** | ✅ |
| Boss gõ giữa chừng → cắt | ≤300 ms | **13 ms** | ✅ |
| `r.ok` mọi lệnh | 100 % | **185/185** | ✅ |
| console | 0 lỗi | **0** | ✅ |

### Từng hoạt động

| hoạt động | bước | thời lượng | minY giữa / chốt / sau (m) | state tại mốc xong | kết | ảnh |
| --- | --- | --- | --- | --- | --- | --- |
| doc-sach-sofa | 10 | 20356 ms (ước 10900) | 0.3912 / 0.3091 / 0.3552 | idle | ✅ | `hd-01-doc-sach-sofa.png` |
| pha-ca-phe | 9 | 19176 ms (ước 10200) | 0.3564 / 0.3841 / 0.3717 | idle | ✅ | `hd-02-pha-ca-phe.png` |
| go-may-tinh | 5 | 10871 ms (ước 9400) | 0.1661 / 0.1225 / 0.179 | idle | ✅ | `hd-03-go-may-tinh.png` |
| vuon-vai | 3 | 6324 ms (ước 4114) | 0.3714 / 0.3693 / 0.3727 | idle | ✅ | `hd-04-vuon-vai.png` |
| ngam-cua-so | 5 | 15861 ms (ước 8200) | 0.3974 / 0.361 / 0.3678 | idle | ✅ | `hd-05-ngam-cua-so.png` |
| tuoi-cay | 8 | 10793 ms (ước 8500) | 0.392 / 0.3678 / 0.369 | idle | ✅ | `hd-06-tuoi-cay.png` |
| don-ban-an | 5 | 20128 ms (ước 8700) | 0.3834 / 0.3476 / 0.3704 | idle | ✅ | `hd-07-don-ban-an.png` |
| nhay-theo-nhac | 4 | 17963 ms (ước 9567) | 0.3666 / null / 0.3714 | null | ❌ | `hd-08-nhay-theo-nhac.png` |
| tap-the-duc | 4 | 7850 ms (ước 8800) | 0.3729 / 0.3669 / 0.3683 | idle | ✅ | `hd-09-tap-the-duc.png` |
| di-dao | 4 | 21416 ms (ước 10400) | 0.3637 / 0.3592 / 0.2153 | idle | ✅ | `hd-10-di-dao.png` |
| uong-nuoc-ghe-an | 9 | 17299 ms (ước 7733) | 0.382 / 0.2714 / 0.3698 | idle | ✅ | `hd-11-uong-nuoc-ghe-an.png` |
| ngu-gat-sofa | 6 | 20719 ms (ước 10600) | 0.3533 / 0.1606 / 0.2727 | idle | ✅ | `hd-12-ngu-gat-sofa.png` |

Tự sinh hoạt: nhay-theo-nhac → di-dao; lượt đầu ở +23919 ms sau khi Boss để yên.
Cổng web riêng 5393, `?bridge=0` + TTS/STT trỏ `/__tat-tieng` cùng origin — không đụng 5173/8787-8790 của Boss.
