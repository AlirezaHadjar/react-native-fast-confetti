export type PlateParams = {
  Cn: number; // normal drag coefficient
  Ct: number; // tangential drag coefficient
  Ccouple: number; // rotation-translation coupling (added-mass torque)
  Crot: number; // rotational damping
  tumbleBias: number; // constant torque ensuring continuous rotation
  g: number; // gravity (px/s^2)
};

/**
 * Integrate the 2-D tumbling-plate ODE via RK4 and write (x, y, theta)
 * samples directly into `output` starting at `outputOffset`.
 *
 * Zero heap allocations in the hot loop — all intermediate state is kept
 * in scalar local variables.
 */
export function integrateTrajectory(
  ix: number,
  iy: number,
  ivx: number,
  ivy: number,
  itheta: number,
  iomega: number,
  p: PlateParams,
  totalTime: number,
  sampleCount: number,
  output: number[],
  outputOffset: number
): void {
  'worklet';
  const dt = totalTime / sampleCount;
  const halfDt = dt * 0.5;
  const sixthDt = dt / 6;

  // Current state (scalars)
  let x = ix;
  let y = iy;
  let vx = ivx;
  let vy = ivy;
  let theta = itheta;
  let omega = iomega;

  // Store initial sample
  output[outputOffset] = x;
  output[outputOffset + 1] = y;
  output[outputOffset + 2] = theta;

  for (let i = 1; i <= sampleCount; i++) {
    // --- k1 = derivatives(state) ---
    let sinT = Math.sin(theta);
    let cosT = Math.cos(theta);
    let vn = -vx * sinT + vy * cosT;
    let vt = vx * cosT + vy * sinT;
    let Fn = -p.Cn * vn * Math.abs(vn);
    let Ft = -p.Ct * vt * Math.abs(vt);

    const k1_x = vx;
    const k1_y = vy;
    const k1_vx = Fn * -sinT + Ft * cosT;
    const k1_vy = Fn * cosT + Ft * sinT + p.g;
    const k1_theta = omega;
    const k1_omega =
      p.Ccouple * vn * vt + p.tumbleBias - p.Crot * omega * Math.abs(omega);

    // --- k2 = derivatives(state + k1 * dt/2) ---
    const s2_vx = vx + k1_vx * halfDt;
    const s2_vy = vy + k1_vy * halfDt;
    const s2_theta = theta + k1_theta * halfDt;
    const s2_omega = omega + k1_omega * halfDt;

    sinT = Math.sin(s2_theta);
    cosT = Math.cos(s2_theta);
    vn = -s2_vx * sinT + s2_vy * cosT;
    vt = s2_vx * cosT + s2_vy * sinT;
    Fn = -p.Cn * vn * Math.abs(vn);
    Ft = -p.Ct * vt * Math.abs(vt);

    const k2_x = s2_vx;
    const k2_y = s2_vy;
    const k2_vx = Fn * -sinT + Ft * cosT;
    const k2_vy = Fn * cosT + Ft * sinT + p.g;
    const k2_theta = s2_omega;
    const k2_omega =
      p.Ccouple * vn * vt +
      p.tumbleBias -
      p.Crot * s2_omega * Math.abs(s2_omega);

    // --- k3 = derivatives(state + k2 * dt/2) ---
    const s3_vx = vx + k2_vx * halfDt;
    const s3_vy = vy + k2_vy * halfDt;
    const s3_theta = theta + k2_theta * halfDt;
    const s3_omega = omega + k2_omega * halfDt;

    sinT = Math.sin(s3_theta);
    cosT = Math.cos(s3_theta);
    vn = -s3_vx * sinT + s3_vy * cosT;
    vt = s3_vx * cosT + s3_vy * sinT;
    Fn = -p.Cn * vn * Math.abs(vn);
    Ft = -p.Ct * vt * Math.abs(vt);

    const k3_x = s3_vx;
    const k3_y = s3_vy;
    const k3_vx = Fn * -sinT + Ft * cosT;
    const k3_vy = Fn * cosT + Ft * sinT + p.g;
    const k3_theta = s3_omega;
    const k3_omega =
      p.Ccouple * vn * vt +
      p.tumbleBias -
      p.Crot * s3_omega * Math.abs(s3_omega);

    // --- k4 = derivatives(state + k3 * dt) ---
    const s4_vx = vx + k3_vx * dt;
    const s4_vy = vy + k3_vy * dt;
    const s4_theta = theta + k3_theta * dt;
    const s4_omega = omega + k3_omega * dt;

    sinT = Math.sin(s4_theta);
    cosT = Math.cos(s4_theta);
    vn = -s4_vx * sinT + s4_vy * cosT;
    vt = s4_vx * cosT + s4_vy * sinT;
    Fn = -p.Cn * vn * Math.abs(vn);
    Ft = -p.Ct * vt * Math.abs(vt);

    const k4_x = s4_vx;
    const k4_y = s4_vy;
    const k4_vx = Fn * -sinT + Ft * cosT;
    const k4_vy = Fn * cosT + Ft * sinT + p.g;
    const k4_theta = s4_omega;
    const k4_omega =
      p.Ccouple * vn * vt +
      p.tumbleBias -
      p.Crot * s4_omega * Math.abs(s4_omega);

    // --- Advance state ---
    x += sixthDt * (k1_x + 2 * k2_x + 2 * k3_x + k4_x);
    y += sixthDt * (k1_y + 2 * k2_y + 2 * k3_y + k4_y);
    vx += sixthDt * (k1_vx + 2 * k2_vx + 2 * k3_vx + k4_vx);
    vy += sixthDt * (k1_vy + 2 * k2_vy + 2 * k3_vy + k4_vy);
    theta += sixthDt * (k1_theta + 2 * k2_theta + 2 * k3_theta + k4_theta);
    omega += sixthDt * (k1_omega + 2 * k2_omega + 2 * k3_omega + k4_omega);

    // Store sample
    const base = outputOffset + i * 3;
    output[base] = x;
    output[base + 1] = y;
    output[base + 2] = theta;
  }
}
