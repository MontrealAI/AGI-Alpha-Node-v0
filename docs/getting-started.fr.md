# Votre premier Alpha Node, étape par étape

<!-- markdownlint-disable MD013 -->

**[Ouvrir le guide visuel en français](https://montrealai.github.io/AGI-Alpha-Node-v0/?lang=fr)** · **[English guide](getting-started.md)**

Vous pouvez explorer le site sans compte, portefeuille ni installation. Pour exécuter un nœud, vous installez un programme sur votre ordinateur. Les exemples utilisent des données fictives et ne dépensent pas de jetons. Les services d’IA facultatifs et les transactions Ethereum ultérieures peuvent entraîner des coûts.

## 1. Préparez votre ordinateur

Utilisez un **Mac** ou une distribution **Linux** prise en charge. La publication vérifie ces deux plateformes ; ces tests ne prouvent pas la fiabilité continue de chaque machine. Windows, WSL et les appareils mobiles ne sont pas qualifiés par ces tests, mais ils permettent de consulter le site.

Installez [Node.js](https://nodejs.org/en/download), version **22.14 ou ultérieure dans une branche LTS prise en charge**, et **npm 10 ou ultérieur**. Les vérifications de publication utilisent Node.js 22.

## 2. Téléchargez et vérifiez

Ouvrez la [dernière version](https://github.com/MontrealAI/AGI-Alpha-Node-v0/releases/latest). Dans **Assets**, téléchargez le ZIP `AGI_Alpha_Node_v3.3.0.zip` et `SHA256SUMS.txt` de la même version. Il s’agit du logiciel source avec ses instructions, pas d’un installateur en un clic.

Gardez les deux fichiers dans le même dossier. Dans un terminal ouvert dans ce dossier, vérifiez l’empreinte :

| Ordinateur | Commande |
| --- | --- |
| Mac | `shasum -a 256 -c SHA256SUMS.txt` |
| Linux | `sha256sum -c SHA256SUMS.txt` |

Le ZIP doit afficher **OK**. L’empreinte vérifie l’intégrité du téléchargement par rapport à celle publiée ; elle ne remplace pas une revue de sécurité. En cas d’échec, arrêtez et retéléchargez les deux fichiers.

Double-cliquez sur le ZIP pour l’extraire. Repérez le dossier qui contient `package.json`.

## 3. Ouvrez un terminal dans ce dossier

Sur **Mac**, ouvrez **Applications → Utilitaires → Terminal**. Tapez `cd` suivi d’une espace, glissez le dossier extrait dans la fenêtre et appuyez sur Retour. Sous **Linux**, utilisez **Ouvrir dans un terminal** dans le gestionnaire de fichiers, ou `cd` suivi du chemin complet entre guillemets.

Vérifiez les outils :

```bash
node --version
npm --version
```

Si une commande est introuvable, terminez l’installation de Node.js, puis ouvrez un nouveau terminal. Une personne de confiance peut vous aider ; aucune phrase de récupération ni aucun portefeuille n’est nécessaire pour les exemples.

## 4. Lancez l’exemple

Exécutez une commande à la fois et attendez la fin :

```bash
npm ci
npm run demo:work
```

La première installe les dépendances exactes du logiciel. La seconde exécute trois exemples locaux : rapprochement de factures, allocation de ressources et qualité des données. Les entrées et rôles de révision sont des exemples contrôlés. Aucun paiement réel ni service d’IA externe n’est utilisé.

## 5. Consultez les résultats

Dans `alpha-work-output`, ouvrez `invoices`, `allocation` ou `quality`. Chaque dossier contient `report.md`, les preuves et les résultats. Un fichier `.md` est un document texte ; ouvrez-le avec un éditeur. Un fichier CSV peut être ouvert dans un tableur.

Ce sont des démonstrations, pas des revenus ni des travaux de clients réels. Avant de relancer un exemple, conservez et déplacez son ancien dossier de résultats : le logiciel refuse d’écraser les preuves.

## 6. Préparez votre propre nœud

Suivez ensuite [START HERE](../START_HERE.md), le guide technique détaillé en anglais. Il explique les sources autorisées, le réviseur distinct, les limites et l’espace privé. Remplacez et vérifiez chaque paramètre fictif avant d’exécuter une commande.

`serve` affiche un lien privé vers votre interface locale. Ce lien est différent du site public. Gardez-le privé, avec le dossier du nœud qui contient une clé de signature. Un fournisseur d’IA configuré peut recevoir les données des tâches ; examinez les réglages et ses limites de dépenses.

Les paiements et modifications externes sont désactivés au départ. Le [déploiement Ethereum](ethereum-deployment.md) est une procédure avancée distincte, documentée en anglais. Installer le logiciel ne déploie aucun contrat.

## Besoin d’aide ?

| Problème | Étape suivante |
| --- | --- |
| `package.json` introuvable | Ouvrez le terminal dans le dossier du projet extrait. |
| Version Node incompatible | Vérifiez `node --version` et installez une version LTS 22.14+ prise en charge. |
| Compilation impossible sur Mac | Installez les outils Apple avec `xcode-select --install`, puis relancez `npm ci`. |
| Compilation impossible sur Linux | Installez les outils C/C++, make et Python de votre distribution. |
| Résultats déjà présents | Conservez puis déplacez l’ancien dossier de résultats. |
| Permission refusée | Utilisez un dossier vous appartenant. Ne lancez pas le programme avec `sudo`. |
| Interface inaccessible | Gardez `serve` en cours d’exécution ; ouvrez son lien exact sur le même ordinateur. |
| Qualification incomplète | Fournissez les preuves réelles indiquées. Une démonstration ne les remplace pas. |

Posez votre question dans les [issues GitHub](https://github.com/MontrealAI/AGI-Alpha-Node-v0/issues), qui sont publiques. Indiquez la commande, l’erreur, le système et la version Node. Retirez les clés, jetons, accès RPC, données privées et liens privés.

Avant une mise à jour, consultez le [guide de sauvegarde et récupération](alpha-recovery.md). Arrêtez les traitements et conservez une sauvegarde chiffrée, un point de contrôle fiable du journal et une procédure de restauration testée.
