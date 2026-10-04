export interface Pendulum { angle: number; velocity: number }

// Small-angle suspension with damping. Bounded substeps keep tab resumes and
// different refresh rates from injecting energy into the hanging tag.
export function advanceTag(state: Pendulum, delta: number, force: number, gravity = 24): void {
  const duration = Math.max(0, Math.min(delta, 0.05));
  const steps = Math.max(1, Math.ceil(duration / (1 / 240)));
  const step = duration / steps;
  for (let i = 0; i < steps; i++) {
    state.velocity += (-gravity * Math.sin(state.angle) - 3.2 * state.velocity + force) * step;
    state.angle += state.velocity * step;
    if (Math.abs(state.angle) > 0.38) {
      state.angle = Math.sign(state.angle) * 0.38;
      state.velocity *= -0.18;
    }
  }
}
