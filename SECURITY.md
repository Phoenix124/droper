# Security Policy

## Supported versions

Only the [latest release](../../releases/latest) receives security fixes.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through
[GitHub's private vulnerability reporting](../../security/advisories/new) instead.

Include what you found, how to reproduce it, and the impact you expect. You'll get a reply as
soon as possible, and a fix will be released before the details are made public.

## Scope

Areas that deserve particular attention:

- the `droper://` URL scheme (any web page can open these links)
- the global mouse hook and the native drag addon in `native/`
- IPC between the renderer pages and the main process
- clipboard history stored in the app's data folder

Release installers are not code-signed yet. Verify downloads against `SHA256SUMS.txt`
attached to each release.
