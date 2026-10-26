| Thước đo (Issue #79) | Lời hứa | Đo thật | Kết |
| --- | --- | --- | --- |
| số hoạt động trong bảng | ≥12 | **12** | ✅ |
| hoạt động chạy TRỌN (r.ok + activityDone + về idle) | 12/12 | **12/12** | ✅ |
| đế giày quét mesh (`minY`) | ≥ −0,01 m | **0.166 m** | ✅ |
| rảnh 65 s → hoạt động tự sinh | ≥2, khác nhau | **2 lượt / 2 loại** | ✅ |
| Boss gõ giữa chừng → cắt | ≤300 ms | **9 ms** | ✅ |
| `r.ok` mọi lệnh | 100 % | **195/195** | ✅ |
| console | 0 lỗi | **0** | ✅ |

### Từng hoạt động

| hoạt động | bước | thời lượng | minY giữa / chốt / sau (m) | state tại mốc xong | kết | ảnh |
| --- | --- | --- | --- | --- | --- | --- |
| doc-sach-sofa | 10 | 20173 ms (ước 10900) | 0.3937 / 0.2074 / 0.3667 | idle | ✅ | `hd-01-doc-sach-sofa.png` |
| pha-ca-phe | 9 | 18479 ms (ước 10200) | 0.3569 / 0.375 / 0.3698 | idle | ✅ | `hd-02-pha-ca-phe.png` |
| go-may-tinh | 5 | 9917 ms (ước 9400) | 0.166 / 0.286 / 0.2238 | idle | ✅ | `hd-03-go-may-tinh.png` |
| vuon-vai | 3 | 5953 ms (ước 4114) | 0.3662 / 0.3695 / 0.3689 | idle | ✅ | `hd-04-vuon-vai.png` |
| ngam-cua-so | 5 | 15792 ms (ước 8200) | 0.3754 / 0.3724 / 0.3667 | idle | ✅ | `hd-05-ngam-cua-so.png` |
| tuoi-cay | 8 | 10894 ms (ước 8500) | 0.3699 / 0.3676 / 0.3666 | idle | ✅ | `hd-06-tuoi-cay.png` |
| don-ban-an | 5 | 20039 ms (ước 8700) | 0.3596 / 0.3679 / 0.369 | idle | ✅ | `hd-07-don-ban-an.png` |
| nhay-theo-nhac | 4 | 18217 ms (ước 9567) | 0.3951 / 0.2501 / 0.3701 | idle | ✅ | `hd-08-nhay-theo-nhac.png` |
| tap-the-duc | 4 | 9685 ms (ước 8800) | 0.3673 / 0.3643 / 0.3669 | idle | ✅ | `hd-09-tap-the-duc.png` |
| di-dao | 4 | 21619 ms (ước 10400) | 0.3632 / 0.358 / 0.3611 | idle | ✅ | `hd-10-di-dao.png` |
| uong-nuoc-ghe-an | 9 | 17330 ms (ước 7733) | 0.3864 / 0.309 / 0.3593 | idle | ✅ | `hd-11-uong-nuoc-ghe-an.png` |
| ngu-gat-sofa | 6 | 20210 ms (ước 10600) | 0.3579 / 0.2105 / 0.3104 | idle | ✅ | `hd-12-ngu-gat-sofa.png` |

Tự sinh hoạt: pha-ca-phe → vuon-vai; lượt đầu ở +13708 ms sau khi Boss để yên.
Cổng web riêng 5393, `?bridge=0` + TTS/STT trỏ `/__tat-tieng` cùng origin — không đụng 5173/8787-8790 của Boss.
