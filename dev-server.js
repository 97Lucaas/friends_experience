const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8" };

http.createServer((req, res) => {
  const file = path.join(root, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(4173, "127.0.0.1");
