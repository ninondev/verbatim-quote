# Contributing

Pull requests are welcome. The maintainer reads issues on GitHub.

Use Node 22 or later. The project has no dependencies or build step. Run the tests with:

```sh
npm test
```

Wall-clock checks are optional: run `VERBATIM_QUOTE_TIMING=1 npm test` to include them.
The playground is a static page in `docs/`. Keep `docs/verbatim-quote.js` byte-identical to
`index.js` when changing the library.

Contributions are accepted under the MIT License. See [LICENSE](LICENSE).
