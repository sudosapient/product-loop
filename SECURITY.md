# Security

Do not open a public issue for a suspected vulnerability or exposed credential.

Report security issues privately to `sabari@sudosapient.com`. Include the affected version, reproduction steps, expected impact, and any suggested mitigation. Sudo Sapient will acknowledge a valid report and coordinate disclosure after a fix is available.

Product Loop stores proxy credentials locally in an owner-only configuration file. Credentials, generated runtime state, subagent artifacts, and product logs must never be committed to a repository.
