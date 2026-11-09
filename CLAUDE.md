# Working on Ledger

## Every pull request shows before and after, made with Playwright

Each PR description includes before-and-after images captured with Playwright. No PR goes up without them.

- **Before is `main`, after is the branch.** Capture both from a running app (a local production build, as CI runs it), with the same data, viewport and steps, so the only difference is the change.
- **Screens:** screenshot the affected pages. When layout or touch is involved, capture desktop (1280–1400 px wide) and phone (390×844, touch) too, in light and dark themes if colours changed.
- **Motion and interaction:** show it as frames. Freeze animations at fixed times with `document.getAnimations()` (pause, then set `currentTime`), or capture each step of a flow (for example: sign in → workspace → press Back).
- **No screen (CI, deploy, server, scripts):** render a diagram or chart of what changed with Playwright (an HTML page, then a screenshot), using real numbers where there are any, such as step times from a CI run.
- **Layout:** put the before row above the after row with clear "Before" and "After" labels and a one-line caption saying what to look at. Compose the comparison as an HTML page and screenshot it with Playwright.
- **Where they go:** commit the images under `docs/screenshots/<topic>/` (`docs/**` does not trigger CI) and link them in the PR body by commit SHA, so the links keep working after merge:
  `![Before and after](https://github.com/chirayupatel9/ledger/blob/<commit-sha>/docs/screenshots/<topic>/<file>.png?raw=true)`
- Look at every image before posting it: no overlapping labels, nothing cut off, and the difference is actually visible.
