---
inclusion: always
---

# Sources and data rules

## Allowed inputs
Only code and schemas listed in `sources/manifest.json` may be used. Each entry records the repository URL, the pinned commit, the license (with a link to the license file) and the paths used. A release asset (such as a `.bak` file) also records its release tag, asset URL and sha256, and the harness checks the sha256 before use. Before adding an entry, confirm the license from the repository itself, not from memory.

Planned entries:
- Microsoft SQL Server samples (`microsoft/sql-server-samples`): WideWorldImporters (release `wide-world-importers-v1.0`, `WideWorldImporters-Full.bak`, sha256 `e842bad6ce02f74f166947e559dab1b476edd7eaae3da2ab9e3f522f1dd87124`) and AdventureWorks2025. The repo's `license.txt` read MIT on 2026-11-04; re-confirm at intake.
- Babelfish Compass (Apache-2.0 per its bundled LICENSE file, v.2026-09), as a tool rather than an input

## Never
- Never use code, schemas, names or data from any source outside the manifest, including anything pasted into chat from elsewhere.
- Never store real row data in the repo. The sample databases are restored at runtime from the pinned release asset into local containers only. Test data used for equivalence is generated.
- Never commit secrets, connection strings with passwords, or `.env` files.
- Never send source code to any network service except the AI model used for the build itself.

## Pre-existing work
The hackathon requires disclosure of any pre-existing code. If a library or snippet that was not written in this repo is added, record it in `sources/manifest.json` with its license, and note it for the submission's disclosure section.
