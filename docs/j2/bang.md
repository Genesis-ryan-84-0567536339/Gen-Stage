| Thước đo (Issue #79) | Lời hứa | Đo thật | Kết |
| --- | --- | --- | --- |
| số hoạt động trong bảng | ≥12 | **12** | ✅ |
| hoạt động chạy TRỌN (r.ok + activityDone + về idle) | 12/12 | **12/12** | ✅ |
| đế giày quét mesh (`minY`) | ≥ −0,01 m | **0.0926 m** | ✅ |
| rảnh 65 s → hoạt động tự sinh | ≥2, khác nhau | **2 lượt / 2 loại** | ✅ |
| Boss gõ giữa chừng → cắt | ≤300 ms | **6 ms** | ✅ |
| `r.ok` mọi lệnh | 100 % | **182/182** | ✅ |
| console | 0 lỗi | **0** | ✅ |

### Từng hoạt động

| hoạt động | bước | thời lượng | minY giữa / chốt / sau (m) | state tại mốc xong | kết | ảnh |
| --- | --- | --- | --- | --- | --- | --- |
| doc-sach-sofa | 10 | 20309 ms (ước 10900) | 0.3664 / 0.0926 / 0.2334 | idle | ✅ | `hd-01-doc-sach-sofa.png` |
| pha-ca-phe | 9 | 18865 ms (ước 10200) | 0.3591 / 0.3775 / 0.3725 | idle | ✅ | `hd-02-pha-ca-phe.png` |
| go-may-tinh | 5 | 9866 ms (ước 9400) | 0.166 / 0.1883 / 0.3678 | idle | ✅ | `hd-03-go-may-tinh.png` |
| vuon-vai | 3 | 5873 ms (ước 4114) | 0.3669 / 0.3696 / 0.3726 | idle | ✅ | `hd-04-vuon-vai.png` |
| ngam-cua-so | 5 | 15935 ms (ước 8200) | 0.3992 / 0.3726 / 0.3661 | idle | ✅ | `hd-05-ngam-cua-so.png` |
| tuoi-cay | 8 | 10808 ms (ước 8500) | 0.3864 / 0.3677 / 0.3704 | idle | ✅ | `hd-06-tuoi-cay.png` |
| don-ban-an | 5 | 20165 ms (ước 8700) | 0.3861 / 0.3682 / 0.3695 | idle | ✅ | `hd-07-don-ban-an.png` |
| nhay-theo-nhac | 4 | 21647 ms (ước 9567) | 0.3621 / 0.3713 / 0.3679 | idle | ✅ | `hd-08-nhay-theo-nhac.png` |
| tap-the-duc | 4 | 7805 ms (ước 8800) | 0.3073 / 0.3649 / 0.3727 | idle | ✅ | `hd-09-tap-the-duc.png` |
| di-dao | 4 | 24050 ms (ước 10400) | 0.3516 / 0.3714 / 0.3705 | idle | ✅ | `hd-10-di-dao.png` |
| uong-nuoc-ghe-an | 9 | 17272 ms (ước 7733) | 0.3813 / 0.2329 / 0.3674 | idle | ✅ | `hd-11-uong-nuoc-ghe-an.png` |
| ngu-gat-sofa | 6 | 20424 ms (ước 10600) | 0.3984 / 0.1776 / 0.31 | idle | ✅ | `hd-12-ngu-gat-sofa.png` |

Tự sinh hoạt: nhay-theo-nhac → tap-the-duc; lượt đầu ở +18552 ms sau khi Boss để yên.
Cổng web riêng 5393, `?bridge=0` + TTS/STT trỏ `/__tat-tieng` cùng origin — không đụng 5173/8787-8790 của Boss.
