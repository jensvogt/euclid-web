# euclid-web

An Angular admin UI for the [euclid](https://github.com/jensvogt/euclid) server, laid out like
[awsmock-ui](https://github.com/jensvogt/awsmock-ui): the same blue toolbar with a module jump box, the same
dashboard of navigation cards, and the same list views - a card header with the count and its action icons, a
prefix box, a sortable Material table, a paginator, and a footer saying when the figures were read.

Nine modules so far, which is what euclid-ndk wraps. EAM (access management), ESM (storage), EQS (queues), ENS
(notifications), EKM (keys), EKV (tables), EAP (applications), ESS (secrets) and EAG (the API gateway). EES and
ETS speak the same protocol over the same gateway and will follow.

## Running it

```bash
npm install
npm start
```

That serves the UI on `http://localhost:4200` and proxies `/euclid` to a gateway on `http://localhost:5566` -
euclid's default HTTP port. Point it elsewhere by editing `proxy.conf.json`.

Then sign in with a euclid user. The login is `eam:login`, one of the gateway's public actions, and the
namespace field on the form is the scope everything afterwards is read under - empty being the account root,
which is a scope like any other rather than "all of them".

## How it talks to euclid

There is no backend of its own. The browser speaks euclid's wire protocol directly: one POST to the gateway
root per call, with the module in `x-euclid-target`, the operation in `x-euclid-action`, and the account, region,
user and namespace in the other `x-euclid-*` headers. `src/app/services/euclid-http.service.ts` is the whole of
it, and a module service on top of that spells out its own actions - the same shape euclid-ndk's `ModuleClient`
has for node.

Two consequences of being a browser are worth knowing about, because both are visible in the code.

**It authenticates with a bearer token, not a signature.** euclid accepts either for every action -
`HttpActionServer::Authenticate` takes a SigV4 or RFC 9421 signature or an `Authorization: Bearer` token - but
only one of the two is available here. Both signing schemes cover the `host` header (SigV4 signs it; RFC 9421
derives `@authority` from it), and `Host` is a forbidden header in the browser: the fetch layer sets it and
script can neither read nor write it. A signature made over a guess at what the browser will send is a
signature that fails to verify for reasons the UI cannot see. So the token it is, the secret access key a login
returns is dropped rather than stored, and the access key page exists to hand a secret to a program that *can*
sign - euclid-cli, euclid-ndk, euclid-jdk.

**The gateway must be same-origin.** euclid's CORS allows `Content-Type`, `Authorization` and
`X-Requested-With`, and nothing else; a cross-origin preflight for the `x-euclid-*` headers is refused, and a
preflight does not carry them for the gateway to route on either. `environment.euclidEndpoint` is therefore a
path (`/euclid`) rather than a URL, and what stands behind that path is `proxy.conf.json` in development and
nginx in a container. This is why the Backend dialog shows the endpoint instead of letting you type one.

Nothing here depends on that staying true. If euclid's gateway grows an `Access-Control-Allow-Headers` that
includes the `x-euclid-*` set and answers a preflight before `detectEuclidService`, then pointing
`euclidEndpoint` at an absolute URL is the only change needed.

### Where the types come from

The item shapes - `Queue`, `Bucket`, `Topic`, `Key` and the rest - are imported from `euclid-ndk` with
`import type`. They are the shapes the server already answers with, so restating them here would only be a
second place for them to drift. `import type` is erased at compile time, so none of that Node-only package
(`node:http`, `node:crypto`, `node:tls`) reaches the bundle.

## Layout

```
src/app/
  services/
    euclid-http.service.ts      the protocol: POST + x-euclid-target/action, and paging
    euclid-session.service.ts   login, the bearer token, and the identity every call carries
    auth.guard.ts               keeps the module views behind a login
  shared/
    list/                       the generic paged list - see below
    metrics/                    one monitoring page, nine modules
    footer, spinner, autoreload, confirm, resource-add
  modules/
    eam, esm, eqs, ens, ekm, ekv, eap, ess, eag
      <module>.routes.ts        lazy routes, with the module's store slices provided at the route
      service/                  the module's actions
      <thing>-list/             the view, and its store slice
    dashboard, login, not-found
```

### One list, twelve times

Every euclid listing is the same listing - a prefix, a page, a sort column, and an answer of
`{total, <things>}` - so the paging, sorting, prefix box, auto-reload, confirmation and create dialogs live in
one place rather than twelve:

- `shared/list/list-feature.ts` builds a feature's actions, reducer, selectors and load effect from a feature
  key and a default sort. `createListEffect` takes the module's own listing call.
- `shared/list/euclid-list.component.ts` is the base class each list view extends. A subclass declares its
  feature and its columns, writes a template, and adds the actions in its row menu.

That is the one deliberate departure from awsmock-ui's structure, which writes four state files per list.
awsmock-ui has to: each of its AWS services answers differently. euclid does not, and twelve copies of
identical boilerplate would only be twelve chances to get one of them subtly wrong. What is genuinely per
module - the columns, the row actions, the create dialog's fields - stays per module.

The views that list *into* a resource (a queue's messages, a bucket's objects) use the same machinery with the
parent's ERN carried on the load action; see `ListQueryProps.parent`.

### Monitoring

`HttpActionServer::MetricsResponse` answers `{items: [...]}` for every module, so there is one monitoring page
at `/metrics/:target` rather than nine chart components. euclid's monitoring hands out a reading rather than a
history, so the time series on that page is the one it has watched since you opened it - reloading starts it
again, which is honest: nothing was recorded while nobody was looking.

## Building

```bash
npm run build      # development
npm run build:prod # production, ~227 kB transferred
```

Each module is a lazy chunk, so the initial bundle is the shell plus whatever is opened.

## Docker

```bash
docker build -f docker/Dockerfile -t euclid-web .
docker run -p 8080:80 -e EUCLID_GATEWAY=http://euclid:5566 euclid-web
```

nginx serves the bundle and reverse-proxies `/euclid` to `EUCLID_GATEWAY`, substituted at container start so
one image serves every environment. The proxy's read timeout outlasts a long poll, because `receive-messages`
and `receive-events` hold their connection open for up to twenty seconds on purpose.

## Licence

Apache 2.0, as euclid and euclid-ndk are.
