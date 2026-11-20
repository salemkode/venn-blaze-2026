# The Google Slides step

The deck must be a copy of the Widget Factory template with a read-only share link. Editing Google Slides from here needs a GPT model with the Codex Google Drive connector, or your signed-in browser. Everything else is ready.

## What exists

- [../venn-blaze-2026.pptx](../venn-blaze-2026.pptx): the finished 12-slide deck. It was built from a copy of the template's own PPTX export, keeping its backgrounds, Montserrat and Roboto type, crimson accent and fire motifs. All text is editable; every slide has speaker notes.
- [../venn-blaze-2026.pdf](../venn-blaze-2026.pdf) and `s-01.png` … `s-12.png`: rendered and visually checked.
- [presentations.batchUpdate.json](presentations.batchUpdate.json): a fallback that rewrites the seven template slides' text on a Drive copy of the template.

## Option A (recommended): import the PPTX

1. In Google Drive, upload `venn-blaze-2026.pptx` and convert it to Google Slides (Drive API: `files.create` with `mimeType: application/vnd.google-apps.presentation` and the PPTX as media). Name it `Venn · BCH BLAZE 2026`.
2. Open it and check each slide against `s-01.png` … `s-12.png`. Google renders Montserrat and Roboto natively, so the text should match.
3. **Approval point:** set sharing to “Anyone with the link: Viewer”. Copy the `/edit?usp=sharing` link.
4. Put the link in `docs/blaze/banner.json` (`deck.url`), `docs/blaze/LINKS.md` and the BUIDL form, then rebuild and redeploy the site.

## Option B: copy the template in Drive

1. `files.copy` on template `1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk` (never edit the original).
2. `presentations.batchUpdate` on the copy with `presentations.batchUpdate.json` (12 `replaceAllText` requests; every source string was checked against the template).
3. Replace the cover mascot with `assets/images/icon.png`, the story image with `img/story.png`, the BCH Usage code image with `img/code.png`.
4. Import slides 4, 5, 8, 9 and 12 from the PPTX (File → Import slides) and move them into the order below.
5. Same sharing and link steps as option A.

## Slide order and content

| # | Template section | Content | Claim labels |
| --- | --- | --- | --- |
| 1 | Cover | Venn · “Shared money, rules everyone signs” · salemkode, solo entry · demo and source links · Venn icon | — |
| 2 | One-sentence pitch | “Money you share, where everyone spends alone from a budget they agreed to and bigger payments need the group. Bitcoin Cash enforces the rules, not us.” + demo link | — |
| 3 | Story | Sara, Sam and Lee's grocery fund; two app screenshots | — |
| 4 | Story (walkthrough) | Create a Venn in four steps: pick a kind, set the rules, accept your seat, review and create | Done on Chipnet |
| 5 | Story (walkthrough) | Try it in your browser: connect, sign in your wallet, review, sent (`7594e82e…`) | Done on Chipnet; Tested locally (Mainnet pairing) |
| 6 | Benefits | Six benefits | Done on Mainnet (budget, vote, Circle); Done on Chipnet (+ recovery) |
| 7 | BCH usage | Covenant and CashToken cards; the budget check in VennVault.cash | Done on Mainnet |
| 8 | BCH usage (evidence) | “What runs today, and where” table | Mainnet, Chipnet, Tested locally |
| 9 | Vision (limitations) | Honest limitations | Planned (audit, browser Venns) |
| 10 | Vision | Market, next steps, revenue | Planned |
| 11 | Thank you | Template slide + demo and source links | — |
| 12 | Appendix | Full transaction IDs | — |

The template's order (cover → pitch → story → benefits → BCH usage → vision → thank you) is kept; the added slides sit inside the section they support.
