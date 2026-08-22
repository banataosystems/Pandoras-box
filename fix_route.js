const fs = require('fs');
let content = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');
const header = "'use strict';\n\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst ts = require('typescript');\n\n";
const startIndex = content.indexOf('global.createTableMock =');
content = header + content.substring(startIndex);
fs.writeFileSync('test/pandora-owner-api-route.test.js', content);
