# Browse dropdowns and alignment

Updated the mixed filter toolbar shown in the Clips reference screenshot. Search, Sort and Date now share a baseline and 46px height. Creator, Platform and the results count occupy one deliberate second row. On narrow screens, search spans the full width and the pickers form two readable columns. Default values and placeholders are concise enough to fit a phone.

`components/ui/FilterSelect.tsx` shares the existing React Aria selection behavior and uses `BrowseControls.module.css` for labels, triggers, popup surfaces, options and layouts. The same control is used by Clips, Videos, archive Search, Timeline, FanZone wall filters, the mobile X feed and Chat settings. `CollectionFilter` uses it for its phone picker while retaining desktop text tabs.

Dropdowns open in a portal, align with their trigger, leave space at viewport edges and scroll long option lists. Selection is marked with a check, focus remains visible, and Escape restores focus to the trigger. “All” values retain their actual empty string, so resetting a creator or platform also clears the corresponding URL filter. The native shared selector also reserves room for its chevron, has distinct label/control IDs, and respects disabled options.

The smooth-scroll provider now yields to React Aria listboxes and select/combobox popovers, keeping long menus independent of the page behind them. Menus also contain native overscroll at their edges.

The archive previously forced native inputs to 48px, leaving them above its 46px dropdowns. The conflicting rule now matches the common control height and radius.

Campaign cards show compact current-year dates, keep each date together on a line, and retain the complete UTC time (including year) in the date tooltip and machine-readable timestamp. Dates in other years keep their visible year.

## Verification

- Source TypeScript check passed.
- Full suite: 1,160 passed, one skipped, zero failures.
- Clips checked at 390px and 1440px, in light and dark themes. Its desktop Search, Sort and Date controls have identical top coordinates and 46px heights. No horizontal page overflow.
- Checked keyboard open → arrow navigation → Enter commit, Escape, creator selection, and resetting the empty “All” selection. URL filters updated correctly.
- Verified wheel scrolling after the smooth-scroll fix: the creator menu scrolled from 0 to 111px while the page stayed at exactly 296px. Long menus no longer drag the page underneath them.
- Archive Search's Creator, Platform, Type, From and To controls all have the same top coordinate and 46px height; the platform menu opens above content with a visible selection.
- FanZone's wall filter panel was expanded in the browser; Member, Album and Order align, and the member menu opens and scrolls without clipping its container.
- Videos currently returned an empty feed, so its empty state was checked; its filter controls share the verified composition used on Clips.

Evidence is saved under `output/dropdown-ui/`.

## Campaign duration clarification

The owner clarified that promotions usually run for 30 days. The five untouched imported campaign drafts were activated with 30-day **website display windows** from their verified launch dates. Existing admin-customized records were excluded from that update. Cards say “Featured until” while organizer closing timestamps remain unconfirmed. All dates remain editable in Admin, and the public endpoint returns all five bounded campaigns. See `clipping-campaigns.md` for sources and scheduling details.
