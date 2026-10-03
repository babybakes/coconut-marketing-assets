# Honeycomb: Phase 0 prototype (inline amounts)

Puts ingredient amounts right inside recipe steps, on the recipe's own web page.

> whisk the flour `1¾ cups (219g)`, baking soda `1 tsp`, cinnamon `2 tsp`…

A green **Amounts** button appears on recipe pages. Tap it to scale the recipe (½×, 1×, 2×, 3×) or hide the amounts. Pages without a recipe are left alone.

## Set it up on your iPhone (about 5 minutes)

1. **Install the free "Userscripts" app** from the App Store (by Justin Wasack). It's a Safari extension that runs small scripts like this one.
2. **Open Userscripts** and set its scripts folder. Tap the option to change the directory and pick or create a folder in Files, for example *On My iPhone › Userscripts*.
3. **Turn on the extension:** Settings › Apps › Safari › Extensions › Userscripts › turn it on, and set *All Websites* to **Allow**.
4. **Save `inline-amounts.user.js` into that folder.** From the file I sent in the Claude app: Share › **Save to Files** › choose the Userscripts folder.
5. **Open any recipe in Safari.** If Safari asks for permission for Userscripts on the site, allow it. The green **Amounts** button shows up and the steps get their amounts.

To update later, save the new file over the old one.

## Backup: bookmarklet

If the Userscripts app gives you trouble, `bookmarklet.txt` is the same code as a bookmark:

1. In Safari, bookmark any page.
2. Edit that bookmark: name it "Amounts" and replace the address with the full contents of `bookmarklet.txt`.
3. On a recipe page, open your bookmarks and tap "Amounts."

It's a long bookmark (about 31 KB). If Safari won't save it, use the Userscripts route.

## On your Mac

The same `inline-amounts.user.js` works in **Userscripts for Safari on Mac** (same app, Mac App Store) or **Tampermonkey** in Chrome.

## What to note while you cook

That's the point of Phase 0. Keep a quick list:

- **Site + recipe link** when something is wrong
- **Wrong amount** on something (it guessed the wrong ingredient)
- **Missing amount** where you expected one
- **No button at all** on a recipe page (the site wasn't detected)
- Anything that feels annoying or that you wish it did

## How it works

1. Reads the hidden recipe data most recipe sites include for Google (schema.org JSON-LD).
2. Parses each ingredient into amount + name ("1 and 3/4 cups (219g) all-purpose flour" → `1¾ cups (219g)` + "flour").
3. Finds the step text on the page, through common recipe plugins (WP Recipe Maker, Tasty Recipes, Mediavine Create…) or by matching the step text.
4. Inserts an amount after each ingredient mention. The longest match wins ("brown sugar" beats "sugar"). It handles "half the butter," skips "the remaining butter," and doesn't guess when a word could mean two ingredients.

## Known limits (on purpose, for now)

- "The dry ingredients" and "the wet ingredients" don't get amounts yet.
- Pages without recipe data (news sites, small blogs) are read from the page text: lists of lines starting with amounts, then the steps after them. Instagram captions still aren't detected.
- No AI yet; it's all simple text matching.

## Developing

```
node test/run.mjs           # runs the script on test pages in a headless browser
node test/run.mjs --shots   # same, plus iPhone-size screenshots in dist/
node build.mjs              # rebuilds dist/ (userscript copy + bookmarklet)
```
