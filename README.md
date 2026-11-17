# model-router

Picks a model for each turn in the main conversation: Haiku for small jobs (typos, lookups, commit messages), Sonnet for ordinary work, Opus for big ones (refactors, migrations, debugging, design). It decides with a local keyword-and-length check, so the routing itself costs no tokens. Subagents keep their own model.

- `/route`: show the current mode and the last pick
- `/route auto|off|haiku|sonnet|opus`: change the mode (remembered across sessions)

The status line shows the current pick. A continuation turn keeps the previous turn's model so the prompt cache isn't thrown away.

## When a prompt is routed to Opus

- The prompt gets an extra context note telling the model to invoke the `fable-playbook` skill first. The skill must be installed for that to work.
- The `advisorModel` setting reads as `claude-fable-5-2` while that turn runs, then goes back to whatever your settings say.

## Install

At the prompt of a terminal session:

```text
/plugin install model-router --marketplace aamershaikh1990/model-router
```

From a shell:

```bash
claude plugin install model-router --marketplace aamershaikh1990/model-router
```

Answer `y` to add the marketplace, then pick a scope (user scope runs it in every project).
