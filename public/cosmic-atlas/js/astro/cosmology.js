export const COSMOLOGY = Object.freeze({ H0: 70, omegaM: 0.3, omegaLambda: 0.7 })
const C_KMS = 299792.458, MPC_KM = 3.0856775814913673e19, YEAR_SECONDS = 31557600
function integrate(z, fn) {
  if (!Number.isFinite(z) || z < 0 || z > 8) return NaN
  const steps = 256, h = z / steps
  let sum = fn(0) + fn(z)
  for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * fn(i * h)
  return h * sum / 3
}
const expansion = z => Math.sqrt(COSMOLOGY.omegaM * (1 + z) ** 3 + COSMOLOGY.omegaLambda)
export const comovingMpc = z => C_KMS / COSMOLOGY.H0 * integrate(z, value => 1 / expansion(value))
export const lookbackYears = z => MPC_KM / COSMOLOGY.H0 / YEAR_SECONDS * integrate(z, value => 1 / ((1 + value) * expansion(value)))
