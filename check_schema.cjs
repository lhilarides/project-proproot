const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
db.all("SELECT * FROM read_parquet('gmw_openstreetmap_country_boundaries_20250320_fixed.parquet') LIMIT 1", (err, res) => {
  if (err) console.error(err);
  else console.log(Object.keys(res[0]));
});
