// TODO: verify a redistributable 3D reconstruction, units, frame and selection function before rendering a volume.
export default { kind: 'volume', panels: [], load: async () => { throw Error('No verified 3D density grid is included. Planck lensing is a projected 2D field.') } }
