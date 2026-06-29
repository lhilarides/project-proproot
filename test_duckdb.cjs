const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');

db.all("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; SELECT ST_AsGeoJSON(geometry::GEOMETRY) as geojson, * EXCLUDE(geometry) FROM read_parquet('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw_openstreetmap_country_boundaries_20250320.parquet') WHERE ST_Intersects(geometry::GEOMETRY, ST_GeomFromText('POLYGON((-70.0 12.0, -70.0 13.0, -69.0 13.0, -69.0 12.0, -70.0 12.0))')) LIMIT 1", function(err, res) {
  if (err) {
    console.error("DUCKDB ERROR:", err);
  } else {
    console.log("SUCCESS:", res);
  }
});
