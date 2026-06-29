import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let spatialLoaded = false;

export async function initDuckDB() {
  if (db) return db;

  try {
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    conn = await db.connect();
    
    // We intentionally delay loading the spatial extension
    // to bypass the duckdb-wasm GeoParquet metadata parsing bug.
    console.log("DuckDB initialized. Spatial engine ready for warmup.");
    return db;
  } catch (error) {
    console.error("Failed to initialize DuckDB:", error);
    throw error;
  }
}

export async function queryParquet(wktPolygon: string, parquetUrl: string) {
  if (!conn) throw new Error("DuckDB not initialized");

  // WARM UP WORKAROUND:
  // Querying the parquet file BEFORE the spatial extension is loaded forces DuckDB
  // to cache the standard parquet schema, bypassing the buggy GeoParquet parser
  // which crashes with "stoi: no conversion".
  if (!spatialLoaded) {
    console.log("Running DuckDB Warmup Query...");
    await conn.query(`SELECT 1 FROM read_parquet('${parquetUrl}') LIMIT 1`);
    console.log("Installing spatial extension...");
    await conn.query("INSTALL spatial; LOAD spatial;");
    spatialLoaded = true;
    console.log("Spatial extension loaded successfully after warmup!");
  }

  const query = `
    SELECT ST_AsGeoJSON(geometry::GEOMETRY) as geojson, * EXCLUDE(geometry)
    FROM read_parquet('${parquetUrl}')
    WHERE ST_Intersects(geometry::GEOMETRY, ST_GeomFromText('${wktPolygon}'));
  `;

  console.log("Executing Query:", query);
  const result = await conn.query(query);

  // Convert Apache Arrow Table to a standard GeoJSON FeatureCollection
  const features = result.toArray().map((row: any) => {
    const jsonRow = row.toJSON();
    const props: any = {};
    
    for (const key of Object.keys(jsonRow)) {
      if (key !== 'geojson') {
        const val = jsonRow[key];
        // Convert BigInt to Number or String to avoid JSON.stringify crash
        props[key] = typeof val === 'bigint' ? Number(val) : val;
      }
    }

    return {
      type: "Feature",
      geometry: JSON.parse(jsonRow.geojson),
      properties: props
    };
  });

  return {
    type: "FeatureCollection",
    features: features
  };
}

export async function getCountryList(): Promise<{ iso: string, name: string }[]> {
  const db = await initDuckDB();
  const conn = await db.connect();
  const parquetUrl = 'https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw_openstreetmap_country_boundaries_20250320_fixed.parquet';
  
  const query = `
    SELECT DISTINCT iso3cd, cntry_name 
    FROM read_parquet('${parquetUrl}')
    WHERE iso3cd IS NOT NULL AND cntry_name IS NOT NULL
    ORDER BY cntry_name ASC
  `;
  
  try {
    const result = await conn.query(query);
    return result.toArray().map((row: any) => ({
      iso: row.iso3cd,
      name: row.cntry_name
    }));
  } catch (e) {
    console.error("Failed to load country list from DuckDB", e);
    return [];
  } finally {
    await conn.close();
  }
}
