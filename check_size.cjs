const https = require('https');
https.request('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw-alerts-latest.parquet', {method: 'HEAD'}, (res) => {
  console.log('Content-Length:', res.headers['content-length']);
}).end();
