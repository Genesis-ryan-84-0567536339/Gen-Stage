/**
 * g1-chan-cham-san.test.ts — G1 (#56 mục Boss 26/10): **chân phải chạm sàn**.
 *
 * Boss xem bản main trên Firefox: "các nhân vật đang toàn đi trên không trung".
 * Đo trên Firefox thật trước khi sửa: bàn chân owner ở y = 0,385 m, gen 0,418 m,
 * đáy hộp bao 0,35 / 0,37 m — treo gần 40 cm trên mặt sàn y = 0.
 *
 * GỐC (kiểm toán skill mục 1): `VRMHumanoidRig.update()` ghi `hips` của xương
 * RAW theo **vị trí hông của model GỐC** mỗi lượt `vrm.update()`. Chibi hoá
 * nhân xương chân xuống 0,6 nhưng hông vẫn bị ghim ở cao độ người lớn ⇒ chân
 * ngắn đi mà hông không hạ, bàn chân treo lên.
 *
 * Test này dựng một VRM GIẢ tái hiện ĐÚNG cơ chế đó (hông bị ghim mỗi lượt
 * `update()`), rồi khẳng định `NhanVat` vẫn kéo được đế giày về mặt sàn — ở
 * mọi trạng thái, không kẹp cứng theo `bbox.min.y` (bài học A2 vòng 4).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NhanVat } from '../../stage/nhanvat';

/** Cao độ hông của "model gốc" (m) — rig normalized sẽ ghim hông ở đây. */
const HONG_GOC = 0.94;

/** Quản lý spring bone GIẢ: chỉ ghi lại từng bước `dt` được chạy. */
interface QuanLySpringGia {
  joints: never[];
  buoc: number[];
  /** Bật = giả lập thư viện gọi spring TỪ TRONG `vrm.update()`. */
  goiTrongUpdate: boolean;
  setInitState(): void;
  reset(): void;
  update(dt: number): void;
}

function springGia(goiTrongUpdate = false): QuanLySpringGia {
  const q: QuanLySpringGia = {
    joints: [],
    buoc: [],
    goiTrongUpdate,
    setInitState: () => {},
    reset: () => {},
    update: (dt: number) => {
      q.buoc.push(dt);
    },
  };
  return q;
}

/** Dựng một VRM giả: cây xương người + một mesh bọc ngoài để có hộp bao thật. */
function vrmGia(spring?: QuanLySpringGia): {
  vrm: never;
  chanT: THREE.Object3D;
  than: THREE.Mesh;
  scene: THREE.Group;
} {
  const scene = new THREE.Group();
  const xuong = new Map<string, THREE.Object3D>();
  const them = (ten: string, cha: THREE.Object3D, y: number, x = 0): THREE.Object3D => {
    const o = new THREE.Object3D();
    o.name = ten;
    o.position.set(x, y, 0);
    cha.add(o);
    xuong.set(ten, o);
    return o;
  };
  const hips = them('hips', scene, HONG_GOC);
  const spine = them('spine', hips, 0.18);
  const chest = them('chest', spine, 0.16);
  const neck = them('neck', chest, 0.2);
  them('head', neck, 0.1);
  for (const [ben, dx] of [
    ['left', -0.09],
    ['right', 0.09],
  ] as const) {
    const vai = them(`${ben}Shoulder`, chest, 0.14, dx);
    const tayTren = them(`${ben}UpperArm`, vai, -0.04, dx);
    const tayDuoi = them(`${ben}LowerArm`, tayTren, -0.25);
    them(`${ben}Hand`, tayDuoi, -0.24);
    const dui = them(`${ben}UpperLeg`, hips, -0.04, dx);
    const ong = them(`${ben}LowerLeg`, dui, -0.42);
    const chan = them(`${ben}Foot`, ong, -0.42);
    them(`${ben}Toes`, chan, -0.03);
  }

  // "da thịt": một hộp bọc quanh người để `Box3.setFromObject(…, true)` có số.
  // Đế hộp nằm thấp hơn xương bàn chân 3 cm — đúng bề dày đế giày.
  const than = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2));
  than.position.y = -0.03;
  (xuong.get('leftFoot') as THREE.Object3D).add(than);
  const thanP = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2));
  thanP.position.y = -0.03;
  (xuong.get('rightFoot') as THREE.Object3D).add(thanP);

  const humanoid = {
    getRawBoneNode: (t: string) => xuong.get(t) ?? null,
    getNormalizedBoneNode: (t: string) => xuong.get(t) ?? null,
    /**
     * ĐÂY LÀ CÁI BẪY: y như `VRMHumanoidRig.update()` thật, hông bị ghim về
     * cao độ của model gốc trong hệ toạ độ của `goc` — không quan tâm xương
     * chân đã bị chibi hoá ngắn đi bao nhiêu.
     */
    update: () => {
      hips.position.y = HONG_GOC;
    },
  };
  const vrm = {
    scene,
    humanoid,
    meta: { metaVersion: '1' },
    expressionManager: undefined,
    lookAt: undefined,
    springBoneManager: spring,
    update: (dt: number) => {
      humanoid.update();
      // Bẫy của test "spring chạy trong vrm.update": một bản thư viện giữ
      // tham chiếu bắt trước sẽ gọi spring Ở ĐÂY, dù `vrm.springBoneManager`
      // đã bị tháo ra.
      if (spring?.goiTrongUpdate) spring.update(dt);
    },
  };
  return {
    vrm: vrm as never,
    chanT: xuong.get('leftFoot') as THREE.Object3D,
    than,
    scene,
  };
}

/** Đáy hộp bao CHÍNH XÁC (có biến dạng xương) của nhân vật — tức mặt đế giày. */
function dayNguoi(nv: NhanVat): number {
  nv.goc.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(nv.goc, true).min.y;
}

/** Chạy vài khung hình như vòng dựng hình thật (mốc chốt ở khung thứ 3). */
function chay(nv: NhanVat, soKhung = 8, dt = 1 / 60): void {
  for (let i = 0; i < soKhung; i += 1) nv.capNhat(dt);
}

describe('G1 (#56) — bàn chân phải cắm xuống mặt sàn', () => {
  it('tái hiện được tật cũ: rig ghim hông nên chân treo lên', () => {
    const { vrm } = vrmGia();
    const nv = new NhanVat('t1', 'T1', vrm, true);
    // CHƯA chạy khung nào: hông đang ở cao độ model gốc, chân đã bị chibi hoá
    // ngắn lại ⇒ đế giày treo cao hẳn trên sàn. Đây là tình trạng Boss thấy.
    expect(dayNguoi(nv)).toBeGreaterThan(0.1);
  });

  it('đứng yên: đế giày về đúng mặt sàn (±1 cm)', () => {
    const { vrm } = vrmGia();
    const nv = new NhanVat('t2', 'T2', vrm, true);
    chay(nv);
    expect(Math.abs(dayNguoi(nv))).toBeLessThanOrEqual(0.01);
  });

  it('đi: mỗi khung hình đế giày vẫn ở mặt sàn, không nảy', () => {
    const { vrm } = vrmGia();
    const nv = new NhanVat('t3', 'T3', vrm, true);
    chay(nv);
    nv.lai(0, -1, 1200);
    const ds: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      nv.capNhat(1 / 60);
      ds.push(dayNguoi(nv));
    }
    for (const y of ds) expect(Math.abs(y)).toBeLessThanOrEqual(0.01);
  });

  it('KHÔNG kẹp cứng theo bbox: gốc đi theo XƯƠNG, chân co lên thì thân hạ xuống', () => {
    const { vrm, chanT } = vrmGia();
    const nv = new NhanVat('t4', 'T4', vrm, true);
    chay(nv);
    const gocTruoc = nv.goc.position.y;
    // kéo riêng bàn chân TRÁI lên 5 cm (như một khung giữa bước chân):
    // chân phải thành chân trụ, độ cao thân KHÔNG được đổi theo chân nhấc.
    chanT.position.y += 0.05;
    nv.capNhat(1 / 60);
    expect(Math.abs(nv.goc.position.y - gocTruoc)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(dayNguoi(nv))).toBeLessThanOrEqual(0.01);
  });

  it('mốc đế giày đo SAU khi cân tầm vóc, không phải ở hàm dựng', () => {
    const { vrm } = vrmGia();
    const nv = new NhanVat('t5', 'T5', vrm, true);
    chay(nv);
    const d = nv.doXuong();
    const tuThe = d.tuThe as { footY: number; minY: number };
    // xương bàn chân cao hơn đế đúng bề dày đế (3 cm ± 1 cm), và đế ở mặt sàn
    expect(tuThe.footY - tuThe.minY).toBeGreaterThan(0.02);
    expect(tuThe.footY - tuThe.minY).toBeLessThan(0.05);
    expect(Math.abs(tuThe.minY)).toBeLessThanOrEqual(0.01);
  });
});

/** Chạy `n` khung hình theo ĐỒNG HỒ THẬT (tư thế ngồi nội suy theo đồng hồ). */
async function chayThat(nv: NhanVat, n = 90, nghi = 18): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    nv.capNhat(1 / 60);
    await new Promise((r) => setTimeout(r, nghi));
  }
}

/**
 * G1 vòng 3 — review 26/10 CHẶN 1: **ngồi thì giày lún 5,7 cm dưới sàn**.
 *
 * Gốc: `gapChanNgoi` đặt bàn chân theo `MAT_SAN + deChan`, mà `deChan` là
 * khoảng xương-chân → đế giày chốt MỘT LẦN ở tư thế ĐỨNG. Khi ngồi, cổ chân
 * xoay nên đế giày nằm xa xương bàn chân hơn hẳn (model thật: 0,093 m thay vì
 * 0,033 m) ⇒ trừ hằng số của tư thế khác là lún đúng phần chênh. Thước
 * `deGiayY` cũng trừ đúng hằng số đó nên mọi lượt kiểm trước đều "đạt".
 *
 * Test đo bằng **hộp bao chính xác** (`setFromObject(root, true)`, tức hình
 * học thật của mesh ở tư thế hiện tại), KHÔNG dùng `deChan`. Ghế của test đặt
 * thấp hơn cẳng chân để điều kiện sàn mới là điều kiện quyết định — đúng tình
 * huống của cảnh thật (ghế chibi 0,2585 m, cẳng chân 0,25 m).
 */
describe('G1 vòng 3 (#56) — NGỒI: đế giày cũng phải ở mặt sàn', () => {
  /** Mặt ghế thấp hơn cẳng chân của model giả ⇒ sàn là điều kiện quyết định. */
  const GHE_THAP = 0.18;

  it('ngồi: đế giày về mặt sàn ±2 cm (đo hình học, không qua deChan)', async () => {
    const { vrm } = vrmGia();
    const nv = new NhanVat('n1', 'N1', vrm, true);
    chay(nv);
    nv.ngoi(GHE_THAP);
    await chayThat(nv);
    // Trước khi sửa, cùng model giả này đo được −0,053 m (giày lún dưới sàn).
    expect(Math.abs(dayNguoi(nv))).toBeLessThanOrEqual(0.02);
  });

  it('mốc đế giày ĐỔI theo tư thế: ngồi khác đứng, đứng lại thì về mốc cũ', async () => {
    const { vrm } = vrmGia();
    const nv = new NhanVat('n2', 'N2', vrm, true);
    chay(nv);
    const dung = nv.doXuong();
    expect(dung.deChanTuThe).toBeCloseTo(dung.deChan as number, 6);

    nv.ngoi(GHE_THAP);
    await chayThat(nv);
    const ngoi = nv.doXuong();
    // cổ chân xoay khi ngồi ⇒ đế giày rời xa xương bàn chân rõ rệt
    expect(ngoi.deChanTuThe as number).toBeGreaterThan((ngoi.deChan as number) + 0.02);
    // thước phơi ra cũng phải là thước của TƯ THẾ NÀY, và trùng phép quét
    expect(ngoi.deGiayY as number).toBeCloseTo(ngoi.deGiayQuet as number, 3);

    nv.dungLen();
    await chayThat(nv, 90);
    const lai = nv.doXuong();
    expect(lai.deChanTuThe).toBeCloseTo(lai.deChan as number, 6);
    expect(Math.abs(dayNguoi(nv))).toBeLessThanOrEqual(0.01);
  });
});

/**
 * G1 vòng 3 — review 26/10 CHẶN 2 + điểm mong manh 1 & 3: **nhịp spring bone**.
 *
 * Bản trước kẹp `buoc = min(dt/soBuoc, 1/60)` với trần 4 bước, nên một khung
 * hình 338 ms chỉ được mô phỏng 66,7 ms: xương nhảy đủ dáng nhảy, tóc chạy
 * chậm 5 lần rồi "đuổi kịp" — đo thật `lechToc` vọt 0,348 m.
 */
describe('G1 vòng 3 (#56) — spring bone: nhịp cố định, không ăn bớt thời gian', () => {
  /** Ngủ `ms` thật rồi chạy MỘT khung — spring đo bằng đồng hồ, không bằng `dt`. */
  async function khungDai(nv: NhanVat, ms: number): Promise<number> {
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, ms));
    nv.capNhat(1 / 60);
    return (performance.now() - t0) / 1000;
  }

  it('khung hình dài ~340 ms vẫn được mô phỏng ĐỦ, mỗi bước ≤ 1/60 s', async () => {
    const sp = springGia();
    const { vrm } = vrmGia(sp);
    const nv = new NhanVat('s1', 'S1', vrm, true);
    chay(nv, 4);
    sp.buoc.length = 0;
    const troi = await khungDai(nv, 340);
    const tong = sp.buoc.reduce((a, b) => a + b, 0);
    // Bản vòng 2 mô phỏng nhiều nhất 4 × 1/60 = 66,7 ms cho khung này.
    expect(tong).toBeGreaterThan(troi - 0.02);
    expect(tong).toBeLessThanOrEqual(troi + 0.02);
    for (const b of sp.buoc) expect(b).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(sp.buoc.length).toBeGreaterThanOrEqual(18);
  });

  it('khung hình ngắn: vẫn đúng đồng hồ, bước ≤ 1/60 s', async () => {
    const sp = springGia();
    const { vrm } = vrmGia(sp);
    const nv = new NhanVat('s2', 'S2', vrm, true);
    chay(nv, 4);
    sp.buoc.length = 0;
    const troi = await khungDai(nv, 12);
    const tong = sp.buoc.reduce((a, b) => a + b, 0);
    expect(tong).toBeCloseTo(troi, 3);
    for (const b of sp.buoc) expect(b).toBeLessThanOrEqual(1 / 60 + 1e-9);
  });

  it('khung hình khổng lồ (tab vừa hiện lại) không treo máy: trần 24 bước', async () => {
    const sp = springGia();
    const { vrm } = vrmGia(sp);
    const nv = new NhanVat('s3', 'S3', vrm, true);
    chay(nv, 4);
    sp.buoc.length = 0;
    await khungDai(nv, 700);
    expect(sp.buoc.length).toBeLessThanOrEqual(24);
    expect(sp.buoc.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  /**
   * Trần tốc độ hiển thị của tóc/vải (`DICH_TOC_MOI_KHUNG`). Vòng 3 đo được
   * một gai MỘT KHUNG 0,112 m ở `ngac-nhien`: collider bàn tay đẩy chuỗi tóc
   * ra khỏi hình cầu trong đúng một bước. Test dựng một quản lý spring giả
   * **cố tình** xoay xương tóc 1 rad mỗi lượt và khẳng định dáng VẼ RA mỗi
   * khung chỉ rời dáng khung trước trong trần cho phép.
   */
  it('cú đẩy khổng lồ của collider bị trần TỐC ĐỘ cắt lại', async () => {
    const sp = springGia();
    const { vrm, scene } = vrmGia(sp);
    // một "xương tóc" với đuôi cách gốc 0,1 m
    const toc = new THREE.Object3D();
    toc.position.set(0, 1.2, 0);
    scene.add(toc);
    const duoi = new THREE.Object3D();
    duoi.position.set(0, -0.1, 0);
    toc.add(duoi);
    sp.joints = [
      {
        bone: toc,
        child: duoi,
        settings: { stiffness: 1, gravityPower: 1, hitRadius: 0.02, dragForce: 0.4 },
      },
    ] as never;
    // mỗi lượt mô phỏng: ném xương đi 1 rad (cú đẩy của collider bàn tay)
    sp.update = () => toc.rotateX(1);

    const nv = new NhanVat('h1', 'H1', vrm, true);
    chay(nv, 4);
    const viTri = (): THREE.Vector3 => {
      nv.goc.updateMatrixWorld(true);
      return duoi.getWorldPosition(new THREE.Vector3());
    };
    /*
     * Trần là VẬN TỐC (m/s), nên phải chạy theo đồng hồ thật. Mỗi khung đuôi
     * tóc chỉ được đi `max(0.01, 1.0 × dt)` mét — bản vòng 4 kẹp mỗi KHUNG nên
     * tốc độ tối đa tỉ lệ với FPS (1,8 m/s ở 60 FPS, 0,24 m/s ở 8 FPS) và
     * đạt/không đạt phụ thuộc máy kiểm (review PR #70).
     */
    let coDi = false;
    for (let i = 0; i < 5; i += 1) {
      const truoc = viTri();
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 40));
      nv.capNhat(1 / 60);
      const dt = (performance.now() - t0) / 1000;
      const di = viTri().distanceTo(truoc);
      // +2 mm lề cho phép hoà dáng theo tỉ lệ (xấp xỉ tuyến tính)
      expect(di).toBeLessThanOrEqual(Math.max(0.01, 1.0 * dt) + 0.002);
      if (di > 0) coDi = true;
    }
    // vẫn PHẢI nhích (hãm, không đóng băng tóc)
    expect(coDi).toBe(true);
    const d = nv.doToc();
    expect(d.soKhopHam).toBe(1);
    expect(d.soHamCat).toBe(1);
  });

  it('thư viện chạy spring TRONG vrm.update → hỏng TO, không im lặng', () => {
    const canh = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sp = springGia(true);
    const { vrm } = vrmGia(sp);
    const nv = new NhanVat('s4', 'S4', vrm, true);
    chay(nv, 5);
    expect(nv.doXuong().springTrongUpdate as number).toBeGreaterThan(0);
    expect(canh).toHaveBeenCalled();
    canh.mockRestore();
  });

  it('bình thường thì spring KHÔNG hề chạy trong vrm.update', () => {
    const sp = springGia();
    const { vrm } = vrmGia(sp);
    const nv = new NhanVat('s5', 'S5', vrm, true);
    chay(nv, 10);
    expect(nv.doXuong().springTrongUpdate).toBe(0);
  });
});
