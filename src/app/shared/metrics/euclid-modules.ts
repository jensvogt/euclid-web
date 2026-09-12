/** One euclid module, as the UI refers to it. */
export interface EuclidModule {
    target: string;
    label: string;
    /** Where the module's own list view is, for the monitoring page's link back to it. */
    route: string;
}

/**
 * The nine modules this UI covers, in the order the dashboard lists them.
 *
 * EES and ETS speak the same protocol over the same gateway and will follow; euclid-ndk does not wrap them
 * yet either. Adding one is this list plus a module directory - nothing in the protocol layer changes.
 */
export const EUCLID_MODULES: EuclidModule[] = [
    {target: 'eam', label: 'Access Management (EAM)', route: '/eam-user-list'},
    {target: 'esm', label: 'Storage (ESM)', route: '/esm-bucket-list'},
    {target: 'eqs', label: 'Queues (EQS)', route: '/eqs-queue-list'},
    {target: 'ens', label: 'Notifications (ENS)', route: '/ens-topic-list'},
    {target: 'ekm', label: 'Key Management (EKM)', route: '/ekm-key-list'},
    {target: 'ekv', label: 'Tables (EKV)', route: '/ekv-table-list'},
    {target: 'eap', label: 'Applications (EAP)', route: '/eap-application-list'},
    {target: 'ess', label: 'Secrets (ESS)', route: '/ess-secret-list'},
    {target: 'eag', label: 'API Gateway (EAG)', route: '/eag-route-list'},
];

/** One module by target, for a route that carries the target as a parameter. */
export function moduleOf(target: string): EuclidModule | undefined {
    return EUCLID_MODULES.find(module => module.target === target);
}
