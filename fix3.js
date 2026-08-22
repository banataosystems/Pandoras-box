const fs = require('fs');
let c = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');
c = c.replace(/const fs = require\('node:fs'\);\r?\n/, "");
c = c.replace(/const path = require\('node:path'\);\r?\n/, "");
c = c.replace(/const ts = require\('typescript'\);\r?\n/, "");
fs.writeFileSync('test/pandora-owner-api-route.test.js', c);
