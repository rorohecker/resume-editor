# V1 Scope

This app intentionally stays local-first for V1.

## In Scope

- Local resume creation and editing.
- Template-based resume starts.
- Client-side import review and rule-based parsing for pasted text, TXT, and JSON.
- LocalStorage persistence, versions, snapshots, duplicate, delete, and JSON backup.
- Resume preview with style controls and browser-based export paths.
- Local heuristic resume assistance tools.

## Out of Scope For V1

- User accounts and cloud sync.
- Real-time collaboration.
- Mobile-native apps.
- Direct LinkedIn account import.
- Job application tracking.

The codebase keeps the data model and storage boundaries ready for future cloud sync, but no account or collaboration state is implemented in V1.
