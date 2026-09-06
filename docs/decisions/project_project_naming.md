---
name: project-project-naming
description: A project is named by its own file on disk; the name is editable in the header and Drafto never writes over another matter
metadata:
  type: project
---

Decided 2026-09-06. The project's name lives in exactly one place: the file name
on disk. It is NOT stored inside the project JSON, and there is no schema field
for it. Before the first save the typed name waits in header state
(`nameOverride`); the party-derived `getProjectFileName` is only a suggestion,
shown in italics until the user saves or types over it.

Editing the name in the header renames the file on Enter/blur — never per
keystroke. `rename-project-file` in `electron/main.js` is the gatekeeper: it
refuses to overwrite an existing project, refuses while another user's lock is
fresh, allows a capitalisation-only change, reports a missing source so the
caller can save afresh, and carries the `.lock` and both recent-files lists
across. `handleSave` bails out while `renamingRef` is set, or an autosave would
recreate the old name.

Nothing that creates a NEW project file may overwrite one: both the default
folder (`freeFilePath` in the header) and the local projects folder
(`save-project`) fall back to "Name (2)".

**Why:** the file name used to be regenerated from the party names in three
places, so two SLPs for the same parties silently overwrote each other, and
`.dhcwp` existed only to stop a writ colliding with an SLP (CAT was never given
the same protection). Storing the name inside the file would fight a rename done
in Explorer and would land in the undo history.

**How to apply:** never re-derive a file name from the parties — read the header's
`projectName`. Keep a file's extension fixed once it exists, even if the document
type changes. See [[project-release-process]].
