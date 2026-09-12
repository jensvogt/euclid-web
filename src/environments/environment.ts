/**
 * The default environment, which is what `ng build` uses when no configuration is named.
 *
 * `euclidEndpoint` is a path rather than a URL on purpose: every euclid call this UI makes is a POST
 * to the gateway carrying `x-euclid-target` and `x-euclid-action` headers, and the gateway answers a
 * cross-origin preflight for those headers with a 404 - it only allows `Content-Type`,
 * `Authorization` and `X-Requested-With`. A same-origin path avoids the preflight entirely; what
 * puts the gateway behind that path is `proxy.conf.json` in development and nginx in a container.
 */
export const environment = {
    production: false,
    name: 'default',
    euclidEndpoint: '/euclid',
};
