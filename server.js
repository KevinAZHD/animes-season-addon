const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 7000;

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Serve files
    let requestPath = decodeURIComponent(req.url);
    let filePath = '';
    if (requestPath === '/' || requestPath === '/manifest.json') {
        filePath = path.join(__dirname, 'manifest.json');
    } else {
        filePath = path.join(__dirname, requestPath);
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error(`File not found: ${filePath}`);
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        } else {
            console.log(`Served: ${requestPath}`);
            res.writeHead(200);
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Local Stremio Addon Server running at:`);
    console.log(`👉 http://localhost:${PORT}/manifest.json\n`);
    console.log(`Paste the link above in Stremio search bar to install/test!`);
});
