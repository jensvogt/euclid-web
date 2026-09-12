/**
 * Development: `ng serve` proxies /euclid to the gateway, see proxy.conf.json.
 *
 * The gateway serves TLS on its HTTP port - euclid.json enables it by default - with a certificate the
 * installation generated, so the proxy targets https and does not verify it. The browser never sees that
 * connection; it only ever talks to the dev server on http://localhost:4200.
 */
export const environment = {
    production: false,
    name: 'dev',
    euclidEndpoint: '/euclid',
};
