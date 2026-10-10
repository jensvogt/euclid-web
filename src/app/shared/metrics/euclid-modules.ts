/**
 * One thing a module keeps, as its dashboard counts and links to it.
 *
 * The action and the field rather than a service method, because the dashboard asks every module the
 * same question - how many of these are there - and euclid answers it the same way everywhere: a listing
 * with a `total` beside the items. One generic count beats ten services injected into one page.
 */
export interface ModuleResource {
    label: string;
    /** The list view, where there is one. A resource with no page is counted and not linked. */
    route?: string;
    action: string;
    /** What euclid names the array in its answer - `buckets`, `userGroups` - since it is never `items`. */
    field: string;
    /**
     * Whether the listing is paged at the server.
     *
     * A paged one is asked for a single row and read for its `total`; the handful of modules that answer
     * with everything at once are counted by the length of what comes back. EAP and EAG do that
     * deliberately - an installation has tens of applications and routes, not thousands.
     */
    paged: boolean;
    /** Whether the action is scoped to an account, which only EAM's namespaces are. */
    perAccount?: boolean;
}

/** One euclid module, as the UI refers to it. */
export interface EuclidModule {
    target: string;
    label: string;
    /**
     * Where the module opens: its main list view, which is where the modules tile and the monitoring
     * page send you.
     *
     * The list rather than a dashboard of its own, because every list view carries the module's figures
     * and the way into its other lists above it - see {@link ModuleStatsComponent}. A separate page of
     * counts in front of that was one click between somebody and the thing they came for.
     *
     * Absent for a module with no list view at all, which EMM is: the registry is what EMM holds, and
     * there is no page of it yet.
     */
    route?: string;
    /** What it holds, in the order its dashboard shows them. */
    resources: ModuleResource[];
}

/**
 * The modules this UI covers, in the order the dashboard lists them.
 *
 * Top level only. What each module keeps is in its {@link EuclidModule.resources} and shows on its own
 * dashboard, which is the whole point of having one: the main dashboard names ten things rather than the
 * twenty-odd lists beneath them.
 *
 * EES is absent because euclid itself has still to ship it.
 */
export const EUCLID_MODULES: EuclidModule[] = [
    {
        target: 'eam',
        label: 'Access Management (EAM)',
        route: '/eam-user-list',
        resources: [
            {label: 'Users', route: '/eam-user-list', action: 'list-users', field: 'users', paged: true},
            {label: 'User groups', route: '/eam-group-list', action: 'list-user-groups', field: 'userGroups', paged: true},
            {label: 'Accounts', route: '/eam-account-list', action: 'list-accounts', field: 'accounts', paged: true},
            {
                label: 'Namespaces',
                route: '/eam-namespace-list',
                action: 'list-namespaces',
                field: 'namespaces',
                paged: true,
                perAccount: true,
            },
            {label: 'Access keys', route: '/eam-access-key-list', action: 'list-access-keys', field: 'accessKeys', paged: false},
        ],
    },
    {
        target: 'esm',
        label: 'Storage (ESM)',
        route: '/esm-bucket-list',
        resources: [
            {label: 'Buckets', route: '/esm-bucket-list', action: 'list-buckets', field: 'buckets', paged: true},
        ],
    },
    {
        target: 'eqs',
        label: 'Queues (EQS)',
        route: '/eqs-queue-list',
        resources: [
            {label: 'Queues', route: '/eqs-queue-list', action: 'list-queues', field: 'queues', paged: true},
        ],
    },
    {
        target: 'ens',
        label: 'Notifications (ENS)',
        route: '/ens-topic-list',
        resources: [
            {label: 'Topics', route: '/ens-topic-list', action: 'list-topics', field: 'topics', paged: true},
        ],
    },
    {
        target: 'ekm',
        label: 'Key Management (EKM)',
        route: '/ekm-key-list',
        resources: [
            {label: 'Keys', route: '/ekm-key-list', action: 'list-keys', field: 'keys', paged: true},
            {label: 'Certificates', route: '/ekm-certificate-list', action: 'list-certificates', field: 'certificates', paged: true},
        ],
    },
    {
        target: 'ekv',
        label: 'Tables (EKV)',
        route: '/ekv-table-list',
        resources: [
            {label: 'Tables', route: '/ekv-table-list', action: 'list-tables', field: 'tables', paged: true},
        ],
    },
    {
        target: 'eap',
        label: 'Applications (EAP)',
        route: '/eap-application-list',
        resources: [
            {label: 'Applications', route: '/eap-application-list', action: 'list-applications', field: 'applications', paged: false},
            {label: 'Worker nodes', route: '/eap-node-list', action: 'list-nodes', field: 'nodes', paged: false},
        ],
    },
    {
        target: 'ess',
        label: 'Secrets (ESS)',
        route: '/ess-secret-list',
        resources: [
            {label: 'Secrets', route: '/ess-secret-list', action: 'list-secrets', field: 'secrets', paged: true},
        ],
    },
    {
        target: 'eag',
        label: 'API Gateway (EAG)',
        route: '/eag-route-list',
        resources: [
            {label: 'Routes', route: '/eag-route-list', action: 'list-routes', field: 'routes', paged: false},
            {label: 'Listeners', route: '/eag-listener-list', action: 'list-listeners', field: 'listeners', paged: true},
        ],
    },
    {
        target: 'ets',
        label: 'Transfer Servers (ETS)',
        route: '/ets-server-list',
        resources: [
            {label: 'Transfer servers', route: '/ets-server-list', action: 'list-servers', field: 'servers', paged: false},
        ],
    },
    {
        // No list view yet: the registry is counted and the modules themselves are read from the status
        // panel above it. A page for starting, stopping and scaling them is EMM's to gain next.
        target: 'emm',
        label: 'Module Registry (EMM)',
        resources: [
            {label: 'Modules', action: 'list-modules', field: 'modules', paged: false},
        ],
    },
];

/** One module by target, for a route that carries the target as a parameter. */
export function moduleOf(target: string): EuclidModule | undefined {
    return EUCLID_MODULES.find(module => module.target === target);
}

/** The page above every module: what the back button on a module's own list view goes to. */
export const DASHBOARD_ROUTE = '/dashboard';

/**
 * The resource whose list view a page belongs under, and the module that owns it.
 *
 * By prefix, because what a list view shows is not the only thing under its route: a bucket's objects
 * and one object's details are both `/esm-bucket-list/...`, and all three pages are about ESM. The
 * longest matching resource wins, so a route that happens to begin with another one cannot claim it.
 */
function matchRoute(url: string): {module: EuclidModule; route: string} | undefined {
    const path = url.split(/[?#]/)[0];

    let found: {module: EuclidModule; route: string} | undefined;
    for (const module of EUCLID_MODULES) {
        for (const resource of module.resources) {
            const route = resource.route;
            if (!route || route.length <= (found?.route.length ?? 0)) {
                continue;
            }
            if (path === route || path.startsWith(`${route}/`)) {
                found = {module: module, route: route};
            }
        }
    }
    return found;
}

/** Which module a page belongs to, worked out from its URL. */
export function moduleOfRoute(url: string): EuclidModule | undefined {
    return matchRoute(url)?.module;
}

/**
 * The page one level above this one.
 *
 * A level is what the routes already say, so this needs no table of its own. A module's list view is
 * directly under the main dashboard, whatever was looked at on the way there - clicking users, then
 * groups, then accounts is three times across one level rather than three levels down, and a back button
 * that retraced it would be the browser's own. Under a list view sits `<kind>/<id>`, which is either one
 * of those things or a listing of what is inside it, and under that sits `<kind>/<id>/<id>` - one object
 * of a bucket, one message of a queue - whose level up is that listing.
 *
 * A page the registry says nothing about - the monitoring pages, anything new - is treated as sitting
 * directly under the dashboard, which is where it is reached from.
 */
export function parentRouteOf(url: string): string {
    const path = url.split(/[?#]/)[0];
    const matched = matchRoute(path);
    if (!matched || path === matched.route) {
        return DASHBOARD_ROUTE;
    }

    const rest = path.slice(matched.route.length).split('/').filter(segment => segment !== '');
    return rest.length > 2
        ? `${matched.route}/${rest.slice(0, rest.length - 1).join('/')}`
        : matched.route;
}
