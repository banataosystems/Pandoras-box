const fs = require('fs');

let c = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');
const badLoadHandler = `function loadHandler() { const root = path.join(__dirname, '..'); const handlerSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/handler.ts'), 'utf8'); const contractSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/contract.ts'), 'utf8'); const transpiledHandler = ts.transpileModule(handlerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; const transpiledContract = ts.transpileModule(contractSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; const mockRequire = (id) => { if (id === './contract.ts' || id === './contract.js') { const contractExports = {}; eval("((exports) => {  })(contractExports)"); return contractExports; } if (id === '../../src/projectos/owner-command-pipeline.ts' || id.includes('owner-command-pipeline')) { return require('../dist/projectos/owner-command-pipeline.js'); } if (id === '../../src/projectos/broker-origin-validator.ts' || id.includes('broker-origin-validator')) { return require('../dist/projectos/broker-origin-validator.js'); } return require(id); }; const handlerExports = {}; eval("((exports, require) => {  })(handlerExports, mockRequire)"); return handlerExports.handleOwnerApiRequest; }`;

const goodLoadHandler = `function loadHandler() {
    const root = path.join(__dirname, '..');
    const handlerSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/handler.ts'), 'utf8');
    const stripped = handlerSource
      .replace(/import "jsr:.*?";/g, '')
      .replace(/import \\{ createClient \\} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
      .replace(/import\\s+\\{\\[\\s\\S\\]*?\\}\\s+from\\s+"\\.\\/contract\\.ts";/g, 'const allowedCorsOrigin = () => "*"; const parseAllowedOrigins = () => []; const normalizeOwnerRoute = (r) => r; const connectionActionAllowed = () => true; const ownerRiskLabel = (r) => r; const normalizeIntakeFingerprintPart = (s) => s; const isReleaseEvidenceType = () => false;')
      .replace(/import\\s+\\{\\s*executeOwnerCommand\\s*\\}\\s+from\\s+"\\.\\.\\/\\.\\.\\/src\\/projectos\\/owner-command-pipeline\\.ts";/g, 'const { executeOwnerCommand } = require("../dist/projectos/owner-command-pipeline.js");')
      .replace(/import\\s+\\{\\s*validateBrokerOrigin\\s*\\}\\s+from\\s+"\\.\\.\\/\\.\\.\\/src\\/projectos\\/broker-origin-validator\\.ts";/g, 'const { validateBrokerOrigin } = require("../dist/projectos/broker-origin-validator.js");');

    const transpiledHandler = ts.transpileModule(stripped, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exportsObj = {};
    const mockRequire = (id) => {
       if (id === '../../src/projectos/owner-command-pipeline.ts' || id.includes('owner-command-pipeline')) { return require('../dist/projectos/owner-command-pipeline.js'); }
       if (id === '../../src/projectos/broker-origin-validator.ts' || id.includes('broker-origin-validator')) { return require('../dist/projectos/broker-origin-validator.js'); }
       return require(id);
    };
    const handlerFn = new Function('exports', 'require', transpiledHandler);
    handlerFn(exportsObj, mockRequire);
    return exportsObj.handleOwnerApiRequest;
}`;

c = c.replace(badLoadHandler, goodLoadHandler);
fs.writeFileSync('test/pandora-owner-api-route.test.js', c);
