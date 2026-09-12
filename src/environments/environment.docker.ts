/** Docker: nginx serves the bundle and reverse-proxies /euclid, see docker/nginx.conf. */
export const environment = {
    production: true,
    name: 'docker',
    euclidEndpoint: '/euclid',
};
