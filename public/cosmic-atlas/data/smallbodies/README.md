# Representative JPL small bodies

Eight bodies are included: Ceres, Vesta, Eros, Bennu, Apophis, 1P/Halley, 67P/Churyumov–Gerasimenko and 2P/Encke. This is not a complete catalog of known comets and asteroids.

`ephemerides.json` stores NASA/JPL Horizons heliocentric, ICRF equatorial geometric positions and velocities in km and km/s, sampled every six hours from **2026-01-01 00:00 UTC through 2028-01-01 00:00 UTC**. Rows are `[JD_UTC,x,y,z,vx,vy,vz]`. The helper uses cubic Hermite interpolation and its analytic velocity derivative. It refuses to extrapolate. The future UTC conversion assumes the provider's current leap-second knowledge.

Every object records its exact Horizons and Small-Body Database query URLs, returned Horizons header, JPL orbit solution information, retrieval times and physical diameter source. Comet queries select the last apparition solution before 2026 as documented by Horizons. Diameter-derived spherical radii describe an effective size; these bodies may have strongly irregular shapes. No surface imagery, coma or tail dimensions are inferred.

`validation.json` contains separate Horizons queries at three off-grid UTC times per body. The maximum position interpolation residual among these 24 checks is **0.001805 km (1.805 m)**; this is a numerical interpolation check, not physical orbit uncertainty or a bound at every instant. Geometric RA/Dec omit light-time, aberration and refraction.

Sources: [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [SBDB API](https://ssd-api.jpl.nasa.gov/doc/sbdb.html). Credit NASA/JPL Solar System Dynamics. [JPL fair-use policy](https://ssd-api.jpl.nasa.gov/doc/) requires sequential, reasonably necessary API calls, caching and an identifying User-Agent. The browser loads only the published static snapshot.

Refresh explicitly with `mac-studio/run_all.sh --smallbodies`. Raw JPL responses are cached in `~/cosmic-atlas-catalogs/jpl-smallbodies`; rebuilding from this cache preserves retrieval timestamps. To request revised orbital solutions, move that source cache aside before an explicit refresh. Failed validation never replaces the previous ephemeris snapshot.
