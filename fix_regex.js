const fs = require('fs');
let c = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');
c = c.replace(/import\\s\+\\{\\[\\s\\S\\]\*\?\\}\\s\+from\\s\+"\\.\\/contract\\.ts";/g, 'import\\\\s+\\\\\\{[\\\\s\\\\S]*?\\\\\\}\\\\s+from\\\\s+\\\\"\\\\./contract\\\\.ts\\\\";');
fs.writeFileSync('test/pandora-owner-api-route.test.js', c);
