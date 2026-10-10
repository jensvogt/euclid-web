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
     * The module's own dashboard, which is where the modules tile and the monitoring page link back to.
     *
     * One route per module rather than one per list: a list is something inside a module, and sending
     * somebody to the user list when they asked for EAM hides the other four things EAM keeps.
     */
    route: string;
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
        route: '/module/eam',
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
        route: '/module/esm',
        resources: [
            {label: 'Buckets', route: '/esm-bucket-list', action: 'list-buckets', field: 'buckets', paged: true},
        ],
    },
    {
        target: 'eqs',
        label: 'Queues (EQS)',
        route: '/module/eqs',
        resources: [
            {label: 'Queues', route: '/eqs-queue-list', action: 'list-queues', field: 'queues', paged: true},
        ],
    },
    {
        target: 'ens',
        label: 'Notifications (ENS)',
        route: '/module/ens',
        resources: [
            {label: 'Topics', route: '/ens-topic-list', action: 'list-topics', field: 'topics', paged: true},
        ],
    },
    {
        target: 'ekm',
        label: 'Key Management (EKM)',
        route: '/module/ekm',
        resources: [
            {label: 'Keys', route: '/ekm-key-list', action: 'list-keys', field: 'keys', paged: true},
            {label: 'Certificates', route: '/ekm-certificate-list', action: 'list-certificates', field: 'certificates', paged: true},
        ],
    },
    {
        target: 'ekv',
        label: 'Tables (EKV)',
        route: '/module/ekv',
        resources: [
            {label: 'Tables', route: '/ekv-table-list', action: 'list-tables', field: 'tables', paged: true},
        ],
    },
    {
        target: 'eap',
        label: 'Applications (EAP)',
        route: '/module/eap',
        resources: [
            {label: 'Applications', route: '/eap-application-list', action: 'list-applications', field: 'applications', paged: false},
            {label: 'Worker nodes', route: '/eap-node-list', action: 'list-nodes', field: 'nodes', paged: false},
        ],
    },
    {
        target: 'ess',
        label: 'Secrets (ESS)',
        route: '/module/ess',
        resources: [
            {label: 'Secrets', route: '/ess-secret-list', action: 'list-secrets', field: 'secrets', paged: true},
        ],
    },
    {
        target: 'eag',
        label: 'API Gateway (EAG)',
        route: '/module/eag',
        resources: [
            {label: 'Routes', route: '/eag-route-list', action: 'list-routes', field: 'routes', paged: false},
            {label: 'Listeners', route: '/eag-listener-list', action: 'list-listeners', field: 'listeners', paged: true},
        ],
    },
    {
        target: 'ets',
        label: 'Transfer Servers (ETS)',
        route: '/module/ets',
        resources: [
            {label: 'Transfer servers', route: '/ets-server-list', action: 'list-servers', field: 'servers', paged: false},
        ],
    },
    {
        // No list view yet: the registry is counted and the modules themselves are read from the status
        // panel above it. A page for starting, stopping and scaling them is EMM's to gain next.
        target: 'emm',
        label: 'Module Registry (EMM)',
        route: '/module/emm',
        resources: [
            {label: 'Modules', action: 'list-modules', field: 'modules', paged: false},
        ],
    },
];

/** One module by target, for a route that carries the target as a parameter. */
export function moduleOf(target: string): EuclidModule | undefined {
    return EUCLID_MODULES.find(module => module.target === target);
}
