const apiKey = Deno.env.get("MINERU_API_KEY");
const accountToken = Deno.env.get("MINERU_ACCOUNT_TOKEN");
const batchId = "e83d33f8-e598-4d62-9f5c-c153f7fc8c18"; // From user's logs

const headers: Record<string, string> = {
  "content-type": "application/json",
  "authorization": `Bearer ${apiKey}`,
};
if (accountToken) headers.token = accountToken;

async function check(url: string) {
  try {
    const res = await fetch(`https://mineru.net${url}`, { headers });
    const text = await res.text();
    console.log(`URL: ${url} -> Status: ${res.status}`);
    console.log(`Body: ${text.slice(0, 150)}`);
  } catch (err) {
    console.error(err);
  }
}

async function run() {
  await check(`/api/v4/extract/task/${batchId}`);
  await check(`/api/v4/extract-results/batch/${batchId}`);
  await check(`/api/v4/extract/result/batch?batch_id=${batchId}`);
}

run();
