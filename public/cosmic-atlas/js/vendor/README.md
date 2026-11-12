# Pinned browser libraries

- **three.js 0.181.1**, `three.module.js` and `three.core.js` fetched unchanged from https://cdn.jsdelivr.net/npm/three@0.181.1/build/ . MIT, see `THREE-LICENSE.txt`.
- **Astronomy Engine 2.1.19**, official ESM distribution, MIT, see its adjacent license and `astro/solar.js` for accuracy and frame conventions.
- **satellite.js 7.1.0**, official ESM distribution, MIT, see `satellite/LICENSE.md`. Used in a module worker. Reference-validation fixtures and results live under `tests/unit`.

Libraries are local so GitHub Pages needs no package install or bundler to serve the atlas. `index.html` pins the import map to the checked-in three.js module.

The satellite.js subset retains the official JavaScript runtime unchanged. Unused WebAssembly builds, declarations and development configuration are omitted. The original package metadata and license are retained for provenance.
