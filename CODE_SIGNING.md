# Code signing policy

Rack's Windows files are not signed yet, so Windows SmartScreen warns when you run them ("Windows protected your PC"). Click **More info**, then **Run anyway**.

## The plan: SignPath Foundation

Rack is open source, so it can apply for a free code signing certificate from the [SignPath Foundation](https://signpath.org/). Their rules require that:

- the project is open source with an OSI-approved licence (Rack is MIT);
- every signed file is built by GitHub Actions from this repository, never on someone's own PC;
- this page exists and names who approves releases.

Once the project is accepted, add two repository secrets, `SIGNPATH_API_TOKEN` and `SIGNPATH_ORGANIZATION_ID`. After that, `.github/workflows/build.yml` signs every tagged release before publishing it. Nothing else changes.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/), once approved.

## Roles

- Committers and reviewers: members of the [Hexnova-Nepal](https://github.com/Hexnova-Nepal) organisation
- Approvers: the owners of the Hexnova-Nepal organisation

## Privacy

Rack doesn't collect data and doesn't send your library anywhere. It contacts these services only to fetch information about your games, or when you ask it to:

- Steam's store and CDN, for covers, descriptions, genres and the wide art the wallpaper can show
- SteamGridDB, only if you add a key
- the Steam Web API, only if you add a key
- Google Images, only when you open the cover picker
- GitHub, to check for Rack updates, and to download Ludusavi when you choose to
