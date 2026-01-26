
const urls = [
    'https://rycybwjoasmrlaqrwjaq.supabase.co',
    'https://www.google.com',
    'https://api.supabase.com'
];

async function testConnection(url) {
    console.log(`Testing connection to ${url}...`);
    try {
        const start = Date.now();
        const res = await fetch(url, { method: 'HEAD' });
        const end = Date.now();
        console.log(`SUCCESS: ${url} responded in ${end - start}ms with status ${res.status}`);
    } catch (err) {
        console.error(`FAILURE: Failed to connect to ${url}`);
        console.error(err.cause || err);
    }
}

async function run() {
    for (const url of urls) {
        await testConnection(url);
    }
}

run();
