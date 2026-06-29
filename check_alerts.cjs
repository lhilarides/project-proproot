const duckdb = require('duckdb');

const db = new duckdb.Database(':memory:');
db.all(`
  INSTALL spatial;
  LOAD spatial;
  INSTALL httpfs;
  LOAD httpfs;
  DESCRIBE SELECT * FROM read_parquet('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw-alerts-latest.parquet') LIMIT 1;
`, (err, res) => {
  if (err) {
    console.error("Error describing parquet:", err);
  } else {
    console.log("Schema:", res);
  }
  
  db.all(`SELECT COUNT(*) as count FROM read_parquet('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw-alerts-latest.parquet')`, (err2, res2) => {
    if (err2) {
      console.error("Error counting:", err2);
    } else {
      console.log("Total Points:", res2);
    }
  });
});
