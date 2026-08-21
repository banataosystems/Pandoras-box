import {
  handleProjectOsMcp,
  projectOsMcpVercelConfig,
} from '../src/projectos-mcp-handler.js';
import { wrapMcpResultContract } from '../src/runtime/mcp-result-contract.js';

export const config = projectOsMcpVercelConfig;
export default wrapMcpResultContract(handleProjectOsMcp);
