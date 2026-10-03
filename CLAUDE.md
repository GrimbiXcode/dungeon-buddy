# Dungeon Buddy

## Branch-Workflow

- `main` = Produktion, `test` = Staging (Test-System).
- Neue Arbeit immer ab dem aktuellen `test` beginnen: `git fetch origin test && git checkout -b <feature-branch> origin/test`.
- Pull Requests von Feature-Branches gehen gegen `test`, nie gegen `main`.
- Nie direkt auf `main` oder `test` pushen.
- `test` wird erst nach Deployment auf dem Test-System **und ausdrücklicher Freigabe durch den Benutzer** per Pull Request in `main` gemergt. Diesen PR nie eigenmächtig erstellen oder mergen.

Details: README, Abschnitt „Branches und Releases“.
