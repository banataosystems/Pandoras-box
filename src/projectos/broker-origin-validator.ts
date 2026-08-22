export function validateBrokerOrigin(originEnv: string | undefined): { valid: boolean; url?: URL; error?: string } {
  const brokerOriginEnv = originEnv || 'https://mcpmaster.vercel.app';
  let brokerUrl;
  try {
    brokerUrl = new URL(brokerOriginEnv);
  } catch (err) {
    return { valid: false, error: 'Invalid URL' };
  }
  if (brokerUrl.protocol !== 'https:') {
    return { valid: false, error: 'Broker origin must be HTTPS' };
  }
  if (brokerUrl.hostname !== 'mcpmaster.vercel.app' && brokerUrl.hostname !== 'localhost') {
    return { valid: false, error: 'Broker origin hostname is not in the canonical allowlist' };
  }
  if (brokerUrl.username || brokerUrl.password) {
    return { valid: false, error: 'Broker URL must not contain credentials' };
  }
  if (brokerUrl.search) {
    return { valid: false, error: 'Broker URL must not contain a query string' };
  }
  if (brokerUrl.hash) {
    return { valid: false, error: 'Broker URL must not contain a fragment' };
  }
  return { valid: true, url: brokerUrl };
}
