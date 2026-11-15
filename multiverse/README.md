# MULTIVERSE (MVP)

Outil du dépôt Jeun. Une histoire, tous les points de vue. MULTIVERSE aligne les VOD de plusieurs streamers (Twitch ou YouTube) sur **une horloge réelle commune**. On change de POV en un clic et on reste au même instant de l'histoire. C'est fait pour le GTA RP, les SMP Minecraft et les événements entre créateurs.

## Fonctionnalités
- Ajout de VOD Twitch (`/videos/…`) ou YouTube, avec l'heure réelle de début de chaque VOD.
- Timeline commune : on choisit un instant de l'histoire, et l'outil passe au POV qui le couvre.
- Bascule de POV en restant synchronisé. Les POV « hors champ » (pas encore commencés ou déjà finis) sont grisés.
- Calage fin avec −1s / +1s par POV. La durée réelle de chaque VOD est relevée automatiquement pendant la lecture.
- Utilisable au clavier : chaque POV et chaque outil est un vrai bouton.
- Moments clés posés sur la timeline.
- **Lien partageable** : tout l'état est encodé dans l'URL (`#s=…`). Pas de serveur ni de compte.
- Lecteurs officiels uniquement (embeds) : aucune vidéo n'est ré-hébergée.

## Lancer en local
```bash
cd multiverse
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
npm test                      # tests unitaires de la logique de synchronisation
npm run e2e                   # test navigateur de bout en bout (lecteurs Twitch/YouTube simulés, Playwright)
```
Le lecteur Twitch exige d'être servi en HTTP(S) depuis un domaine déclaré : `file://` ne marche pas. Pour mettre l'app en ligne, GitHub Pages, Netlify ou Cloudflare Pages suffisent : ce ne sont que des fichiers statiques.

## Prochaines étapes (voir `../etude-opportunites-15-33.md`)
1. Résumés IA « previously on » par session, qui demandent un petit backend.
2. Détection automatique des pics « 🔥 ça chauffe ici » à partir des clips et de l'activité du chat (API Twitch).
3. Pages d'événement « officielles » pour les serveurs RP (offre B2B).
4. Calage automatique des VOD par corrélation audio.

## Exemple en ligne
Un lien d'exemple aligne trois VOD publiques de **MCC Pride 2026** (27 juin 2026) : le commentaire officiel, le POV d'InTheLittleWood et celui de jojosolos. Les heures de début viennent des métadonnées publiques des directs YouTube.

[Ouvrir l'exemple](https://haynbroit-alt.github.io/Jeun/#s=eyJ0IjoiTUNDIFByaWRlIDIwMjYiLCJwIjpbWyJ5b3V0dWJlIiwiWG1GYVFwejBUb2siLCJDb21tZW50YWlyZSBvZmZpY2llbCIsMTc4MjU4NDY3OTAwMCwxMzQwNl0sWyJ5b3V0dWJlIiwidFRuYkY2LVNqVUkiLCJJblRoZUxpdHRsZVdvb2QiLDE3ODI1ODU1MDIwMDAsMTI4ODhdLFsieW91dHViZSIsImNDSEpzWGFUUHhFIiwiam9qb3NvbG9zIiwxNzgyNTg2OTA3MDAwLDExMjc3XV0sIm0iOltbMTc4MjU4NjgwMDAwMCwiRMOpYnV0IGR1IHRvdXJub2kiXV19)
