import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {BehaviorSubject, map, Observable} from 'rxjs';

import {environment} from '../../environments/environment';

/**
 * What a euclid login produces, in the shape this UI keeps it.
 *
 * The same fields `~/.euclid/credentials` holds for euclid-cli, euclid-ndk, euclid-jdk and
 * euclid-pdk, minus `secretAccessKey`: a browser cannot use it. See {@link EuclidSessionService} for
 * why.
 */
export interface EuclidSession {
    token: string;
    userId: string;
    accountId: string;
    region: string;
    accessKeyId: string;
    isAdmin: boolean;
    namespace: string;
}

/** The shape `eam:login` answers with. */
interface LoginResponse {
    token?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    isAdmin?: boolean;
    metadata?: { user?: string; accountId?: string; region?: string };
}

const SESSION_KEY = 'euclid.session';

/**
 * The logged-in session: the bearer token and the identity every request is made under.
 *
 * **Why a bearer token and not a signature.** euclid accepts either - `HttpActionServer::Authenticate`
 * takes a SigV4 or RFC 9421 signature, or an `Authorization: Bearer` token, for every action - but only
 * one of the two is available here. Both signing schemes cover the `host` header (SigV4 signs it
 * directly, RFC 9421 derives `@authority` from it), and `Host` is a forbidden header in the browser: the
 * fetch layer sets it and script can neither read nor write it. A signature made over a guess at what
 * the browser will send is a signature that fails to verify for reasons the UI cannot see. The token
 * has no such problem, so this is the one credential a browser can present - which is also why the
 * secret access key is dropped on the floor rather than stored.
 *
 * **Where it is kept.** `sessionStorage`, not `localStorage`: a bearer token is a credential, and one
 * scoped to the tab that obtained it outlives a reload without outliving the browser. Settings that are
 * not credentials - the namespace, the auto-reload period - live in `localStorage`, as in awsmock-ui.
 */
@Injectable({providedIn: 'root'})
export class EuclidSessionService {

    /** The current session, for anything that should re-render when the login changes. */
    readonly session$: BehaviorSubject<EuclidSession | null>;

    private readonly url: string = environment.euclidEndpoint + '/';

    constructor(private readonly http: HttpClient) {
        this.session$ = new BehaviorSubject<EuclidSession | null>(this.restore());
    }

    /** The current session, or null when nobody is logged in. */
    get session(): EuclidSession | null {
        return this.session$.value;
    }

    /** Whether there is a session whose token has not expired. */
    get loggedIn(): boolean {
        const session = this.session;
        return session !== null && isTokenValid(session.token);
    }

    /**
     * How long this session has left, in seconds. Zero when there is none, or it has already gone.
     *
     * Worth asking before something that takes a while: a token is valid for as long as it is valid
     * whatever is in flight, and an upload of a few thousand parts can outlive one. Nothing here renews
     * it - only {@link login} does, and only with a password.
     */
    get secondsLeft(): number {
        const expiry = expiryOf(this.session?.token ?? '');
        return expiry === null ? 0 : Math.max(0, Math.round(expiry - Date.now() / 1000));
    }

    /** The namespace every namespace-scoped call is restricted to. Empty means the account root. */
    get namespace(): string {
        return this.session?.namespace ?? '';
    }

    /**
     * Authenticates against EAM and keeps the session.
     *
     * `eam:login` is one of the gateway's public actions, so this is the one call that goes out with no
     * credentials on it. The server resolves the user by ID first and only falls back to the email, so
     * exactly one of the two identifies the account - sending both would silently ignore the email.
     */
    login(userId: string, password: string, email = ''): Observable<EuclidSession> {
        const headers = new HttpHeaders({
            'Content-Type': 'application/json',
            'x-euclid-target': 'eam',
            'x-euclid-action': 'login',
        });
        const body = {userId: userId, password: password, email: userId ? '' : email};

        return this.http.post<LoginResponse>(this.url, body, {headers: headers}).pipe(
            map((response: LoginResponse) => {
                const session: EuclidSession = {
                    token: response.token ?? '',
                    userId: response.metadata?.user ?? userId,
                    accountId: response.metadata?.accountId ?? '',
                    region: response.metadata?.region ?? '',
                    accessKeyId: response.accessKeyId ?? '',
                    isAdmin: response.isAdmin ?? false,
                    namespace: localStorage.getItem('namespace') ?? '',
                };
                this.store(session);
                return session;
            }),
        );
    }

    /**
     * Logs in again as whoever this session is for.
     *
     * The one way back from an expired token: euclid has no refresh action, and this UI holds nothing it
     * could re-authenticate with by itself - the password is not kept and the secret access key is
     * dropped at login. So the password is asked for again, and everything else about the session - the
     * user, the namespace - carries over.
     */
    reLogin(password: string): Observable<EuclidSession> {
        return this.login(this.session?.userId ?? '', password);
    }

    /** Forgets the session. The token stays valid at the server until it expires. */
    logout(): void {
        sessionStorage.removeItem(SESSION_KEY);
        this.session$.next(null);
    }

    /**
     * Records the namespace the session has switched to.
     *
     * Only the local half: the server validates a namespace against the account and the caller's
     * grants, so the `change-namespace` round trip belongs to the EAM service, which calls this once
     * the server has agreed.
     */
    setNamespace(namespace: string): void {
        localStorage.setItem('namespace', namespace);
        const session = this.session;
        if (session !== null) {
            this.store({...session, namespace: namespace});
        }
    }

    /**
     * Who is asking, what they are scoped to, and the token that says so.
     *
     * The `x-euclid-*` headers are where euclid carries what AWS would put in the URI, so they travel on
     * every request rather than only on the ones that look like they need them.
     */
    requestHeaders(target: string, action: string): HttpHeaders {
        const session = this.session;
        let headers = new HttpHeaders({
            'Content-Type': 'application/json',
            'x-euclid-target': target,
            'x-euclid-action': action,
        });
        if (session === null) {
            return headers;
        }
        headers = headers.set('Authorization', 'Bearer ' + session.token);
        if (session.region) {
            headers = headers.set('x-euclid-region', session.region);
        }
        if (session.accountId) {
            headers = headers.set('x-euclid-account-id', session.accountId);
        }
        if (session.userId) {
            headers = headers.set('x-euclid-user-id', session.userId);
        }
        if (session.namespace) {
            headers = headers.set('x-euclid-namespace', session.namespace);
        }
        return headers;
    }

    private store(session: EuclidSession): void {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        this.session$.next(session);
    }

    /** The stored session, if there is one and its token has not already expired. */
    private restore(): EuclidSession | null {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (!stored) {
            return null;
        }
        try {
            const session = JSON.parse(stored) as EuclidSession;
            return isTokenValid(session.token) ? session : null;
        } catch {
            return null;
        }
    }
}

/**
 * Whether a JWT's `exp` is still in the future.
 *
 * The same check euclid-ndk's `isTokenValid` makes, and for the same reason: a session whose token has
 * expired is worth less than no session at all, because it sends requests that come back 401. This does
 * not verify the signature - only the server holds the secret for that, and a client that lied to
 * itself here would only be refused a moment later.
 */
export function isTokenValid(token: string): boolean {
    const expiry = expiryOf(token);
    return expiry !== null && Date.now() / 1000 < expiry;
}

/** A JWT's `exp` as the seconds it holds, or null when there is not one to read. */
function expiryOf(token: string): number | null {
    const parts = token.split('.');
    if (parts.length < 2) {
        return null;
    }
    try {
        const payload = JSON.parse(decodeBase64Url(parts[1]));
        return typeof payload?.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

/** base64url to a UTF-8 string, which is what a JWT payload is encoded as. */
function decodeBase64Url(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}
