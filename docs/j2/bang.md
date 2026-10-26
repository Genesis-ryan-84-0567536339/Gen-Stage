| Thước đo (Issue #79) | Lời hứa | Đo thật | Kết |
| --- | --- | --- | --- |
| số hoạt động trong bảng | ≥12 | **12** | ✅ |
| hoạt động chạy TRỌN (r.ok + activityDone + về idle) | 12/12 | **9/12** | ❌ |
| đế giày quét mesh (`minY`) | ≥ −0,01 m | **0.166 m** | ✅ |
| rảnh 65 s → hoạt động tự sinh | ≥2, khác nhau | **2 lượt / 2 loại** | ✅ |
| Boss gõ giữa chừng → cắt | ≤300 ms | **null ms** | ❌ |
| `r.ok` mọi lệnh | 100 % | **192/192** | ✅ |
| console | 0 lỗi | **3** | ❌ |

### Từng hoạt động

| hoạt động | bước | thời lượng | minY giữa / sau (m) | state cuối | kết | ảnh |
| --- | --- | --- | --- | --- | --- | --- |
| doc-sach-sofa | 10 | 19795 ms (ước 10900) | 0.396 / 0.3725 | idle | ✅ | `hd-01-doc-sach-sofa.png` |
| pha-ca-phe | 9 | 18619 ms (ước 10200) | 0.3886 / 0.3703 | idle | ✅ | `hd-02-pha-ca-phe.png` |
| go-may-tinh | 5 | 9861 ms (ước 9400) | 0.166 / 0.1951 | idle | ✅ | `hd-03-go-may-tinh.png` |
| vuon-vai | 3 | 5947 ms (ước 4114) | 0.3662 / 0.3689 | idle | ✅ | `hd-04-vuon-vai.png` |
| ngam-cua-so | 5 | 15946 ms (ước 8200) | 0.3595 / 0.3685 | idle | ✅ | `hd-05-ngam-cua-so.png` |
| tuoi-cay | 8 | 11152 ms (ước 8500) | 0.3728 / 0.3664 | playing | ❌ | `hd-06-tuoi-cay.png` |
| don-ban-an | 5 | 18912 ms (ước 8700) | 0.3902 / 0.3664 | idle | ✅ | `hd-07-don-ban-an.png` |
| nhay-theo-nhac | 4 | 17996 ms (ước 9567) | 0.368 / 0.3719 | playing | ❌ | `hd-08-nhay-theo-nhac.png` |
| tap-the-duc | 4 | 9677 ms (ước 8800) | 0.3675 / 0.3661 | idle | ✅ | `hd-09-tap-the-duc.png` |
| di-dao | 4 | 21238 ms (ước 10400) | 0.3513 / 0.2895 | emoting | ❌ | `hd-10-di-dao.png` |
| uong-nuoc-ghe-an | 9 | 17484 ms (ước 7733) | 0.3804 / 0.3161 | idle | ✅ | `hd-11-uong-nuoc-ghe-an.png` |
| ngu-gat-sofa | 6 | 19862 ms (ước 10600) | 0.357 / 0.2895 | idle | ✅ | `hd-12-ngu-gat-sofa.png` |

Tự sinh hoạt: tuoi-cay → doc-sach-sofa; lượt đầu ở +25331 ms sau khi Boss để yên.
Cổng web riêng 5393, `?bridge=0` + TTS/STT trỏ cổng chết — không đụng 5173/8787-8790 của Boss.
