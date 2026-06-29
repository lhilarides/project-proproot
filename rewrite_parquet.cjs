const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
db.run("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; COPY (SELECT * FROM read_parquet('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw_openstreetmap_country_boundaries_20250320.parquet')) TO 'gmw_openstreetmap_country_boundaries_20250320_fixed.parquet' (FORMAT 'parquet');", (err) => {
  if (err) console.error(err);
  else console.log('Done rewriting parquet without spatial metadata!');
});
