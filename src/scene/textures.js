import * as THREE from 'three';

// Césped con franjas y líneas reglamentarias. Cubre 120 x 80 m (campo + bandas).
export function makePitchTexture(pitch, area) {
  const W = 2400, H = Math.round((W * area.w) / area.l);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sx = W / area.l, sz = H / area.w;
  const X = (m) => (m + area.l / 2) * sx;
  const Z = (m) => (m + area.w / 2) * sz;

  g.fillStyle = '#2f6b33';
  g.fillRect(0, 0, W, H);
  const stripes = 18;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#3d8a3f' : '#357a38';
    const x0 = X(-pitch.length / 2 + (pitch.length * i) / stripes);
    g.fillRect(x0, Z(-pitch.width / 2 - 3), (pitch.length / stripes) * sx + 1, (pitch.width + 6) * sz);
  }

  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 0.14 * sx;
  const L = pitch.length / 2, Wd = pitch.width / 2;
  const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  rect(-L, -Wd, L, Wd);
  g.beginPath(); g.moveTo(X(0), Z(-Wd)); g.lineTo(X(0), Z(Wd)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 9.15 * sx, 0, Math.PI * 2); g.stroke();
  for (const s of [-1, 1]) {
    const gx = s * L;
    rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
    rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
    g.beginPath(); g.arc(X(gx - s * 11), Z(0), 0.25 * sx, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.beginPath();
    const a = Math.acos(5.5 / 9.15);
    if (s > 0) g.arc(X(gx - 11), Z(0), 9.15 * sx, Math.PI - a, Math.PI + a);
    else g.arc(X(gx + 11), Z(0), 9.15 * sx, -a, a);
    g.stroke();
  }
  g.beginPath(); g.arc(X(0), Z(0), 0.25 * sx, 0, Math.PI * 2); g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeBoardTexture(text) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 640, 0);
  grad.addColorStop(0, '#0b1f4d'); grad.addColorStop(0.5, '#123a8c'); grad.addColorStop(1, '#0b1f4d');
  g.fillStyle = grad; g.fillRect(0, 0, 640, 64);
  g.fillStyle = '#ffffff';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, 320, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function makeLabelTexture(text, sub, tag) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = tag ? 210 : 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,26,0.82)';
  g.beginPath(); g.roundRect(8, 8, 240, 112, 22); g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  g.fillStyle = '#9fb3d9';
  g.font = '600 26px system-ui, sans-serif';
  g.fillText(sub, 128, 96);
  if (tag) {
    g.fillStyle = 'rgba(255,200,61,0.95)';
    g.beginPath(); g.roundRect(4, 126, 248, 80, 16); g.fill();
    g.fillStyle = '#1d1400';
    g.font = 'bold 30px system-ui, sans-serif';
    const words = tag.split(' ');
    const mid = Math.ceil(words.length / 2);
    g.fillText(words.slice(0, mid).join(' '), 128, 150);
    g.fillText(words.slice(mid).join(' '), 128, 184);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
