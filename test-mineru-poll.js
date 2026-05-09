import 'dotenv/config';
import fetch from 'node-fetch';

const apiKey = process.env.MINERU_API_KEY;
const accountToken = process.env.MINERU_ACCOUNT_TOKEN;
const batchId = process.argv[2] || "test-batch-id"; // We need the actual batchId.

const headers = {
  "content-type": "application/json",
  "authorization": `Bearer ${apiKey}`,
};
if (accountToken) headers.token = accountToken;

async function check(url) {
  try {
    const res = await fetch(`https://mineru.net${url}`, { headers });
    const text = await res.text();
    console.log(`URL: ${url} -> Status: ${res.status}`);
    console.log(`Body: ${text.slice(0, 100)}`);
  } catch (err) {
    console.error(err);
  }
}

async function run() {
  await check(`/api/v4/extract/task/batch/${batchId}`);
  await check(`/api/v4/extract/task/batch?batch_id=${batchId}`);
  await check(`/api/v4/extract/results/batch/${batchId}`);
  await check(`/api/v4/extract/result/batch?batch_id=${batchId}`);
  await check(`/api/v4/extract/result/${batchId}`);
}

run();
