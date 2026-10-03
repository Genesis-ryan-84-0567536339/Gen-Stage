/**
 * Gen-Stage — demo đợt 0
 * Văn phòng 3D nhỏ + 1 nhân vật VRM sinh động, chạy trong trình duyệt.
 * Asset tải bằng `bash scripts/fetch-assets.sh` (xem assets/LICENSES.md).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dungPhong, CHO_DUNG_1, CHO_DUNG_2 } from './phong';
import { NhanVat } from './nhanvat';

const MAU_KEM = 0xfdf3e3;

/* ---------------------------------------------------------- khung vẽ */

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // giới hạn ≤ 2
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap đã bị gỡ ở three r186
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const scene = new THREE.Scene();
scene.background = new THREE.Color(MAU_KEM);
scene.fog = new THREE.Fog(MAU_KEM, 14, 30);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);

/**
 * 2 "bộ máy quay": màn hình ngang (laptop) và màn hình dọc (điện thoại).
 * Tỷ lệ khung hình càng hẹp thì càng ngả về bộ dọc — để nhân vật luôn nằm trong khung.
 */
const MAY_NGANG = {
  vt: new THREE.Vector3(3.05, 2.75, 5.95),
  tam: new THREE.Vector3(0.1, 1.05, -1.0),
  fov: 38,
};
const MAY_DOC = {
  vt: new THREE.Vector3(1.45, 2.55, 6.5),
  tam: new THREE.Vector3(-0.85, 1.0, -1.2),
  fov: 56,
};
camera.position.copy(MAY_NGANG.vt);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.1, 1.05, -1.0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2.2;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = Math.PI * 0.12;
controls.maxDistance = 9.5;
controls.enablePan = false;
// hỗ trợ cảm ứng: 1 ngón quay, 2 ngón zoom
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

/** Khi Boss đã tự xoay camera thì không tự đặt lại góc nữa. */
let boSSDaXoay = false;
controls.addEventListener('start', () => {
  boSSDaXoay = true;
});

function datGocMay() {
  const tyLe = window.innerWidth / window.innerHeight;
  // 1.30 trở lên = ngang hẳn, 0.60 trở xuống = dọc hẳn
  const t = THREE.MathUtils.clamp((1.3 - tyLe) / (1.3 - 0.6), 0, 1);
  camera.fov = THREE.MathUtils.lerp(MAY_NGANG.fov, MAY_DOC.fov, t);
  camera.aspect = tyLe;
  camera.updateProjectionMatrix();
  if (!boSSDaXoay) {
    camera.position.lerpVectors(MAY_NGANG.vt, MAY_DOC.vt, t);
    controls.target.lerpVectors(MAY_NGANG.tam, MAY_DOC.tam, t);
  }
  controls.update();
}
datGocMay();

/* ---------------------------------------------------------- ánh sáng ấm */

const troi = new THREE.HemisphereLight(0xfff3dd, 0xcdb79a, 0.62);
scene.add(troi);

const nang = new THREE.DirectionalLight(0xffe0ae, 1.45);
nang.position.set(5.2, 6.4, 3.0);
nang.castShadow = true;
nang.shadow.mapSize.set(2048, 2048); // shadow map 2048
nang.shadow.camera.near = 0.5;
nang.shadow.camera.far = 22;
nang.shadow.camera.left = -6;
nang.shadow.camera.right = 6;
nang.shadow.camera.top = 6;
nang.shadow.camera.bottom = -6;
nang.shadow.bias = -0.0006;
nang.shadow.normalBias = 0.022;
nang.shadow.radius = 2.5; // bóng đổ mềm
scene.add(nang);

const vien = new THREE.DirectionalLight(0xbfd8ff, 0.3);
vien.position.set(-4.5, 3.2, -2.5);
scene.add(vien);

// môi trường nhẹ cho vật liệu đỡ bẹt
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

/* ---------------------------------------------------------- giao diện */

const loading = document.getElementById('loading')!;
const loadingText = document.getElementById('loading-text')!;
const toastEl = document.getElementById('toast')!;
const nutEls = Array.from(
  document.querySelectorAll<HTMLButtonElement>('#controls button'),
);

let hanToast = 0;
function toast(chu: string) {
  toastEl.textContent = chu;
  toastEl.classList.add('hien');
  hanToast = performance.now() + 2200;
}

/* ---------------------------------------------------------- nạp cảnh */

let nhanVat: NhanVat | null = null;
let dangOBan2 = false;

async function khoiDong() {
  loadingText.textContent = 'Đang dựng văn phòng…';
  const phong = await dungPhong(scene);
  if (!phong.dungKenney) {
    console.warn(
      '[Gen-Stage] Chưa thấy model Kenney trong public/kenney/ — dùng nội thất tự dựng. ' +
        'Chạy `bash scripts/fetch-assets.sh` để tải bản CC0.',
    );
  }

  loadingText.textContent = 'Đang nạp nhân vật…';
  try {
    nhanVat = await NhanVat.nap('models/avatar.vrm');
    scene.add(nhanVat.goc);
    scene.add(nhanVat.diemNhin);
    nhanVat.goc.position.copy(CHO_DUNG_1);
    nhanVat.goc.rotation.y = 0.42; // hướng 3/4 về phía camera
    console.info(
      '[Gen-Stage] VRM đã nạp. Biểu cảm có sẵn:',
      nhanVat.bieuCamCoSan.join(', '),
    );
  } catch (e) {
    console.error('[Gen-Stage] Không nạp được VRM:', e);
    loadingText.textContent =
      'Không nạp được nhân vật. Chạy: bash scripts/fetch-assets.sh';
    nutEls.forEach((b) => (b.disabled = true));
    setTimeout(() => loading.classList.add('xong'), 2600);
    return;
  }

  loading.classList.add('xong');
  toast('Kéo để quay cảnh · bấm nút thử nhân vật');
}

/* ---------------------------------------------------------- nút bấm */

for (const nut of nutEls) {
  nut.addEventListener('click', () => {
    if (!nhanVat) return;
    switch (nut.dataset.act) {
      case 'wave':
        nhanVat.vayTay();
        toast('Xin chào Boss! 👋');
        break;
      case 'happy':
        nhanVat.datBieuCam('happy', 1, 5);
        toast('Biểu cảm: vui 😊');
        break;
      case 'surprised':
        nhanVat.datBieuCam('surprised', 1, 4);
        toast('Biểu cảm: ngạc nhiên 😮');
        break;
      case 'walk': {
        dangOBan2 = !dangOBan2;
        nhanVat.diToi(dangOBan2 ? CHO_DUNG_2 : CHO_DUNG_1);
        nut.textContent = dangOBan2 ? '🚶 Về bàn 1' : '🚶 Đi tới bàn 2';
        toast(dangOBan2 ? 'Đang đi tới bàn 2…' : 'Đang về bàn 1…');
        break;
      }
    }
  });
}

/* ---------------------------------------------- nhìn theo chuột / ngón tay */

const chuotNDC = new THREE.Vector2(0, 0);
const tamDiemNhin = new THREE.Vector3();

function ghiNhoChuot(x: number, y: number) {
  chuotNDC.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
}
window.addEventListener('pointermove', (e) => ghiNhoChuot(e.clientX, e.clientY));
window.addEventListener(
  'touchmove',
  (e) => {
    const t = e.touches[0];
    if (t) ghiNhoChuot(t.clientX, t.clientY);
  },
  { passive: true },
);

/* ---------------------------------------------------------- vòng lặp */

const dongHo = new THREE.Timer();

function ve() {
  dongHo.update();
  const dt = Math.min(dongHo.getDelta(), 1 / 20);

  if (nhanVat) {
    // điểm nhìn = vị trí con trỏ chiếu ra không gian, cách camera 2.4 m
    tamDiemNhin.set(chuotNDC.x, chuotNDC.y, 0.5).unproject(camera);
    tamDiemNhin.sub(camera.position).normalize().multiplyScalar(2.4).add(camera.position);
    nhanVat.diemNhin.position.copy(tamDiemNhin);

    nhanVat.capNhat(dt);
  }

  if (hanToast && performance.now() > hanToast) {
    toastEl.classList.remove('hien');
    hanToast = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(ve);

window.addEventListener('resize', () => {
  datGocMay();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

khoiDong();
