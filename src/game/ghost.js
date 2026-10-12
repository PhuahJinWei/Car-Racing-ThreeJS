import * as THREE from 'three';

const STRIDE = 7; // x, y, z, qx, qy, qz, qw
const RATE = 10;

export class GhostRecorder {
  constructor() {
    this.data = [];
    this.next = 0;
  }

  record(time, position, quat) {
    if (time < this.next) return;
    this.next = time + 1 / RATE;
    this.data.push(position.x, position.y, position.z, quat.x, quat.y, quat.z, quat.w);
  }

  encode() {
    const arr = new Float32Array(this.data);
    const bytes = new Uint8Array(arr.buffer);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
}

export class GhostPlayer {
  constructor(encoded) {
    const bin = atob(encoded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    this.data = new Float32Array(bytes.buffer);
    this.count = Math.floor(this.data.length / STRIDE);
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
  }

  get duration() {
    return this.count / RATE;
  }

  sample(time, outPos, outQuat) {
    if (this.count < 2) return false;
    const f = Math.max(0, time * RATE);
    const i = Math.min(this.count - 2, Math.floor(f));
    const t = Math.min(1, f - i);
    const d = this.data;
    const a = i * STRIDE;
    const b = (i + 1) * STRIDE;
    outPos.set(d[a] + (d[b] - d[a]) * t, d[a + 1] + (d[b + 1] - d[a + 1]) * t, d[a + 2] + (d[b + 2] - d[a + 2]) * t);
    this._qa.set(d[a + 3], d[a + 4], d[a + 5], d[a + 6]);
    this._qb.set(d[b + 3], d[b + 4], d[b + 5], d[b + 6]);
    outQuat.slerpQuaternions(this._qa, this._qb, t);
    return time * RATE < this.count;
  }
}
