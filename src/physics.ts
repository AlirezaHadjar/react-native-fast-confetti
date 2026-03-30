export type PlateParams = {
  Cn: number; // normal drag coefficient
  Ct: number; // tangential drag coefficient
  Ccouple: number; // rotation-translation coupling (added-mass torque)
  Crot: number; // rotational damping
  tumbleBias: number; // constant torque ensuring continuous rotation
  g: number; // gravity (px/s^2)
};

/**
 * Compute aerodynamic forces and torque on a tumbling plate.
 * Writes [ax, ay, angularAccel] into `out` to avoid allocations.
 */
function computeForces(
  vx: number,
  vy: number,
  theta: number,
  omega: number,
  p: PlateParams,
  out: [number, number, number]
): void {
  'worklet';
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const vn = -vx * sinT + vy * cosT;
  const vt = vx * cosT + vy * sinT;
  const Fn = -p.Cn * vn * Math.abs(vn);
  const Ft = -p.Ct * vt * Math.abs(vt);
  out[0] = Fn * -sinT + Ft * cosT;
  out[1] = Fn * cosT + Ft * sinT + p.g;
  out[2] =
    p.Ccouple * vn * vt + p.tumbleBias - p.Crot * omega * Math.abs(omega);
}

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

  const forces: [number, number, number] = [0, 0, 0];

  for (let i = 1; i <= sampleCount; i++) {
    // --- k1 = derivatives(state) ---
    computeForces(vx, vy, theta, omega, p, forces);
    const k1_x = vx;
    const k1_y = vy;
    const k1_vx = forces[0];
    const k1_vy = forces[1];
    const k1_theta = omega;
    const k1_omega = forces[2];

    // --- k2 = derivatives(state + k1 * dt/2) ---
    const s2_vx = vx + k1_vx * halfDt;
    const s2_vy = vy + k1_vy * halfDt;
    const s2_theta = theta + k1_theta * halfDt;
    const s2_omega = omega + k1_omega * halfDt;

    computeForces(s2_vx, s2_vy, s2_theta, s2_omega, p, forces);
    const k2_x = s2_vx;
    const k2_y = s2_vy;
    const k2_vx = forces[0];
    const k2_vy = forces[1];
    const k2_theta = s2_omega;
    const k2_omega = forces[2];

    // --- k3 = derivatives(state + k2 * dt/2) ---
    const s3_vx = vx + k2_vx * halfDt;
    const s3_vy = vy + k2_vy * halfDt;
    const s3_theta = theta + k2_theta * halfDt;
    const s3_omega = omega + k2_omega * halfDt;

    computeForces(s3_vx, s3_vy, s3_theta, s3_omega, p, forces);
    const k3_x = s3_vx;
    const k3_y = s3_vy;
    const k3_vx = forces[0];
    const k3_vy = forces[1];
    const k3_theta = s3_omega;
    const k3_omega = forces[2];

    // --- k4 = derivatives(state + k3 * dt) ---
    const s4_vx = vx + k3_vx * dt;
    const s4_vy = vy + k3_vy * dt;
    const s4_theta = theta + k3_theta * dt;
    const s4_omega = omega + k3_omega * dt;

    computeForces(s4_vx, s4_vy, s4_theta, s4_omega, p, forces);
    const k4_x = s4_vx;
    const k4_y = s4_vy;
    const k4_vx = forces[0];
    const k4_vy = forces[1];
    const k4_theta = s4_omega;
    const k4_omega = forces[2];

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
