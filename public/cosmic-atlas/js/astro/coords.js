export const DEG = Math.PI / 180
export const wrapDegrees = angle => ((angle % 360) + 360) % 360
export function radecToVector(ra, dec, distance = 1) {
  const a = ra * DEG, d = dec * DEG, r = distance * Math.cos(d)
  return [r * Math.cos(a), r * Math.sin(a), distance * Math.sin(d)]
}
export const xyz = radecToVector
export function vectorToRadec([x, y, z]) {
  const distance = Math.hypot(x, y, z)
  return { ra: distance ? wrapDegrees(Math.atan2(y, x) / DEG) : 0, dec: distance ? Math.atan2(z, Math.hypot(x, y)) / DEG : 0, distance }
}
/** Stable at coincident points and the poles, returns degrees. */
export function separation(ra1, dec1, ra2, dec2) {
  const a = radecToVector(ra1, dec1), b = radecToVector(ra2, dec2)
  const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
  return Math.atan2(cross, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / DEG
}
// IAU J2000 ICRS rotation: ESA Gaia DR3 documentation, eq. 4.62.
// https://gea.esac.esa.int/archive/documentation/GDR3/Data_processing/chap_cu3ast/sec_cu3ast_intro/ssec_cu3ast_intro_tansforms.html
const ICRS_GALACTIC = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972180],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
]
// de Vaucouleurs axes; Astropy uses the same north pole l=47.37°, b=+6.32°.
// https://docs.astropy.org/en/stable/_modules/astropy/coordinates/builtin_frames/supergalactic.html
const GALACTIC_SUPERGALACTIC = [
  [-0.735742574804, 0.677261296414, 0],
  [-0.074553778365, -0.080991471307, 0.993922590400],
  [0.673145302109, 0.731271165817, 0.110081262225],
]
function rotate(matrix, vector, inverse = false) {
  return [0, 1, 2].map(i => vector.reduce((sum, value, j) => sum + value * (inverse ? matrix[j][i] : matrix[i][j]), 0))
}
function convert(ra, dec, matrix, inverse = false) {
  const result = vectorToRadec(rotate(matrix, radecToVector(ra, dec), inverse))
  return { lon: result.ra, lat: result.dec, ra: result.ra, dec: result.dec }
}
export const icrsToGalactic = (ra, dec) => convert(ra, dec, ICRS_GALACTIC)
export const galacticToIcrs = (lon, lat) => convert(lon, lat, ICRS_GALACTIC, true)
export const galacticToSupergalactic = (lon, lat) => convert(lon, lat, GALACTIC_SUPERGALACTIC)
export const supergalacticToGalactic = (lon, lat) => convert(lon, lat, GALACTIC_SUPERGALACTIC, true)
export function icrsToSupergalactic(ra, dec) {
  const galactic = icrsToGalactic(ra, dec)
  return galacticToSupergalactic(galactic.lon, galactic.lat)
}
export function supergalacticToIcrs(lon, lat) {
  const galactic = supergalacticToGalactic(lon, lat)
  return galacticToIcrs(galactic.lon, galactic.lat)
}
/** Equirectangular pixel convention: RA increases left; RA 180° is centred. */
export const skyUV = (ra, dec) => ({ u: 1 - wrapDegrees(ra) / 360, v: (90 - dec) / 180 })
