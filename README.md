# Global Mangrove Watch serverless API and Frontend MVP

This project is a proof-of-conecpt for a React-based web application providing dynamic spatial visualization and analytics for the Global Mangrove Watch (GMW) Version 4 dataset. It features interactive maps (MapLibre GL JS), timeline exploration of rasterdata (Cloud Optimized GeoTIFFs) and vectordata (Parquet/PMTiles) via STAC metadata, and in-browser analytical processing using DuckDB-WASM with a capability of taking subsets of data offline

## Architecture & Features
- **Frontend**: React, Vite, TypeScript, MapLibre GL JS
- **Offline PWA**: The application is an installable Progressive Web App (PWA) that fully supports offline usage.
- **Offline Datasets**: Users can seamlessly download partial raster and vector datasets to their device for use without an internet connection.
- **In-Browser Analytics**: DuckDB-WASM for processing `.parquet` data directly in the client.
- **Data Storage**: Google Cloud Storage (GCS) acting as a public data lake.

## Setup & Configuration

### 1. Cloud Infrastructure (Google Cloud Storage)
The application relies on a GCS bucket (`gmw-mvp-datalake-project-proproot`) to serve assets. It must be publicly readable and configured with permissive CORS.

* Use the scripts in the `infrastructure/` folder to set up the bucket.
* Apply CORS settings using the provided JSON:
  ```bash
  gcloud storage buckets update gs://gmw-mvp-datalake-project-proproot --cors-file=infrastructure/cors.json
  ```

### 2. Data Pipeline & STAC Metadata
The frontend dynamically reads COG metadata using the SpatioTemporal Asset Catalog (STAC) format.

* Upload your COGs (e.g. `gmw_mng_ext_*.tif`), PMTiles, and Parquet files to the GCS bucket.
* Install Python dependencies locally: `pip install requests pystac rasterio`
* Run the generation script: `python scripts/generate_stac.py`. This script reads the bucket and generates the STAC hierarchy.
* **Important:** Upload the completely generated `stac/` folder (including all nested subdirectories for individual years) to the root of your GCS bucket.

### 3. Frontend Development
* Install dependencies: `npm install`
* Start the local development server: `npm run dev`
* The application will run locally and stream data securely from the cloud datalake.
