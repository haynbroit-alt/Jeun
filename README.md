# Jeun

Dépôt du projet Jeun. L'outil publié ici s'appelle **MULTIVERSE** : il synchronise les VOD YouTube et Twitch d'un même événement (RP, SMP ou tournoi) sur une horloge commune.

| Contenu | Description |
|---|---|
| [`etude-opportunites-15-33.md`](etude-opportunites-15-33.md) | Étude de marché : tendances, besoins non couverts, concepts notés. Les chiffres d'audience qui y figurent sont des hypothèses, pas des mesures. |
| [`multiverse/`](multiverse/) | **MULTIVERSE** : l'outil en ligne. |

## MULTIVERSE en ligne

- Application : [https://haynbroit-alt.github.io/Jeun/](https://haynbroit-alt.github.io/Jeun/)
- Exemple prêt à l'emploi, MCC Pride 2026 (3 VOD publiques vérifiées) : [ouvrir l'exemple](https://haynbroit-alt.github.io/Jeun/#s=eyJ0IjoiTUNDIFByaWRlIDIwMjYiLCJwIjpbWyJ5b3V0dWJlIiwiWG1GYVFwejBUb2siLCJDb21tZW50YWlyZSBvZmZpY2llbCIsMTc4MjU4NDY3OTAwMCwxMzQwNl0sWyJ5b3V0dWJlIiwidFRuYkY2LVNqVUkiLCJJblRoZUxpdHRsZVdvb2QiLDE3ODI1ODU1MDIwMDAsMTI4ODhdLFsieW91dHViZSIsImNDSEpzWGFUUHhFIiwiam9qb3NvbG9zIiwxNzgyNTg2OTA3MDAwLDExMjc3XV0sIm0iOltbMTc4MjU4NjgwMDAwMCwiRMOpYnV0IGR1IHRvdXJub2kiXV19)

L'adresse du dépôt et du site (`haynbroit-alt.github.io/Jeun`) ne change pas.

## Test de 7 jours

Avant de conclure, le seuil fixé à l'avance est : **au moins 30 visiteurs inconnus**, et **au moins 3 liens créés par d'autres que nous**. En dessous, on arrête.

Le compteur de visites prévu est GoatCounter (gratuit, sans cookies). Il n'est pas encore actif : il faut un compte gratuit (sous-domaine + e-mail). Sans ce compte, le test de 7 jours ne peut pas être mesuré.

## Mentions légales

Éditeur : NOVARYS. Contact : lhssncharfa-pvzmfe@mail.grokbot.com. Hébergeur : GitHub Pages (GitHub, Inc.).

## Développement

```bash
cd multiverse
python3 -m http.server 8000   # http://localhost:8000
npm test                      # tests unitaires
npm run e2e                   # test navigateur (Playwright, lecteurs simulés)
```
