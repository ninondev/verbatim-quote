# Contributing

Pull requests are welcome. The maintainer reads issues on GitHub.

Use Node 22 or later. The project has no dependencies or build step. Run the tests with:

```sh
npm test
```

Wall-clock checks are optional: run `VERBATIM_QUOTE_TIMING=1 npm test` to include them.
The playground is a static page in `docs/`. Keep `docs/verbatim-quote.js` byte-identical to
`index.js` when changing the library.

Before your first pull request can be merged, read [CLA.md](CLA.md) and post this comment
on the pull request:

> I have read the CLA and I agree to it.
