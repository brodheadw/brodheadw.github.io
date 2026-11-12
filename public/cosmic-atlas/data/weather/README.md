# Dated weather visualization

`clouds.png` is NASA Terra/MODIS observed **daytime cloud fraction**, using the official NASA GIBS 0–100% color map. It is a quantitative color overlay, not a photograph of clouds or a forecast. `legend.png` and `colormap.xml` are NASA's published legend and mapping. Transparent pixels are unavailable observations, not clear sky.

The nominal product day, retrieval time, tile URLs and hashes, coverage and processing are in `status.json`. The observation does not follow the atlas simulation clock. Its freshness must be evaluated against real UTC. The default publisher selects the previous completed UTC date; daily swath acquisition times differ from nominal day labels.

Six EPSG:4326 WMTS level-1 tiles are mosaicked without color or alpha conversion and cropped to longitude −180…180°, latitude −90…90°. Output is 1280×640, 0.28125° per display pixel (~31.3 km at the equator). This display spacing does not describe the native instrument footprint. North is the top row and east is right. The source's `2km` tile-matrix name is retained in the request URLs.

Source: [NASA GIBS API documentation](https://nasa-gibs.github.io/gibs-api-docs/access-basics/), [Terra cloud-fraction browse product](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/MOBCFR_C00), [official palette](https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Cloud_Fraction.xml).

Credit NASA Terra/MODIS and NASA EOSDIS GIBS. Reuse follows [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/); NASA endorsement is not implied. Image mosaic/cropping performed by Cosmic Atlas is recorded in metadata.

Refresh explicitly with `mac-studio/run_all.sh --weather`, using the catalog Python environment with Pillow. The publisher skips already cached data days, makes no automatic retry, and retains the previous dated image on error.

The six-hour `satellite-data` workflow installs Pillow 13.0.0 and refreshes weather independently of the satellite step. It publishes both directories before reporting either refresh failure. The trusted raw-branch status URL is recorded in `status.json` and restored by the publisher, including cached and failed refreshes.
