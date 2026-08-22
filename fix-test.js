const fs = require('fs');
let content = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');

// Replace the buggy mock requirements
content = content.replace(/const exports = \{\}; const origReq = require; const mockReq = [^\n]+const require = mockReq; eval\(transpiled\); const handler = exports\.handleOwnerApiRequest;/g, 
  "const exports = {}; const mockReq = (id) => id.includes('owner-command-pipeline') ? require('../dist/projectos/owner-command-pipeline.js') : id.includes('broker-origin-validator') ? require('../dist/projectos/broker-origin-validator.js') : require(id); const handlerFn = new Function('exports', 'require', transpiled); handlerFn(exports, mockReq); const handler = exports.handleOwnerApiRequest;"
);

fs.writeFileSync('test/pandora-owner-api-route.test.js', content);
