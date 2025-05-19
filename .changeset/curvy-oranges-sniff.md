---
"@badrap/valita": patch
---

feat: always normalize custom errors

Custom errors listed in issue lists (`ValitaError.issue` and `ValitaResult.issue`) are now always normalized to match the type `{ code: "custom_error", path: (string | number)[], message?: string | undefined }`.
