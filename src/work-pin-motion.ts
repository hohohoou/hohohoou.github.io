// Keep a fixed-size, readable collection. Additional pins start a new row;
// the case front shows up to six rather than shrinking every existing pin.
export function workCharmPose(index: number, count: number, expanded: boolean) {
  const columns = Math.min(3, count);
  const row = Math.floor(index / columns);
  const rowCount = Math.min(columns, count - row * columns);
  const slot = index % columns - (rowCount - 1) / 2;
  return expanded
    ? { x: slot * 0.69, y: 0.72 + (slot === 0 ? 0.13 : 0) - row * 0.49, z: 0.24, scale: 0.36, visible: true }
    : { x: slot * 0.275, y: (count > 3 ? 0.10 : 0.035) - row * 0.20, z: 0.052, scale: count > 3 ? 0.20 : 0.26, visible: index < 6 };
}

