# Self-hosting Ketcher

Exam Vault bundles Ketcher into the Next.js deployment. The student chemistry editor does not use a hosted Ketcher iframe or send structures to an external Ketcher service. No Ketcher API key is required.

## Current setup

The app pins the three Apache-2.0 Ketcher packages used by `components/exam/ketcher-workspace.tsx`:

```bash
npm install --save-exact ketcher-core@3.15.0 ketcher-react@3.15.0 ketcher-standalone@3.15.0
```

- `ketcher-react` supplies the editor UI.
- `ketcher-core` supplies the structure model and browser API.
- `ketcher-standalone` performs structure operations in the browser without an Indigo server.

Next.js includes these packages in the normal production build. Deploy the website as usual after running `npm run build`; no separate Ketcher server, container, API key, or DNS entry is required.

## Enabling it for an exam

1. Create an Exam Session.
2. In **Built-in subject tools**, enable **Ketcher chemistry editor**.
3. Verify the session with a synthetic guest attempt before using it in a real exam.
4. The student can open Ketcher from **Subject tools**, copy a SMILES string into an answer, or export a MOL file.

The chemistry canvas is scratch work unless the question explicitly asks the student to paste SMILES or upload an exported file. Exam Vault does not silently treat an open Ketcher canvas as a submitted answer.

## Optional Indigo server

The current standalone integration intentionally avoids a server-side Indigo dependency. If advanced Indigo operations are later required, self-host the official Indigo service separately, keep it behind authenticated server routes, and replace `StandaloneStructServiceProvider` with a checked remote provider. Do not expose a privileged Indigo endpoint directly to public exam clients.

## Deployment checks

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Ketcher is a large editor bundle, so Exam Vault dynamically imports it only after an approved student opens the chemistry tool. Confirm that the production Content Security Policy still has no wildcard script or frame sources.
