# The Teamcenter API catalog (`structure.js`)

TC SOA Studio reads the Teamcenter Services (SOA) API catalog from **`structure.js`**, the
data file behind the Teamcenter Services API reference that is part of the Teamcenter
documentation. Use the copy that comes with **your licensed** Teamcenter documentation;
this project does not include or distribute it.

## Format

The file is JavaScript of the form `const data = {…}` containing the whole catalog plus
type definitions (about 8–9 MB for Teamcenter 13). The app reads everything after the first
`{` as JSON (see `parseStructureJs` in `src/shared/index.ts`).

```
data[template]["Soa"][library][release][service][operation] = { description, input, output }
```

- `template`: usually `Teamcenter`; add-on templates (e.g. `Mdl0`, `Cpd0`) have their own.
- `release` keys look like `_2013_05` (shown as `2013-05`).
- An `operation` key is real only if it starts with a lower-case letter and isn't numeric.
- Each library may also have an `Internal` branch (internal operations, down-weighted in search).
- `input` / `output` = `{ fieldName: { type, description } }`.
- `type` is a primitive or a `A::B::C` path resolved against `data`; a `[]` suffix = array;
  a `keyType;valueType` definition = a map.
- Primitives: bool, char, double, float, int, void, String, boolean, Date, IModelObject, tag_t.
- Descriptions contain HTML; the app converts them to plain text.

Derived per operation (`src/shared/buildCatalog.ts`):

- `url` = `{library}-{release}-{service}/{operation}` (prefixed `Internal-` for internal ones)
- `include` = `{template}.Soa.{library}._{release}.{service}.{operation}`

Teamcenter 13 contains about 1,470 public operations in ~500 services.
