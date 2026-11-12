export const AU_KM = 149597870.7
export const MPC_KM = 3.0856775814913673e19
export const LIGHT_YEAR_KM = 299792.458 * 31557600
export const MPC_LY = MPC_KM / LIGHT_YEAR_KM
export const AU_MPC = AU_KM / MPC_KM
export const kmToMpc = km => km / MPC_KM
export const mpcToKm = mpc => mpc * MPC_KM
export const auToMpc = au => au * AU_MPC
export const mpcToAu = mpc => mpc / AU_MPC
export const mpcToLightYears = mpc => mpc * MPC_LY
export const lightSeconds = km => km / 299792.458
export function formatDistance(mpc, digits = 3) {
  const value = Math.abs(mpc)
  if (!Number.isFinite(value)) return 'Unknown distance'
  if (value === 0) return '0 km'
  const [factor, unit] = value < AU_MPC / 10 ? [MPC_KM, 'km'] : value < AU_MPC * 1000 ? [1 / AU_MPC, 'AU'] : value < 1e-6 ? [MPC_LY, 'ly'] : value < 0.001 ? [1e6, 'pc'] : value < 1 ? [1000, 'kpc'] : [1, 'Mpc']
  return `${Number((mpc * factor).toPrecision(digits))} ${unit}`
}
