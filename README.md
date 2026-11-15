# Jeun

Produits numériques pour les 15–33 ans : gaming, streaming, communautés en ligne.

| Contenu | Description |
|---|---|
| [`etude-opportunites-15-33.md`](etude-opportunites-15-33.md) | Étude de marché : tendances (GTA 6, GTA RP, Twitch, Kick, TikTok Live, Discord, UGC, IA, esport), besoins non couverts, 8 concepts notés, top 3 détaillé. |
| [`multiverse/`](multiverse/) | **MULTIVERSE** (concept n°1) : on suit une histoire RP, un SMP ou un événement à travers les POV de tous les streamers, synchronisés sur une seule horloge. |

## MULTIVERSE en ligne
Une fois GitHub Pages activé (Settings → Pages → Source : **GitHub Actions**), chaque modification de `multiverse/` sur `main` est publiée automatiquement à l'adresse `https://<compte>.github.io/Jeun/`.

## Développement
```bash
cd multiverse
python3 -m http.server 8000   # http://localhost:8000
npm test                      # tests unitaires
npm run e2e                   # test navigateur (Playwright, lecteurs simulés)
```
