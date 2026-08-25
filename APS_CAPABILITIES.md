# APS capabilities — test project

Updated: 2026-08-19

The Phase 2 inspector probes a maximum of 10 preview records from each source.
Results are intentionally not mocked and are shown independently in the UI.

| Source | Endpoint family | Test result |
|---|---|---|
| Documents | Data Management v1 | Pending live project probe |
| Issues | Construction Issues v1 | Pending live project probe |
| Assets | BIM 360/Forma Assets v2 | Pending live project probe |
| Forms | Construction Forms v2 | Pending live project probe |
| People | Construction Admin v1 | Pending live project probe |

The inspector distinguishes successful data, successful empty responses, HTTP
403 permission limitations, HTTP 404/405/501 unsupported states, and other APS
errors. This file must be updated with the observed states from the selected
Forma project before Phase 2 is accepted.
