# ifa-board

> **Eingestellt.** playerboard ist als Modul *PlayerBoard* in [Vereinsfunk](https://github.com/haexor/vereinsfunk) aufgegangen: Kader, Trainingspunkte, Ranglisten, Fotos und die Veo-Anbindung (Pläne 052 und 053 dort). Dieses Repository ist archiviert und wird nicht mehr weiterentwickelt; playerboard.de leitet auf Vereinsfunk weiter. Die letzten Produktionsdaten liegen als Datenbank-Dump und Foto-Archiv auf haex.space unter `~/backups/playerboard`.

Internal points-and-photos tracker for a football team: trainers log training
points per player and category, players see rankings and photos.

## How to run

```bash
pnpm install
supabase start              # local Postgres + Auth + Studio + Inbucket
supabase db reset           # apply migrations + seed
pnpm gen:types              # generate app/types/database.ts
cp .env.example .env        # fill from `supabase start` output
pnpm dev                    # http://localhost:3000
```

Full setup, first-user signup, and test commands:
[specs/001-points-and-photos/quickstart.md](specs/001-points-and-photos/quickstart.md).

## Docs

- Feature spec: [specs/001-points-and-photos/spec.md](specs/001-points-and-photos/spec.md)
- Project principles: [.specify/memory/constitution.md](.specify/memory/constitution.md)
