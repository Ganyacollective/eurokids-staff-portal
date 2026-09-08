# HIG Brief — Apple Human Interface Guidelines distilled for the EuroKids hub

Source: Apple HIG JSON (developer.apple.com/design/human-interface-guidelines, snapshot 8 Sep 2026, post-Liquid-Glass revision) and SwiftUI reference docs. Quoted phrases are Apple's wording. Numbers are points (pt); on the web treat 1 pt = 1 CSS px.

Pages read: layout, typography, color, materials, lists-and-tables, buttons, menus, sheets, popovers, sidebars, toolbars, tab-bars, segmented-controls, text-fields, toggles, search-fields, labels, sf-symbols, alerts, action-sheets, entering-data, feedback, loading, modality, searching, settings, undo-and-redo, accessibility; SwiftUI List, ListStyle, Form/FormStyle, NavigationSplitView, Section, Toolbar/ToolbarItemPlacement, LabeledContent, ContentUnavailableView, searchable.

---

## 1. Non-negotiable numbers

| Rule | iOS / iPadOS | macOS |
|---|---|---|
| Minimum hit region for a button | "at least 44x44 pt" (default 44, floor 28x28) | default 28x28, floor 20x20 |
| Padding around controls | "about 12 points" if the control has a bezel; "about 24 points" if it has none | same |
| Default body text | 17 pt | 13 pt |
| Minimum text size | 11 pt | 10 pt |
| Text contrast (WCAG AA) | up to 17 pt: **4.5:1**; 18 pt and larger: **3:1**; bold at any size: **3:1** | same |
| Larger text | must scale to "at least 200 percent" | n/a (macOS has no Dynamic Type) |
| Font weights | "avoid Ultralight, Thin, and Light" — use Regular/Medium/Semibold/Bold | same |
| Prominent (filled) buttons per view | "one or two" | same |
| Toolbar groups | "aim for a maximum of three" | same |
| Window/view title | "under 15 characters" | same |
| Segments in a segmented control | "no more than about five" on iPhone, five to seven on wide screens | 5–7 |
| Submenu items | if "more than about five", make a new menu | same |
| Radio buttons in a set | more than about five -> use a pop-up (select) | same |
| Sidebar hierarchy | "no more than two levels" | same |
| Popovers / sheets on screen | one at a time; never stack a popover on a popover | same |
| Alert buttons | up to three; title should not "wrap to more than two lines" | same |
| Action-sheet buttons (watch rule, useful ceiling) | four including Cancel | — |

---

## 2. Typography (SF Pro; on web fall back to the system stack)

Text styles = weight + size + leading. Apple: "Consider using the built-in text styles." "Minimize the number of typefaces."

### iOS / iPadOS, Large (default) Dynamic Type — size / leading / emphasized weight
| Style | Weight | Size | Leading | Emphasized |
|---|---|---|---|---|
| Large Title | Regular | 34 | 41 | Bold |
| Title 1 | Regular | 28 | 34 | Bold |
| Title 2 | Regular | 22 | 28 | Bold |
| Title 3 | Regular | 20 | 25 | Semibold |
| Headline | Semibold | 17 | 22 | Semibold |
| Body | Regular | 17 | 22 | Semibold |
| Callout | Regular | 16 | 21 | Semibold |
| Subheadline | Regular | 15 | 20 | Semibold |
| Footnote | Regular | 13 | 18 | Semibold |
| Caption 1 | Regular | 12 | 16 | Semibold |
| Caption 2 | Regular | 11 | 13 | Semibold |

(xSmall step: Large Title 31/38, Body 14/19, Footnote 12/16. xxxLarge: Body 23/29. AX5: Body 53/62.)

### macOS built-in text styles — size / line height / emphasized weight
| Style | Weight | Size | Line height | Emphasized |
|---|---|---|---|---|
| Large Title | Regular | 26 | 32 | Bold |
| Title 1 | Regular | 22 | 26 | Bold |
| Title 2 | Regular | 17 | 22 | Bold |
| Title 3 | Regular | 15 | 20 | Semibold |
| Headline | Bold | 13 | 16 | Heavy |
| Body | Regular | 13 | 16 | Semibold |
| Callout | Regular | 12 | 15 | Semibold |
| Subheadline | Regular | 11 | 14 | Semibold |
| Footnote | Regular | 10 | 13 | Semibold |
| Caption 1 | Regular | 10 | 13 | Medium |
| Caption 2 | Medium | 10 | 13 | Semibold |

Rules:
- "Adjust font weight, size, and color as needed to emphasize important information" — hierarchy by weight and color first, size second.
- Leading: tight leading only for 1–2 lines in a height-constrained row; "If you need to display three or more lines of text, avoid tight leading."
- "Keep text truncation to a minimum"; when truncating identifiers, a middle ellipsis "preserves both the beginning and the end."
- "Maintain a consistent information hierarchy regardless of the current font size" — primary elements stay at the top.

---

## 3. Color

- Semantic first: colors are "semantically defined by its purpose, rather than its appearance." "Avoid redefining the semantic meanings of dynamic system colors." "Avoid hard-coding system color values" (values below are design references only).
- "Avoid using the same color to mean different things." If the accent means interactive, do not use it for non-interactive text.
- "Avoid relying solely on color to differentiate between objects, indicate interactivity, or communicate essential information" — pair color with text or a glyph.
- "Consider choosing a limited color palette" (macOS): one accent, applied to "buttons, selection highlighting, and sidebar icons."
- Sidebar icons take the accent color; a fixed color is allowed only "sparingly" to mark one special item (Mail's yellow VIP).
- Destructive = system red. Primary/default = accent. Switch on = system green by default; "Change the default color of a switch only if necessary."
- System reference values (light / dark): Red 255,56,60 / 255,66,69 · Orange 255,141,40 / 255,146,48 · Yellow 255,204,0 / 255,214,0 · Green 52,199,89 / 48,209,88 · Blue 0,136,255 / 0,145,255.
- Backgrounds (iOS): two families — system (`systemBackground`, secondary, tertiary) for plain content and **grouped** (`systemGroupedBackground`, `secondarySystemGroupedBackground`, tertiary) "when you have a grouped table view." Primary = overall view, "Secondary for grouping content or elements within the overall view," "Tertiary for grouping content or elements within secondary elements."
- Foreground (iOS): label, secondaryLabel, tertiaryLabel, quaternaryLabel, placeholderText, separator (translucent), opaqueSeparator, link.
- macOS named colors worth mirroring: controlAccentColor, alternatingContentBackgroundColors, selectedContentBackgroundColor, unemphasizedSelectedContentBackgroundColor (selection in a non-key window), gridColor, headerTextColor, keyboardFocusIndicatorColor, separatorColor, windowBackgroundColor, textBackgroundColor.
- Labels page: four tiers — Label = primary; Secondary = "A subheading or supplemental text"; Tertiary = "Text that describes an unavailable item or behavior"; Quaternary = "Watermark text."
- Dark, light and Increased Contrast must all work: "Make sure all your app's colors work well in light, dark, and increased contrast contexts."

---

## 4. Materials and surfaces (post-Liquid-Glass)

- Two layers: a **control layer** (toolbars, sidebars, tab bars — float above content on Liquid Glass) and a **content layer** (lists, forms, backgrounds — use standard materials / solid colors). "Don't use Liquid Glass in the content layer."
- "Extend content to fill the screen or window"; scrollable content continues beneath bars. Use a "scroll edge effect" (a subtle top blur/fade) instead of an opaque toolbar background to separate the bar from content.
- "Reduce the use of toolbar backgrounds and tinted controls." Toolbar and tab-bar items are monochrome by default; color goes only on the one primary action.
- Content-layer materials (iOS): ultra-thin, thin, regular (default), thick. macOS: sidebar, header, popover, menu, sheet, HUD, etc. — choose "based on semantic meaning," not the apparent color.
- Thicker material for text legibility; thinner to keep context visible. Never use quaternary vibrancy on thin materials ("the contrast is too low").
- Corners: "standard buttons, text fields, headers, and footers have corner radii that are concentric with bar corners." Nested radii = outer radius minus inset.

---

## 5. Layout

- Reading order governs importance: "place the most important items near the top and leading side."
- "Group related items" with negative space, background shapes, or separators; "ensure that content and controls remain clearly distinct."
- "Make controls easier to use by providing enough space around them and grouping them in logical sections."
- "Align components with one another."
- Progressive disclosure: hint that more content exists (partial rows, disclosure chevrons).
- Windows resize: "defer switching to a compact view for as long as possible"; "prefer hiding tertiary columns such as inspectors as the view narrows."
- "Avoid placing controls or critical information at the bottom of a window" (macOS) — bottoms get dragged offscreen. Same rule for sidebars.
- "Avoid hiding the sidebar by default."
- Standard platform margins (SwiftUI/UIKit layout margins, not in the HIG prose): 16 pt in compact width, 20 pt in regular width; grouped-list row content inset 16–20 pt; readable-content max width ~672 pt for prose.

---

## 6. Lists and tables

- "Prefer displaying text in a list or table." Rows are for scanning text; use a grid/collection only for image-heavy or wildly variable items.
- Styles: iOS "grouped style uses headers, footers, and additional space to separate groups"; macOS "bordered style ... uses alternating row backgrounds to help make large tables easier to use."
- Selection feedback: a navigation list "persistently highlights the selected row"; an options list "highlights a row only briefly before adding an image — such as a checkmark."
- Keep row text succinct; if items are long, list titles only and open a detail view.
- Multicolumn tables: "Use descriptive column headings" — nouns or noun phrases, title-style capitalization, no ending punctuation.
- macOS tables: "let people click a column heading to sort"; re-click reverses; "Let people resize columns"; "Consider using alternating row colors in a multicolumn table"; use an outline view (disclosure triangles) for hierarchy.
- Accessories: a disclosure chevron means "drill in"; an info (i) button only reveals details and "doesn't support navigation." Do not put an alphabetic index next to trailing controls.
- Editing: "People appreciate being able to reorder a list"; on iOS multi-select needs an explicit edit mode; on Mac/iPad with pointer, "People can make multiple selections without needing to enter edit mode."

### SwiftUI list anatomy (what the hub's `.grp/.box/.row` must reproduce)
- `.insetGrouped` (iOS): "a continuous background color that extends from the section header, around both sides of list items in the section, and down to the section footer." Rounded card per section, on `systemGroupedBackground`.
- `.grouped`: same as plain rows but "a larger header and footer than the plain style."
- `.sidebar`: section headers carry disclosure indicators that collapse/expand sections.
- `.bordered` (macOS only): inset from its container, no inset rows, alternating row backgrounds available.
- Section header: short label, iOS grouped style renders it as an uppercase footnote (13 pt) in secondaryLabel above the group; macOS grouped Form renders it as a bold 13 pt headline. Footer: footnote (13 pt), secondaryLabel, sentence case, explains the section.
- Separators: `listRowSeparator` is a preference; "the list style is the final arbiter." Insets follow the leading text edge (i.e., separator starts where the label starts, not at the card edge, unless an icon precedes the label — then it starts at the label).
- Section spacing: `.default`, `.compact`, custom. Default inset-grouped spacing is roughly 35 pt between groups; compact ≈ 16–20 pt.
- Swipe actions: trailing edge by default, symbols get the fill variant, `Button(role: .destructive)` renders red, first-listed action is the full-swipe action.
- Rows: default min row height 44 pt.

---

## 7. Sidebar (navigation) and NavigationSplitView

- "A sidebar appears on the leading side of a view and lets people navigate between areas of your app or top-level collections of content."
- Needs "a large amount of vertical and horizontal space"; when limited, a tab bar (or a tab bar that converts to a sidebar) is better. "Consider using a tab bar first" on iPhone.
- "In general, show no more than two levels of hierarchy in a sidebar." Deeper data -> add a content list column between sidebar and detail (three-column split view).
- Group with disclosure controls; label each group with "succinct, descriptive labels"; "omit unnecessary words."
- Use SF Symbols for items; icons tinted with the accent color; the whole row highlights on selection (rounded selection pill, accent tint at low alpha or full accent in a key window).
- Let people hide/show it (Show/Hide Sidebar command, toolbar toggle); consider auto-collapsing when the window narrows; never hide by default.
- Put search "at the top of the sidebar when filtering content or navigation there."
- Row height/text/icon size scale with the user's sidebar icon size (small/medium/large) on macOS — roughly 24/28/32 pt rows.
- SwiftUI: `NavigationSplitView { List(selection:) { Section {...} }.listStyle(.sidebar) } detail: { ... }`. Column visibility `.all`, `.doubleColumn`, `.detailOnly`; "macOS always displays the content column." On compact width (iPhone, iPad Slide Over) it "collapses all of its columns into a stack." Widths via `navigationSplitViewColumnWidth(min:ideal:max:)` — Apple's example: sidebar 150, content 150/200/400. Practical Apple-app sidebar widths: 200–260 pt on macOS; the detail's window title is the selected item's title.

---

## 8. Toolbar and titles

- Three zones. **Leading edge**: back/forward, sidebar toggle, then the view title (and an optional document menu). **Center**: common controls, customizable, first to collapse into the overflow menu. **Trailing edge**: "important items that need to remain available, buttons that open nearby inspectors, an optional search field, and the More menu ... It also includes a primary action like Done when one exists. Items on the trailing edge remain visible at all window sizes."
- "Use the prominent style for key actions such as Done or Submit ... Only specify one primary action, and put it on the trailing side of the toolbar."
- "Group toolbar items logically by function and frequency of use"; "aim for a maximum of three" groups; "Group navigation controls and critical actions like Done, Close, or Save in dedicated, familiar, and visually distinct sections."
- "Prefer simple, recognizable symbols for items instead of text," except actions "that aren't well-represented by symbols." "Prefer system-provided symbols without borders" (no circled icons).
- "Add a More menu to contain additional actions" — but "Try to include all actions in the toolbar if possible." Never build your own overflow; the system does it as the window narrows.
- "Use the standard Back and Close buttons" — chevron.left and xmark; no "Back" text label.
- Titles: "Provide a useful title for each window"; not the app name; "under 15 characters."
- "Use a large title to help people stay oriented" — it transitions to a standard inline title on scroll and back at the top (iOS).
- macOS: toolbar lives in the window frame, "toolbar items don't include a bezel"; every toolbar item must also exist as a menu-bar command.
- Search on iPad/Mac: "Put a search field at the trailing side of the toolbar for many common uses."
- SwiftUI placements: `.primaryAction` = trailing on iOS, leading on macOS toolbar; `.confirmationAction` = trailing-most in a sheet, tinted accent; `.cancellationAction` = leading on iOS, before confirmation on macOS; `.destructiveAction` = trailing on iOS, leading with caution appearance on macOS; `.principal` = center; `.navigation` = leading. `toolbarTitleDisplayMode(.automatic/.inline/.large/.inlineLarge)` ("no effect on macOS"). `ToolbarItemGroup` for related buttons; `ToolbarSpacer(.fixed|.flexible)` for gaps.

---

## 9. Buttons

- "As a general rule, a button needs a hit region of at least 44x44 pt." "Always include a press state."
- Hierarchy by style, never by size: "Use style — not size — to visually distinguish the preferred choice." Prominent (filled with accent) for the most likely action, "one or two per view"; everything else uses the default (bordered/gray or glass) or plain (borderless) style.
- Style ladder (SwiftUI names): `.borderedProminent` (filled accent, white label) > `.bordered` (gray/tinted fill, accent or label-colored text) > `.borderless`/`.plain` (text only, accent-colored). On macOS the ordinary push button is the bordered style; the default button in a dialog is filled with the accent and responds to Return.
- Roles: primary (Return key confirms; accent color), cancel (Esc), destructive ("uses the system red color"). "Don't assign the primary role to a button that performs a destructive action, even if that action is the most likely choice."
- Labels: verb first, title-style capitalization ("Add to Cart"); "Append a trailing ellipsis to the title when a push button opens another window, view, or app" or needs more input.
- Icon buttons: familiar SF Symbol; tooltip on hover (macOS). "Include about 10 pixels of padding between the edges of the image and the button edges."
- Long-running action: "Configure a button to display an activity indicator" inside the button rather than blocking the view; optionally change the label ("Sending…").
- watch rule that transfers to phones: for a full-width primary at the bottom, "Prefer buttons that span the width of the screen"; never more than two text buttons side by side.

---

## 10. Menus

- Labels: verb or verb phrase; "use title-style capitalization"; "Remove articles like a, an, and the"; "Append an ellipsis to a menu item's label when the action requires more information."
- "Show people when a menu item is unavailable" — dim it; keep the menu itself openable even if everything inside is disabled.
- Order: "Prefer listing important or frequently used menu items first." Group logically; "use a separator" between groups; keep related commands together even if rarely used.
- Icons: "Use menu item icons sparingly and with purpose"; "provide icons for all menu items in a group, or none of them."
- Submenus: "Use submenus sparingly"; single level; if "more than about five items, consider creating a new menu"; "Prefer using a submenu to indenting menu items."
- Toggled items: one item whose label flips ("Show Map"/"Hide Map"), or a checkmark for attributes currently in effect; add a verb if ambiguous ("Turn HDR On").
- Destructive commands in a menu: red label, last group, after a separator (system convention in context menus).
- iOS layouts: Small (row of 4 icon-only), Medium (row of 3 icon+label), Large (full list, default).
- Pull-down button (actions) vs pop-up button (mutually exclusive selection, shows current value). Action sheet — not a menu — "to provide choices related to an action" that the person just initiated.

---

## 11. Presentation: sheet vs popover vs alert vs action sheet vs full-screen

Decision table:
| Need | Use |
|---|---|
| Critical information / irreversible, uncommon destructive confirmation | **Alert** — "critical information they need right away"; "Use alerts sparingly." |
| Choices that follow an action the person just took (e.g., closing an edited draft) | **Action sheet / confirmation dialog** — Cancel at the bottom; destructive buttons "at the top ... destructive style." |
| A scoped task with its own Cancel/Done (compose, edit record, add payment) | **Sheet** — "a scoped task that's closely related to their current context." |
| A few related options or a small amount of info tied to a control, in a wide layout | **Popover** — "a small amount of information or functionality"; closes on outside click; "Avoid using a popover to show a warning." |
| Compact width (phone) where a popover would appear | Sheet (popovers are for wide views: "Avoid displaying popovers in compact views"). |
| Long multistep or immersive task | Full-screen modal, or on Mac a new window. |
| Supplementary controls while continuing to work in the main view | Nonmodal: inspector, panel, or nonmodal sheet — "Use a panel instead of a sheet if people need to repeatedly provide input and observe results." |

Sheet rules:
- macOS: "a cardlike view with rounded corners that floats on top of its parent window"; parent dims; always modal; "Present a sheet in a reasonable default size." iPad: page or form sheet style, centered on a dimmed background. iPhone: from the bottom, detents `medium` (~half) and `large`; grabber if resizable; swipe-down dismiss.
- "Display only one sheet at a time"; close the first before opening a second.
- Buttons: Cancel (or Close) leading in the top toolbar; Done trailing; Back replaces Cancel on later steps; Done inactive until the task is complete. "Provide an alternative to the Done button." "Avoid showing all three buttons — Cancel, Done, and Back — together."
- Unsaved changes + swipe-to-dismiss -> confirm with an action sheet.
- Modality: "Always give people an obvious way to dismiss a modal view." "Present content modally only when there's a clear benefit." "avoid creating a modal experience that feels like an app within your app." "Let people dismiss a modal view before presenting another one." Only an alert may sit on top of another modal, and never two alerts.

Popover rules: arrow points at the invoking control; do not cover it; close-on-outside-click unless multiple selections are being made; "Always save work when automatically closing a nonmodal popover"; nothing except an alert may appear over a popover; macOS popovers may detach into a panel.

Alert rules:
- Anatomy: title, optional message, "up to three buttons," optional text field.
- Title = what happened, in plain words; never "Error". Fragment -> title case, no period; full sentence -> sentence case with period. Message adds value only; sentence case.
- Buttons: "one- or two-word title that describes the result" (Delete, Erase, Convert); title-style capitalization; avoid Yes/No; "OK" only in purely informational alerts. Default button trailing (or top in a stack); "Cancel buttons are typically on the leading side of a row or at the bottom of a stack." "If there's a destructive action, include a Cancel button"; Cancel is never the default. Destructive style for destructive actions the person "didn't deliberately choose"; a deliberately chosen destructive action (Empty Trash) can be the default so Return confirms.
- "Avoid displaying alerts for common, undoable actions, even when they're destructive." Confirm only "an uncommon destructive action that they can't undo."
- Esc / Command-Period cancels.

---

## 12. Data entry, text fields, toggles, segmented controls, search

Text fields:
- "Show a hint in a text field" (placeholder) and "include a separate label describing the field" because placeholder text vanishes on typing.
- Label placement: in a grouped form the label is leading and the value/control trailing on the same row (`LabeledContent`); in a column form (macOS `.columns`) labels are right-aligned in a trailing-aligned column beside a leading-aligned column of values, with a colon; above-the-field labels are the non-form fallback.
- "match the size of a text field to the quantity of anticipated text"; "Stack multiple text fields vertically" with consistent widths; logical tab order.
- Validate "when it makes sense": email when focus leaves; username/password before focus leaves; "Dynamically validate field values" and show the problem "as soon as you detect" it. Numbers: use a formatter (decimals, percentage, currency) and never assume locale formatting.
- iOS: clear (x) button at the trailing end; leading icon indicates purpose, trailing end holds extras.
- Secure fields for secrets; "Never prepopulate a password field."
- Entering data: "Get information from the system whenever possible"; "prefill fields with reasonable default values"; "offer choices instead of requiring text entry" (pickers/menus over typing); enable Next/Continue "only after people enter the data you require."

Toggles:
- iOS: "Use the switch toggle style only in a list row" (row text is the label). Outside a list, use a toggle button (icon button with a highlighted background when active).
- macOS: switch for settings "you want to emphasize" or that govern a group; "In general, don't replace a checkbox with a switch"; checkbox for a single on/off setting and for hierarchies ("Use a checkbox instead of a switch if you need to present a hierarchy of settings"); mixed state (dash) for parent checkboxes; radio buttons for 2–5 mutually exclusive options, otherwise a pop-up. In a grouped form on macOS, "consider using a mini switch" so rows stay the same height; a Toggle inside `LabeledContent` renders as a checkbox.
- "Avoid relying solely on different colors to communicate state."
- Never put switches/checkboxes/radios in the toolbar.

Segmented controls: single choice among "closely related choices that affect an object, state, or view"; equal-width segments; text or icons, not both; nouns, title case, no intro text needed; iPhone ≤ 5 segments; for switching whole sections use a tab bar (iOS) or tab view (macOS main area), keep segmented controls for toolbars/inspectors/sub-views.

Search:
- Anatomy: magnifier icon, placeholder, clear button; optional scope bar and tokens.
- "If possible, start search immediately when a person types." Show recent searches before typing and suggestions while typing; "Provide the most relevant search results first."
- "Default to a broader scope and let people refine it." "Clearly display the current scope of a search" via placeholder, scope bar, or title.
- Placement: iPad/Mac toolbar trailing edge for app-wide search; top of the sidebar when it filters the sidebar; inline above a list when it filters only that list ("position an inline search field above the list it searches, and consider pinning it to the top toolbar when scrolling"); iPhone bottom toolbar if there is room, else top.
- Empty result: `ContentUnavailableView.search(text:)` — large magnifier symbol, "No Results for 'x'", one-line description.

---

## 13. Feedback, loading, empty states, undo

- Status belongs in the interface, not in alerts: "Consider integrating status feedback into your interface" (Mail's "Updated just now" line). "Alerts can lose their impact if you use them too often."
- Confirm completion only when the action is significant; "they only need to know when it doesn't" succeed. Always explain why a command cannot run.
- "Warn people when they initiate a task that can cause data loss that's unexpected and irreversible."
- Loading: "Show something as soon as possible" — placeholders (skeletons) that get replaced; show a progress indicator when loading "takes more than a moment or two"; determinate "when you know how long loading will take," indeterminate when you don't; "Let people do other things ... while they wait."
- Empty state: `ContentUnavailableView(label, description, actions)` — one SF Symbol (large, secondary color), a Title 2/Headline-sized title, a Subheadline/Footnote description in secondaryLabel, then at most one or two action buttons. Use it for "a network error, a list without items, a search that returns no results."
- Undo over confirm: skip confirmation for common, undoable actions; give undo instead ("Let people undo multiple times", label the action: "Undo Delete"). "Provide undo and redo buttons only when necessary" — Command-Z / Edit menu are the standard routes.
- Do not auto-dismiss: "Prefer dismissing views with an explicit action"; time-boxed toasts are an accessibility problem (if a toast exists, keep it ≥ 5 s and dismissable).
- Tab bar badges: reserve "for critical information."

---

## 14. Settings

- "Minimize the number of settings you offer"; good defaults for the most people.
- "Put general, infrequently changed settings in your custom settings area"; task-specific options (show/hide columns, sort, filter) "in the screens they affect," not in Settings.
- macOS: Command-Comma opens settings; a fixed pane toolbar that "always indicates the active toolbar button"; window title = current pane; remember the last pane; no settings button in the main toolbar.
- iOS Settings-style: grouped inset lists, one setting per row, switch trailing, footers for explanations.

---

## 15. SF Symbols (skim)

- Nine weights matching SF text weights; three scales (small, medium default, large) relative to cap height; align to the text baseline.
- "Outline is the most common variant" — toolbars and lists; fill for tab bars, swipe actions and selected states ("an iOS tab bar prefers the fill variant, whereas a toolbar takes the outline variant").
- Rendering: monochrome (default), hierarchical (one hue, opacity levels), palette, multicolor. Prefer system colors so symbols adapt to Dark Mode and Increase Contrast.
- Provide alternative text for custom symbols.

---

## 16. How a SwiftUI app composes (the target mental model)

```
NavigationSplitView(columnVisibility: $vis) {
    List(selection: $section) {                // sidebar column
        Section("Admissions") { Label("Children", systemImage: "person.2") ... }
        Section("Finance")    { Label("Fees", systemImage: "indianrupeesign.circle") ... }
    }
    .listStyle(.sidebar)
    .searchable(text: $q, placement: .sidebar)
} detail: {
    NavigationStack {
        List(rows, selection: $selected) { ... }     // content: table or inset-grouped list
            .navigationTitle("Children")             // large title on iOS, window title on macOS
            .toolbar {
                ToolbarItem(placement: .primaryAction) { Button("Add", systemImage: "plus") {} }
                ToolbarItemGroup(placement: .secondaryAction) { Menu("Filter") {}; Menu("Sort") {} }
            }
            .sheet(item: $editing) { child in
                NavigationStack {
                    Form { Section("Guardian") { LabeledContent("Name") { TextField(...) } } }
                        .formStyle(.grouped)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Cancel") {} }
                            ToolbarItem(placement: .confirmationAction) { Button("Save") {} }
                        }
                }
            }
            .overlay { if rows.isEmpty { ContentUnavailableView("No Children", systemImage: "person.2", description: Text("Add a child to begin.")) } }
    }
}
```
- Sidebar = navigation only (areas and saved views), two levels max. Detail = one large title, one toolbar, one primary action.
- Records open in a sheet (scoped task) with Cancel leading and Save trailing; or, on wide layouts, in an inspector/detail column when the person needs to keep the list visible.
- Every form is `Form.formStyle(.grouped)`: inset rounded sections, leading labels, trailing controls, section footers for help text.
- Empty and error states are `ContentUnavailableView`; loading is a skeleton or ProgressView; success is silent or inline.

---

## 17. Translation to this web app (CSS-level)

1 pt = 1 px. Design the desktop hub against the **macOS** scale and the phone layout against the **iOS** scale; switch at 768 px width.

### Tokens
```css
:root {
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif;
  /* macOS scale (desktop ≥ 768px) */
  --fs-large-title: 26px; --lh-large-title: 32px;   /* Bold */
  --fs-title1: 22px; --lh-title1: 26px;             /* Bold */
  --fs-title2: 17px; --lh-title2: 22px;             /* Bold */
  --fs-title3: 15px; --lh-title3: 20px;             /* Semibold */
  --fs-headline: 13px; --lh-headline: 16px;         /* Bold */
  --fs-body: 13px; --lh-body: 16px;
  --fs-callout: 12px; --lh-callout: 15px;
  --fs-subhead: 11px; --lh-subhead: 14px;
  --fs-footnote: 10px; --lh-footnote: 13px;         /* floor: never below 10px on desktop */
  /* semantic colours (light) */
  --label: rgba(0,0,0,.85); --label-2: rgba(0,0,0,.5); --label-3: rgba(0,0,0,.25); --label-4: rgba(0,0,0,.1);
  --sep: rgba(60,60,67,.29); --sep-opaque: #c6c6c8;
  --bg: #fff; --bg-grouped: #f2f2f7; --bg-grouped-2: #fff; --bg-grouped-3: #f2f2f7;
  --accent: #0088ff; --red: #ff383c; --orange: #ff8d28; --yellow: #ffcc00; --green: #34c759;
  --selection: var(--accent); --selection-unemphasized: rgba(0,0,0,.08);
  --focus-ring: 0 0 0 3px rgba(0,136,255,.45);
  --r-card: 10px; --r-control: 6px; --r-sheet: 12px; --r-pill: 999px;
}
@media (max-width: 767px) {  /* iOS Large scale */
  :root { --fs-large-title: 34px; --lh-large-title: 41px; --fs-title1: 28px; --lh-title1: 34px;
          --fs-title2: 22px; --lh-title2: 28px; --fs-title3: 20px; --lh-title3: 25px;
          --fs-headline: 17px; --lh-headline: 22px; --fs-body: 17px; --lh-body: 22px;
          --fs-callout: 16px; --lh-callout: 21px; --fs-subhead: 15px; --lh-subhead: 20px;
          --fs-footnote: 13px; --lh-footnote: 18px; --r-card: 10px; }
}
@media (prefers-color-scheme: dark) {
  :root { --label: rgba(255,255,255,.85); --label-2: rgba(235,235,245,.6); --label-3: rgba(235,235,245,.3);
          --sep: rgba(84,84,88,.6); --bg: #000; --bg-grouped: #000; --bg-grouped-2: #1c1c1e; --bg-grouped-3: #2c2c2e;
          --accent: #0091ff; --red: #ff4245; --orange: #ff9230; --green: #30d158; }
}
```
Weights: 400 regular, 500 medium, 600 semibold, 700 bold. Never 100–300.

### Hit targets and spacing
- Every clickable element: `min-height: 44px; min-width: 44px` on touch (≤ 767 px). On desktop a compact 28 px control is allowed, but keep the invisible hit area ≥ 28×28 and 12 px clearance between bezelled controls, 24 px between bare icon buttons; the `.row` in a list is always ≥ 44 px tall.
- Page gutters: 20 px desktop, 16 px phone. Sidebar row inset 10 px; grouped-list row padding `11px 16px` (iOS) / `6px 12px` (macOS); text line-height per table above.
- Inset-grouped section gap: 35 px default (`--section-gap`), 16 px compact. Header above the card: footnote, uppercase on phone (`text-transform: uppercase; letter-spacing: .04em`), sentence-case bold headline on desktop; footer below in footnote/`--label-2`.
- Separators: 1px (`0.5px` on 2x screens via `transform`/hairline) `--sep`; `margin-left` equals the label's left edge (16 px, or 16 px + icon width + 12 px when a leading icon exists); no separator after the last row in a group.

### Shell
- Sidebar: `width: 240px` (min 200, max 320, user-resizable if cheap), leading side, full height, `--bg-grouped` (light) / translucent-looking `#1c1c1e`, 8 px inner gutter, rows 28 px tall (desktop) / 44 px (phone), 6 px radius selection pill in `--accent` (key) or `--selection-unemphasized` (window inactive), icon 16–18 px tinted `--accent`, label body size; section headers 11 px semibold `--label-2` with a disclosure chevron; ≤ 2 levels; search field at the top of the sidebar. Collapses to a tab bar or a slide-over drawer under 768 px; never hidden by default on desktop.
- Detail header: large title (`--fs-large-title`, bold) at the top of the scroll area on phone, collapsing to an inline 17 px semibold title in a 44 px bar after 1 line of scroll; on desktop, a 52 px toolbar with the title at the leading edge (title2 bold, ≤ 15 chars).
- Toolbar zones: `display:grid; grid-template-columns: auto 1fr auto` = leading (sidebar toggle, title), center (search or segmented control), trailing (secondary icon buttons, then More "…" menu, then the one filled primary). Max three groups; icon buttons 28×28 (desktop) / 44×44 (phone), outline SF-style icons, no circles; only the primary uses `background: var(--accent); color:#fff`.
- Scroll edge: toolbar is transparent until content scrolls beneath it, then `backdrop-filter: blur(20px) saturate(1.8); background: rgba(255,255,255,.72)` plus a hairline bottom border — content scrolls under the bar, never stops at it.

### Tables (roster, fees)
- Desktop: real `<table>` with sticky header row (13 px semibold `--label-2`, nouns, Title Case, no punctuation), sortable columns — clicking a header sorts, clicking again reverses, show a 10 px chevron in the sorted header only; resizable columns via a drag handle; `tbody tr:nth-child(even){background: rgba(0,0,0,.03)}` (alternating rows only for wide multi-column tables); row height 28 px (compact) or 36 px; selected row `background: var(--accent); color:#fff` when the table has focus, `--selection-unemphasized` otherwise; `⌘/Ctrl-click`, `Shift-click` multi-select without an edit mode.
- Phone: the same data as an inset-grouped list: one row per child, title + subtitle (subhead, `--label-2`), trailing value (fees due, right-aligned, tabular numerals `font-variant-numeric: tabular-nums`) and a chevron when the row opens a detail; multi-select only through an explicit Edit button that reveals leading circles.
- Status: never color alone — pair a red/orange/green dot with a word ("Overdue", "Due 12 Sep", "Paid"). Use `--red` only for overdue/destructive, `--orange` for due-soon, `--green` for paid.

### Forms and the side drawer
- Any create/edit = a sheet: desktop `width: 560px; max-height: 85vh; border-radius: 12px` centered with a `rgba(0,0,0,.35)` scrim (macOS sheet), or an inspector/drawer on the trailing edge (`width: 360–420px`) when the list must stay visible. Phone: bottom sheet, full height with a 36×5 px grabber, swipe-down to dismiss, confirm via action sheet if dirty.
- Sheet header bar: Cancel (plain, leading), title (17 px semibold, centered), Save/Done (filled accent, trailing, disabled until valid). Never a Back with a Cancel.
- Body: `Form.grouped` — inset cards; each `.row` = leading label (body, `--label`) + trailing control right-aligned; text inputs borderless inside rows with placeholder in `--label-3`; select menus render as a pop-up (value + chevron.up.chevron.down); booleans as a switch (trailing, 51×31 phone, 26×15 mini on desktop, `--green` when on) — use a checkbox instead on desktop when the setting is part of a hierarchy or list of options; radio group for 2–5 exclusive choices.
- Validation: inline footnote in `--red` under the row, shown on blur for email-like fields, immediately for format errors; numeric fields formatted as ₹ with the locale's grouping on blur.
- Bulk email compose: sheet with To (token field: chips 22 px tall, rounded pill, `--bg-grouped-3`), Subject, body; primary action "Send" trailing; if recipient count > 1 show the count in the button ("Send to 42"); the confirm step is an action sheet listing "Send 42 Emails" (default, not destructive) and "Cancel".

### Menus, popovers, alerts
- Menu: `min-width: 200px; padding: 5px; border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.2)`; items 28 px tall (desktop) / 44 px (phone), 6 px radius highlight in `--accent` with white text on hover/keyboard focus; separators `1px --sep; margin: 5px 0`; Title Case verbs; "…" when more input is needed; destructive item last, red; disabled items `--label-3` but still visible; icons all-or-nothing per group.
- Popover: anchored with an 8 px arrow, `max-width: 360px`, closes on outside click and Esc; desktop only — on phone the same content becomes a bottom sheet.
- Alert: `width: 260px` (phone, centered, 14 px radius) / `width: 420px` (desktop, 10 px radius); title 17 px semibold, message 13 px; buttons row: Cancel leading, default trailing, filled accent; destructive button text `--red` and never default; Esc = Cancel, Enter = default. Use only for uncommon, irreversible actions (delete a ledger, send to all parents).
- Action sheet (phone): bottom stack, destructive red at top, Cancel as a separate bottom card.

### Feedback
- Inline status line under the title ("Synced 2 min ago") instead of toasts; progress bar (determinate, 4 px, accent) in the toolbar for syncs with known counts; indeterminate spinner 16 px only when duration is unknown; skeleton rows (`--bg-grouped-3` bars, 6 px radius) for initial loads over ~300 ms.
- Empty state: centered, icon 48 px `--label-3`, title 17 px semibold, description 13–15 px `--label-2`, one filled button; use it for empty tables, no search results ("No Results for 'x'"), and load failures with a Retry.
- Buttons doing async work swap their label for a 16 px spinner plus "Sending…" and stay disabled; the success state is the list updating, not a modal.
- Undo instead of confirm for common edits (delete a receipt line → "Deleted · Undo" inline for ≥ 5 s, keyboard ⌘Z).

### Accessibility checklist
- Text contrast ≥ 4.5:1 for anything under 18 px, ≥ 3:1 at 18 px+ or bold; test in dark mode.
- `:focus-visible { box-shadow: var(--focus-ring) }` on every control; full keyboard traversal; Esc closes the topmost modal; Enter triggers the sheet's primary.
- `prefers-reduced-motion`: replace slide/scale transitions with 150 ms fades; no bouncing springs.
- Every icon-only button has `aria-label` and a tooltip on hover (desktop); status dots have text.
- Respect browser zoom / font scaling up to 200% without clipping; use `rem`-based tokens so a root font change scales the whole hierarchy in proportion.
