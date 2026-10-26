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
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NhanVat } from '../../stage/nhanvat';

/** Cao độ hông của "model gốc" (m) — rig normalized sẽ ghim hông ở đây. */
const HONG_GOC = 0.94;

/** Dựng một VRM giả: cây xương người + một mesh bọc ngoài để có hộp bao thật. */
function vrmGia(): { vrm: never; chanT: THREE.Object3D; than: THREE.Mesh } {
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
    springBoneManager: undefined,
    update: () => humanoid.update(),
  };
  return {
    vrm: vrm as never,
    chanT: xuong.get('leftFoot') as THREE.Object3D,
    than,
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
