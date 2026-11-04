---
inclusion: always
---

# Sources and data rules

## Allowed inputs
Only code and schemas listed in `sources/manifest.json` may be used. Each entry records the repository URL, the pinned commit, the license (with a link to the license file) and the paths used. Before adding an entry, confirm the license from the repository itself, not from memory.

Planned entries, each with its license still to be confirmed at intake:
- Microsoft SQL Server samples: WideWorldImporters, AdventureWorks
- Babelfish Compass (Apache-2.0), as a tool rather than an input

## Never
- Never use code, schemas, names or data from any source outside the manifest, including anything pasted into chat from elsewhere.
- Never store real row data. All test data is generated.
- Never commit secrets, connection strings with passwords, or `.env` files.
- Never send source code to any network service except the AI model used for the build itself.

## Pre-existing work
The hackathon requires disclosure of any pre-existing code. If a library or snippet that was not written in this repo is added, record it in `sources/manifest.json` with its license, and note it for the submission's disclosure section.
